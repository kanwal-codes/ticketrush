package com.ticketrush.catalog.api;

import com.ticketrush.AbstractIntegrationTest;
import com.ticketrush.catalog.api.CatalogFixtures.Venue;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static com.ticketrush.catalog.api.CatalogFixtures.SEATS;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class EventQueryIntegrationTest extends AbstractIntegrationTest {

	private static Instant in(long days) {
		return Instant.now().plus(days, ChronoUnit.DAYS);
	}

	private static String uniqueCity() {
		return "City" + UUID.randomUUID().toString().substring(0, 8);
	}

	@Test
	void listShowsOnlyPublishedUpcomingEventsInStartOrderAndFiltersByCityAndText() throws Exception {
		CatalogFixtures fx = new CatalogFixtures(mvc, organizerToken());
		String city = uniqueCity();
		Venue here = fx.createVenue(city);
		fx.createPublished(here, "Late Show", "Mira Okafor", in(2), in(40));
		fx.createPublished(here, "Early Show", "Northern Lights Orchestra", in(2), in(20));
		fx.createDraft(here, "Hidden Draft", "Nobody", in(2), in(10));
		fx.createPublished(fx.createVenue(uniqueCity()), "Elsewhere", "Mira Okafor", in(2), in(15));

		mvc.perform(get("/api/events").param("city", city.toLowerCase()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.totalItems").value(2))
				.andExpect(jsonPath("$.items[0].title").value("Early Show"))
				.andExpect(jsonPath("$.items[1].title").value("Late Show"))
				.andExpect(jsonPath("$.items[0].fromAllInCents").value(6880))
				.andExpect(jsonPath("$.items[0].poster.style").value("ORBIT"));

		mvc.perform(get("/api/events").param("city", city).param("q", "ORCHESTRA"))
				.andExpect(jsonPath("$.totalItems").value(1))
				.andExpect(jsonPath("$.items[0].title").value("Early Show"));

		// A percent sign in the search is text, not a wildcard.
		mvc.perform(get("/api/events").param("city", city).param("q", "%"))
				.andExpect(jsonPath("$.totalItems").value(0));
	}

	@Test
	void listIsPaged() throws Exception {
		CatalogFixtures fx = new CatalogFixtures(mvc, organizerToken());
		String city = uniqueCity();
		Venue venue = fx.createVenue(city);
		for (int i = 1; i <= 3; i++) {
			fx.createPublished(venue, "Show " + i, "Artist", in(2), in(10 + i));
		}

		mvc.perform(get("/api/events").param("city", city).param("size", "2"))
				.andExpect(jsonPath("$.items.length()").value(2))
				.andExpect(jsonPath("$.totalItems").value(3))
				.andExpect(jsonPath("$.totalPages").value(2));
		mvc.perform(get("/api/events").param("city", city).param("size", "2").param("page", "1"))
				.andExpect(jsonPath("$.items.length()").value(1))
				.andExpect(jsonPath("$.items[0].title").value("Show 3"));
	}

	@Test
	void detailShowsAllInPricesSaleStateAndServerTime() throws Exception {
		CatalogFixtures fx = new CatalogFixtures(mvc, organizerToken());
		Venue venue = fx.createVenue(uniqueCity());
		int upcoming = fx.createPublished(venue, "Upcoming", "Artist", in(2), in(30));
		int queue = fx.createPublished(venue, "Queue", "Artist", Instant.now().plus(5, ChronoUnit.MINUTES), in(30));
		int onSale = fx.createPublished(venue, "On sale", "Artist", Instant.now().minus(1, ChronoUnit.HOURS), in(30));

		mvc.perform(get("/api/events/" + upcoming))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.saleState").value("UPCOMING"))
				.andExpect(jsonPath("$.serverTime").exists())
				.andExpect(jsonPath("$.venueName").value("Test Hall"))
				.andExpect(jsonPath("$.totalSeats").value(SEATS))
				.andExpect(jsonPath("$.availableSeats").value(SEATS))
				.andExpect(jsonPath("$.tiers[0].name").value("Floor"))
				.andExpect(jsonPath("$.tiers[0].faceCents").value(12800))
				.andExpect(jsonPath("$.tiers[0].feeCents").value(960))
				.andExpect(jsonPath("$.tiers[0].allInCents").value(13760))
				.andExpect(jsonPath("$.tiers[0].totalSeats").value(10))
				.andExpect(jsonPath("$.tiers[1].name").value("Balcony"))
				.andExpect(jsonPath("$.tiers[1].allInCents").value(6880));
		mvc.perform(get("/api/events/" + queue)).andExpect(jsonPath("$.saleState").value("QUEUE_OPEN"));
		mvc.perform(get("/api/events/" + onSale)).andExpect(jsonPath("$.saleState").value("ON_SALE"));
	}

	@Test
	void draftsCancelledAndUnknownEventsAreNotFound() throws Exception {
		CatalogFixtures fx = new CatalogFixtures(mvc, organizerToken());
		Venue venue = fx.createVenue(uniqueCity());
		int draft = fx.createDraft(venue, "Draft", "Artist", in(2), in(30));
		int cancelled = fx.createPublished(venue, "Cancelled", "Artist", in(2), in(30));
		fx.send("/api/events/" + cancelled + "/cancel", null).andExpect(status().isOk());

		for (int id : new int[] { draft, cancelled, 999999 }) {
			mvc.perform(get("/api/events/" + id)).andExpect(status().isNotFound());
			mvc.perform(get("/api/events/" + id + "/seats")).andExpect(status().isNotFound());
		}
	}

	@Test
	void seatMapGroupsSeatsBySectionAndRowAndReflectsAvailability() throws Exception {
		CatalogFixtures fx = new CatalogFixtures(mvc, organizerToken());
		Venue venue = fx.createVenue(uniqueCity());
		int eventId = fx.createPublished(venue, "Mapped", "Artist", in(2), in(30));

		mvc.perform(get("/api/events/" + eventId + "/seats"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.sections.length()").value(2))
				.andExpect(jsonPath("$.sections[0].name").value("Floor"))
				.andExpect(jsonPath("$.sections[0].rows.length()").value(2))
				.andExpect(jsonPath("$.sections[0].rows[0].label").value("A"))
				.andExpect(jsonPath("$.sections[0].rows[0].seats.length()").value(5))
				.andExpect(jsonPath("$.sections[0].rows[0].seats[0].number").value(1))
				.andExpect(jsonPath("$.sections[0].rows[0].seats[0].status").value("AVAILABLE"))
				.andExpect(jsonPath("$.sections[1].name").value("Balcony"));

		mvc.perform(get("/api/events/" + eventId + "/seats").param("section", String.valueOf(venue.balconyId())))
				.andExpect(jsonPath("$.sections.length()").value(1))
				.andExpect(jsonPath("$.sections[0].name").value("Balcony"));

		jdbc.sql("update event_seat set status = 'SOLD' where event_id = :e and seat_id = "
				+ "(select min(vs.id) from venue_seat vs where vs.section_id = :s)")
				.param("e", eventId).param("s", venue.floorId()).update();
		mvc.perform(get("/api/events/" + eventId + "/seats"))
				.andExpect(jsonPath("$.sections[0].rows[0].seats[0].status").value("SOLD"));
		mvc.perform(get("/api/events/" + eventId))
				.andExpect(jsonPath("$.availableSeats").value(SEATS - 1))
				.andExpect(jsonPath("$.tiers[0].availableSeats").value(9));
	}

	@Test
	void publicResponsesCarryShortCacheHeadersAndAnETagThatAnswers304() throws Exception {
		CatalogFixtures fx = new CatalogFixtures(mvc, organizerToken());
		int eventId = fx.createPublished(fx.createVenue(uniqueCity()), "Cached", "Artist", in(2), in(30));

		MvcResult first = mvc.perform(get("/api/events/" + eventId + "/seats"))
				.andExpect(status().isOk())
				.andExpect(header().string("Cache-Control", containsString("max-age=5")))
				.andExpect(header().string("Cache-Control", containsString("public")))
				.andExpect(header().exists("ETag")).andReturn();
		String etag = first.getResponse().getHeader("ETag");
		assertThat(etag).isNotBlank();

		mvc.perform(get("/api/events/" + eventId + "/seats").header("If-None-Match", etag))
				.andExpect(status().isNotModified());
	}

}
