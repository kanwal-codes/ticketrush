package com.ticketrush.catalog.api;

import com.jayway.jsonpath.JsonPath;
import com.ticketrush.AbstractIntegrationTest;
import com.ticketrush.catalog.api.CatalogFixtures.Venue;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static com.ticketrush.catalog.api.CatalogFixtures.SEATS;
import static com.ticketrush.catalog.api.CatalogFixtures.eventJson;
import static com.ticketrush.catalog.api.CatalogFixtures.prices;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class EventLifecycleIntegrationTest extends AbstractIntegrationTest {

	private static final Instant ON_SALE = Instant.now().plus(2, ChronoUnit.DAYS);
	private static final Instant STARTS = Instant.now().plus(30, ChronoUnit.DAYS);

	int inventoryRows(int eventId) {
		return jdbc.sql("select count(*) from event_seat where event_id = :e and status = 'AVAILABLE'")
				.param("e", eventId).query(Integer.class).single();
	}

	@Test
	void draftThenPublishCreatesOneInventoryRowPerSeatAndPublishingTwiceIsHarmless() throws Exception {
		CatalogFixtures fx = new CatalogFixtures(mvc, organizerToken());
		int eventId = fx.createDraft(fx.createVenue("Montreal"), "Afterlight Tour", "Mira Okafor", ON_SALE, STARTS);
		assertThat(inventoryRows(eventId)).isZero();

		fx.send("/api/events/" + eventId + "/publish", null).andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("PUBLISHED"));
		assertThat(inventoryRows(eventId)).isEqualTo(SEATS);

		fx.send("/api/events/" + eventId + "/publish", null).andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("PUBLISHED"));
		assertThat(inventoryRows(eventId)).isEqualTo(SEATS);
	}

	@Test
	void simultaneousPublishesStillCreateEachSeatExactlyOnce() throws Exception {
		CatalogFixtures fx = new CatalogFixtures(mvc, organizerToken());
		int eventId = fx.createDraft(fx.createVenue("Montreal"), "Afterlight Tour", "Mira Okafor", ON_SALE, STARTS);

		CountDownLatch start = new CountDownLatch(1);
		List<Future<Integer>> results = new ArrayList<>();
		try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
			for (int i = 0; i < 6; i++) {
				results.add(pool.submit(() -> {
					start.await();
					return fx.send("/api/events/" + eventId + "/publish", null).andReturn().getResponse().getStatus();
				}));
			}
			start.countDown();
		}
		for (Future<Integer> result : results) {
			assertThat(result.get()).isEqualTo(200);
		}
		assertThat(inventoryRows(eventId)).isEqualTo(SEATS);
	}

	@Test
	void everySectionMustBePricedBeforePublishing() throws Exception {
		CatalogFixtures fx = new CatalogFixtures(mvc, organizerToken());
		Venue venue = fx.createVenue("Montreal");
		String floorOnly = """
				[{"sectionId":%d,"priceCents":12800}]""".formatted(venue.floorId());
		int eventId = JsonPath.read(fx.send("/api/events",
				eventJson(venue, "Afterlight Tour", "Mira Okafor", floorOnly, ON_SALE, STARTS))
				.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");

		fx.send("/api/events/" + eventId + "/publish", null).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("Every section needs a price. Missing: Balcony"));
		assertThat(inventoryRows(eventId)).isZero();
	}

	@Test
	void onlyTheOwnerCanPublishOrCancel() throws Exception {
		CatalogFixtures fx = new CatalogFixtures(mvc, organizerToken());
		int eventId = fx.createDraft(fx.createVenue("Montreal"), "Afterlight Tour", "Mira Okafor", ON_SALE, STARTS);

		String other = organizerToken();
		fx.send(other, "/api/events/" + eventId + "/publish", null).andExpect(status().isForbidden());
		fx.send(other, "/api/events/" + eventId + "/cancel", null).andExpect(status().isForbidden());
		fx.send(guestToken(), "/api/events/" + eventId + "/publish", null).andExpect(status().isForbidden());
		fx.send(null, "/api/events/" + eventId + "/publish", null).andExpect(status().isUnauthorized());
		fx.send("/api/events/999999/publish", null).andExpect(status().isNotFound());
	}

	@Test
	void invalidEventsAreRejectedWithAClearReason() throws Exception {
		CatalogFixtures fx = new CatalogFixtures(mvc, organizerToken());
		Venue venue = fx.createVenue("Montreal");
		Instant now = Instant.now();

		// Tickets go on sale after the event starts.
		fx.send("/api/events", eventJson(venue, "T", "A", prices(venue), now.plus(40, ChronoUnit.DAYS),
				now.plus(30, ChronoUnit.DAYS))).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("Tickets must go on sale before the event starts"));

		// The event is already over.
		fx.send("/api/events", eventJson(venue, "T", "A", prices(venue), now.minus(10, ChronoUnit.DAYS),
				now.minus(5, ChronoUnit.DAYS))).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("The event must start in the future"));

		// A price for a section of some other venue.
		String foreign = """
				[{"sectionId":%d,"priceCents":100}]""".formatted(fx.createVenue("Montreal").floorId());
		fx.send("/api/events", eventJson(venue, "T", "A", foreign, now.plus(2, ChronoUnit.DAYS), STARTS))
				.andExpect(status().isBadRequest());

		// A bad color and a zero price list each field.
		String bad = eventJson(venue, "T", "A", "[{\"sectionId\":1,\"priceCents\":0}]", ON_SALE, STARTS)
				.replace("#2B2FD9", "blue");
		fx.send("/api/events", bad).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors['poster.inkOne']").exists())
				.andExpect(jsonPath("$.errors['prices[0].priceCents']").exists());
	}

	@Test
	void cancellingIsFinalAndRepeatable() throws Exception {
		CatalogFixtures fx = new CatalogFixtures(mvc, organizerToken());
		int eventId = fx.createPublished(fx.createVenue("Montreal"), "Afterlight Tour", "Mira Okafor", ON_SALE, STARTS);

		fx.send("/api/events/" + eventId + "/cancel", null).andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("CANCELLED"));
		fx.send("/api/events/" + eventId + "/cancel", null).andExpect(status().isOk());
		fx.send("/api/events/" + eventId + "/publish", null).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("A cancelled event cannot be published"));
	}

}
