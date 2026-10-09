package com.ticketrush.catalog.api;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** What an organizer's console reads. Every number is checked against the database, not against another endpoint. */
class OrganizerConsoleIntegrationTest extends OrderTestSupport {

	private ResultActions read(String token, String path) throws Exception {
		return mvc.perform(get("/api/organizer" + path).header("Authorization", bearer(token)));
	}

	private ResultActions scan(String token, String code, Long forEvent) throws Exception {
		String event = forEvent == null ? "" : ",\"eventId\":" + forEvent;
		return mvc.perform(post("/api/tickets/scan").contentType(MediaType.APPLICATION_JSON)
				.content("{\"code\":\"%s\"%s}".formatted(code, event)).header("Authorization", bearer(token)));
	}

	private String firstCode(long orderId) {
		return jdbc.sql("select code from ticket where order_id = :o order by id limit 1").param("o", orderId)
				.query(String.class).single();
	}

	@Test
	void onlyOrganizersCanReadTheConsoleAndOnlyTheirOwnEvents() throws Exception {
		setUpEvent();
		Guest guest = createGuests(1).get(0);
		String other = organizerToken();

		for (String path : List.of("/events", "/venues", "/events/" + eventId + "/summary", "/events/" + eventId + "/scans")) {
			mvc.perform(get("/api/organizer" + path)).andExpect(status().isUnauthorized());
			read(guest.token(), path).andExpect(status().isForbidden());
		}
		read(other, "/events/" + eventId + "/summary").andExpect(status().isForbidden());
		read(other, "/events/" + eventId + "/scans").andExpect(status().isForbidden());
		read(organizer, "/events/987654321/summary").andExpect(status().isNotFound());
		read(organizer, "/events/" + eventId + "/summary").andExpect(status().isOk());
	}

	@Test
	void theSummaryAgreesWithTheDatabaseThroughSalesHoldsAndExpiry() throws Exception {
		setUpEvent();
		List<Guest> guests = createGuests(2);
		long orderId = buyTwo(guests.get(0), 0);   // 2 seats sold at $96 each plus the 7.5% fee
		holdTwo(guests.get(1), 2);                 // 2 more held, not sold

		read(organizer, "/events/" + eventId + "/summary").andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("PUBLISHED"))
				.andExpect(jsonPath("$.tiers.length()").value(1))
				.andExpect(jsonPath("$.tiers[0].name").value("Main"))
				.andExpect(jsonPath("$.tiers[0].priceCents").value(9600))
				.andExpect(jsonPath("$.tiers[0].total").value(10))
				.andExpect(jsonPath("$.tiers[0].sold").value(2))
				.andExpect(jsonPath("$.tiers[0].held").value(2))
				.andExpect(jsonPath("$.tiers[0].available").value(6))
				.andExpect(jsonPath("$.revenue.paidOrders").value(1))
				.andExpect(jsonPath("$.revenue.subtotalCents").value(19200))
				.andExpect(jsonPath("$.revenue.feeCents").value(1440))
				.andExpect(jsonPath("$.revenue.totalCents").value(20640))
				.andExpect(jsonPath("$.ordersByStatus.PAID").value(1))
				.andExpect(jsonPath("$.door.issued").value(2))
				.andExpect(jsonPath("$.door.checkedIn").value(0));
		assertThat(count("select count(*) from event_seat where event_id = :p0 and status = 'SOLD'", eventId)).isEqualTo(2);
		assertThat(count("select coalesce(sum(total_cents), 0) from ticket_order where event_id = :p0 and status = 'PAID'",
				eventId)).isEqualTo(20640);

		// The hold runs out: those seats are available again, with or without the sweeper having run.
		clock.advance(Duration.ofMinutes(11));
		read(organizer, "/events/" + eventId + "/summary")
				.andExpect(jsonPath("$.tiers[0].held").value(0))
				.andExpect(jsonPath("$.tiers[0].sold").value(2))
				.andExpect(jsonPath("$.tiers[0].available").value(8));
		assertThat(orderStatus(orderId)).isEqualTo("PAID");
	}

	@Test
	void myEventsListsDraftsAndPublishedOnesAndNobodyElses() throws Exception {
		String mine = organizerToken();
		String other = organizerToken();
		CatalogFixtures mineFx = new CatalogFixtures(mvc, mine);
		CatalogFixtures.Venue venue = mineFx.createVenue("Montreal");
		Instant onSale = Instant.now().plus(5, ChronoUnit.DAYS);
		Instant starts = Instant.now().plus(30, ChronoUnit.DAYS);
		int draft = mineFx.createDraft(venue, "Draft Show " + UUID.randomUUID(), "Artist", onSale, starts);
		int published = mineFx.createPublished(venue, "Live Show " + UUID.randomUUID(), "Artist", onSale, starts);
		new CatalogFixtures(mvc, other).createOnSaleEvent("Elsewhere-" + UUID.randomUUID(), 1, 3);

		String body = read(mine, "/events").andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
		List<Integer> ids = JsonPath.read(body, "$.items[*].id");
		assertThat(ids).containsExactlyInAnyOrder(draft, published);
		List<Map<String, Object>> rows = JsonPath.read(body, "$.items[?(@.id == " + draft + ")]");
		assertThat(rows.get(0)).containsEntry("status", "DRAFT").containsEntry("capacity", 15).containsEntry("sold", 0)
				.containsEntry("grossCents", 0);
		List<Map<String, Object>> live = JsonPath.read(body, "$.items[?(@.id == " + published + ")]");
		assertThat(live.get(0)).containsEntry("status", "PUBLISHED").containsEntry("capacity", 15);
	}

	@Test
	void aDraftShowsItsTiersWithEverySeatFree() throws Exception {
		String org = organizerToken();
		CatalogFixtures f = new CatalogFixtures(mvc, org);
		int draft = f.createDraft(f.createVenue("Montreal"), "Draft", "Artist", Instant.now().plus(5, ChronoUnit.DAYS),
				Instant.now().plus(30, ChronoUnit.DAYS));
		read(org, "/events/" + draft + "/summary").andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("DRAFT"))
				.andExpect(jsonPath("$.tiers.length()").value(2))
				.andExpect(jsonPath("$.tiers[0].total").value(10))
				.andExpect(jsonPath("$.tiers[0].available").value(10))
				.andExpect(jsonPath("$.tiers[0].sold").value(0));
	}

	@Test
	void everyScanIsRecordedWhateverItsOutcomeAndTheDoorCountFollows() throws Exception {
		setUpEvent();
		String code = firstCode(buyTwo(createGuests(1).get(0), 0));
		CatalogFixtures.Venue venue = fx.createVenue("Montreal");
		int otherEvent = fx.createPublished(venue, "Other", "Artist", Instant.now().plus(5, ChronoUnit.DAYS),
				Instant.now().plus(30, ChronoUnit.DAYS));

		scan(organizer, code, (long) otherEvent).andExpect(jsonPath("$.outcome").value("WRONG_EVENT"));
		scan(organizer, code, (long) eventId).andExpect(jsonPath("$.outcome").value("VALID"));
		scan(organizer, code, (long) eventId).andExpect(jsonPath("$.outcome").value("ALREADY_USED"));
		scan(organizer, "NOSUCHTICKET", (long) eventId).andExpect(jsonPath("$.outcome").value("UNKNOWN"));

		// The wrong-event attempt is the other door's business, the rest are this event's, newest first.
		read(organizer, "/events/" + eventId + "/scans").andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(3))
				.andExpect(jsonPath("$[0].outcome").value("UNKNOWN"))
				.andExpect(jsonPath("$[1].outcome").value("ALREADY_USED"))
				.andExpect(jsonPath("$[1].seat").value("Main A1"))
				.andExpect(jsonPath("$[2].outcome").value("VALID"));
		read(organizer, "/events/" + otherEvent + "/scans").andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].outcome").value("WRONG_EVENT"));
		read(organizer, "/events/" + eventId + "/summary").andExpect(jsonPath("$.door.checkedIn").value(1));
		read(organizer, "/events/" + eventId + "/scans?limit=1").andExpect(jsonPath("$.length()").value(1));
	}

	@Test
	void twentyScannersWithOneTicketAdmitItOnceAndEveryAttemptIsRecorded() throws Exception {
		setUpEvent();
		String code = firstCode(buyTwo(createGuests(1).get(0), 0));

		List<Integer> statuses = race(20, i -> scan(organizer, code, (long) eventId));

		assertThat(statuses).allMatch(s -> s == 200);
		assertThat(count("select count(*) from ticket where code = :p0 and status = 'USED'", code)).isEqualTo(1);
		assertThat(count("select count(*) from scan_attempt where event_id = :p0 and outcome = 'VALID'", eventId)).isEqualTo(1);
		assertThat(count("select count(*) from scan_attempt where event_id = :p0 and outcome = 'ALREADY_USED'", eventId))
				.isEqualTo(19);
	}

	@Test
	void anOrganizerListsOnlyTheirOwnVenues() throws Exception {
		String mine = organizerToken();
		String other = organizerToken();
		String name = "Hall " + UUID.randomUUID();
		mvc.perform(post("/api/venues").contentType(MediaType.APPLICATION_JSON).header("Authorization", bearer(mine))
				.content("{\"name\":\"%s\",\"city\":\"Montreal\",\"sections\":[{\"name\":\"Floor\",\"rows\":2,\"seatsPerRow\":3}]}"
						.formatted(name)))
				.andExpect(status().isCreated());

		read(mine, "/venues").andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].name").value(name)).andExpect(jsonPath("$[0].totalSeats").value(6))
				.andExpect(jsonPath("$[0].sections[0].name").value("Floor"));
		read(other, "/venues").andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
	}

}
