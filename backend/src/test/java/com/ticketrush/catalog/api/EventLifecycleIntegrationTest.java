package com.ticketrush.catalog.api;

import com.jayway.jsonpath.JsonPath;
import com.ticketrush.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class EventLifecycleIntegrationTest extends AbstractIntegrationTest {

	/** A venue with Floor (2 rows x 5 = 10 seats) and Balcony (1 row x 5 = 5 seats). */
	record Venue(int id, int floorId, int balconyId) {
	}

	Venue createVenue(String token) throws Exception {
		String body = mvc.perform(post("/api/venues").header("Authorization", bearer(token))
				.contentType(MediaType.APPLICATION_JSON).content("""
						{"name":"Test Hall","city":"Montreal","sections":[
						 {"name":"Floor","rows":2,"seatsPerRow":5},{"name":"Balcony","rows":1,"seatsPerRow":5}]}"""))
				.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
		return new Venue(JsonPath.read(body, "$.id"), JsonPath.read(body, "$.sections[0].id"),
				JsonPath.read(body, "$.sections[1].id"));
	}

	static String eventJson(Venue venue, String prices, Instant onSaleAt, Instant startsAt) {
		return """
				{"title":"Afterlight Tour","artist":"Mira Okafor","description":"Two hours of new songs.",
				 "venueId":%d,"startsAt":"%s","doorsAt":"%s","dropOpensAt":"%s","onSaleAt":"%s",
				 "poster":{"style":"ORBIT","inkOne":"#2B2FD9","inkTwo":"#FF5A36","paperColor":"#FFD9C4"},
				 "prices":%s}""".formatted(venue.id(), startsAt, startsAt.minus(1, ChronoUnit.HOURS),
				onSaleAt.minus(10, ChronoUnit.MINUTES), onSaleAt, prices);
	}

	static String bothSectionsPriced(Venue v) {
		return """
				[{"sectionId":%d,"priceCents":12800},{"sectionId":%d,"priceCents":6400}]""".formatted(v.floorId(),
				v.balconyId());
	}

	ResultActions send(String token, String url, String json) throws Exception {
		var request = post(url).contentType(MediaType.APPLICATION_JSON);
		if (json != null) {
			request.content(json);
		}
		if (token != null) {
			request.header("Authorization", bearer(token));
		}
		return mvc.perform(request);
	}

	int createDraft(String token, Venue venue) throws Exception {
		Instant onSale = Instant.now().plus(2, ChronoUnit.DAYS);
		String body = send(token, "/api/events", eventJson(venue, bothSectionsPriced(venue), onSale,
				onSale.plus(30, ChronoUnit.DAYS))).andExpect(status().isCreated())
				.andExpect(jsonPath("$.status").value("DRAFT")).andReturn().getResponse().getContentAsString();
		return JsonPath.read(body, "$.id");
	}

	int inventoryRows(int eventId) {
		return jdbc.sql("select count(*) from event_seat where event_id = :e and status = 'AVAILABLE'")
				.param("e", eventId).query(Integer.class).single();
	}

	@Test
	void draftThenPublishCreatesOneInventoryRowPerSeatAndPublishingTwiceIsHarmless() throws Exception {
		String token = organizerToken();
		int eventId = createDraft(token, createVenue(token));
		assertThat(inventoryRows(eventId)).isZero();

		send(token, "/api/events/" + eventId + "/publish", null).andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("PUBLISHED"));
		assertThat(inventoryRows(eventId)).isEqualTo(15);

		send(token, "/api/events/" + eventId + "/publish", null).andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("PUBLISHED"));
		assertThat(inventoryRows(eventId)).isEqualTo(15);
	}

	@Test
	void simultaneousPublishesStillCreateEachSeatExactlyOnce() throws Exception {
		String token = organizerToken();
		int eventId = createDraft(token, createVenue(token));

		CountDownLatch start = new CountDownLatch(1);
		List<Future<Integer>> results = new ArrayList<>();
		try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
			for (int i = 0; i < 6; i++) {
				results.add(pool.submit(() -> {
					start.await();
					return send(token, "/api/events/" + eventId + "/publish", null).andReturn().getResponse()
							.getStatus();
				}));
			}
			start.countDown();
		}
		for (Future<Integer> result : results) {
			assertThat(result.get()).isEqualTo(200);
		}
		assertThat(inventoryRows(eventId)).isEqualTo(15);
	}

	@Test
	void everySectionMustBePricedBeforePublishing() throws Exception {
		String token = organizerToken();
		Venue venue = createVenue(token);
		Instant onSale = Instant.now().plus(2, ChronoUnit.DAYS);
		String floorOnly = """
				[{"sectionId":%d,"priceCents":12800}]""".formatted(venue.floorId());
		int eventId = JsonPath.read(send(token, "/api/events",
				eventJson(venue, floorOnly, onSale, onSale.plus(30, ChronoUnit.DAYS)))
				.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");

		send(token, "/api/events/" + eventId + "/publish", null).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("Every section needs a price. Missing: Balcony"));
		assertThat(inventoryRows(eventId)).isZero();
	}

	@Test
	void onlyTheOwnerCanPublishOrCancel() throws Exception {
		String owner = organizerToken();
		int eventId = createDraft(owner, createVenue(owner));

		String other = organizerToken();
		send(other, "/api/events/" + eventId + "/publish", null).andExpect(status().isForbidden());
		send(other, "/api/events/" + eventId + "/cancel", null).andExpect(status().isForbidden());
		send(guestToken(), "/api/events/" + eventId + "/publish", null).andExpect(status().isForbidden());
		send(null, "/api/events/" + eventId + "/publish", null).andExpect(status().isUnauthorized());
		send(owner, "/api/events/999999/publish", null).andExpect(status().isNotFound());
	}

	@Test
	void invalidEventsAreRejectedWithAClearReason() throws Exception {
		String token = organizerToken();
		Venue venue = createVenue(token);
		Instant now = Instant.now();

		// Tickets go on sale after the event starts.
		send(token, "/api/events", eventJson(venue, bothSectionsPriced(venue), now.plus(40, ChronoUnit.DAYS),
				now.plus(30, ChronoUnit.DAYS))).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("Tickets must go on sale before the event starts"));

		// The event is already over.
		send(token, "/api/events", eventJson(venue, bothSectionsPriced(venue), now.minus(10, ChronoUnit.DAYS),
				now.minus(5, ChronoUnit.DAYS))).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("The event must start in the future"));

		// A price for a section of some other venue.
		String foreign = """
				[{"sectionId":%d,"priceCents":100}]""".formatted(createVenue(token).floorId());
		send(token, "/api/events", eventJson(venue, foreign, now.plus(2, ChronoUnit.DAYS),
				now.plus(30, ChronoUnit.DAYS))).andExpect(status().isBadRequest());

		// A bad color and a zero price list each field.
		String bad = eventJson(venue, "[{\"sectionId\":1,\"priceCents\":0}]", now.plus(2, ChronoUnit.DAYS),
				now.plus(30, ChronoUnit.DAYS)).replace("#2B2FD9", "blue");
		send(token, "/api/events", bad).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors['poster.inkOne']").exists())
				.andExpect(jsonPath("$.errors['prices[0].priceCents']").exists());
	}

	@Test
	void cancellingIsFinalAndRepeatable() throws Exception {
		String token = organizerToken();
		int eventId = createDraft(token, createVenue(token));
		send(token, "/api/events/" + eventId + "/publish", null).andExpect(status().isOk());

		send(token, "/api/events/" + eventId + "/cancel", null).andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("CANCELLED"));
		send(token, "/api/events/" + eventId + "/cancel", null).andExpect(status().isOk());
		send(token, "/api/events/" + eventId + "/publish", null).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("A cancelled event cannot be published"));
	}

}
