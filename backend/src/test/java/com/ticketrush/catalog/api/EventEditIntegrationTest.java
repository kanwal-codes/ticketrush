package com.ticketrush.catalog.api;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Editing a draft under the create rules, reading it back for the form, and paging the organizer's list. */
class EventEditIntegrationTest extends OrderTestSupport {

	private final Instant onSale = Instant.now().plus(5, ChronoUnit.DAYS);
	private final Instant starts = Instant.now().plus(30, ChronoUnit.DAYS);

	private ResultActions edit(String token, int id, String json) throws Exception {
		return mvc.perform(put("/api/events/" + id).contentType(MediaType.APPLICATION_JSON).content(json)
				.header("Authorization", bearer(token)));
	}

	private ResultActions read(String token, String path) throws Exception {
		return mvc.perform(get("/api/organizer" + path).header("Authorization", bearer(token)));
	}

	@Test
	void aDraftIsReplacedAndReadBackWithItsNewPrices() throws Exception {
		String org = organizerToken();
		CatalogFixtures fx = new CatalogFixtures(mvc, org);
		CatalogFixtures.Venue venue = fx.createVenue("Montreal");
		int id = fx.createDraft(venue, "Old title", "Old artist", onSale, starts);

		String prices = "[{\"sectionId\":%d,\"priceCents\":7000},{\"sectionId\":%d,\"priceCents\":4500}]".formatted(venue.floorId(), venue.balconyId());
		String json = CatalogFixtures.eventJson(venue, "New title", "New artist", prices, onSale.plus(1, ChronoUnit.DAYS), starts);
		edit(org, id, json).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("DRAFT"));

		read(org, "/events/" + id).andExpect(status().isOk())
				.andExpect(jsonPath("$.title").value("New title"))
				.andExpect(jsonPath("$.artist").value("New artist"))
				.andExpect(jsonPath("$.venueId").value(venue.id()))
				.andExpect(jsonPath("$.poster.style").value("ORBIT"))
				.andExpect(jsonPath("$.prices.length()").value(2))
				.andExpect(jsonPath("$.prices[?(@.sectionId == %d)].priceCents".formatted(venue.floorId())).value(7000))
				.andExpect(jsonPath("$.waitingRoom").value(false));
		assertThat(count("select count(*) from event_price where event_id = :p0", id)).isEqualTo(2);
	}

	@Test
	void editingFollowsTheCreateRulesInTheSameWords() throws Exception {
		String org = organizerToken();
		CatalogFixtures fx = new CatalogFixtures(mvc, org);
		CatalogFixtures.Venue venue = fx.createVenue("Montreal");
		int id = fx.createDraft(venue, "Draft", "Artist", onSale, starts);

		edit(org, id, CatalogFixtures.eventJson(venue, "Draft", "Artist", CatalogFixtures.prices(venue), onSale, Instant.now().minus(1, ChronoUnit.DAYS)))
				.andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("Tickets must go on sale before the event starts"));
		edit(org, id, CatalogFixtures.eventJson(venue, "Draft", "Artist", "[{\"sectionId\":999999,\"priceCents\":100}]", onSale, starts))
				.andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("Section 999999 is not part of this venue"));
		edit(org, id, CatalogFixtures.eventJson(venue, "", "Artist", CatalogFixtures.prices(venue), onSale, starts))
				.andExpect(status().isBadRequest());
		read(org, "/events/" + id).andExpect(jsonPath("$.title").value("Draft")); // nothing changed
	}

	@Test
	void onlyADraftCanBeEdited() throws Exception {
		String org = organizerToken();
		CatalogFixtures fx = new CatalogFixtures(mvc, org);
		CatalogFixtures.Venue venue = fx.createVenue("Montreal");
		int published = fx.createPublished(venue, "Live", "Artist", onSale, starts);

		edit(org, published, CatalogFixtures.eventJson(venue, "Changed", "Artist", CatalogFixtures.prices(venue), onSale, starts))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail").value("Only a draft can be edited. Cancel this event and create a new one instead."));
		read(org, "/events/" + published).andExpect(jsonPath("$.title").value("Live"));
	}

	@Test
	void guestsAndOtherOrganizersCannotEditOrReadADraft() throws Exception {
		String org = organizerToken();
		CatalogFixtures fx = new CatalogFixtures(mvc, org);
		CatalogFixtures.Venue venue = fx.createVenue("Montreal");
		int id = fx.createDraft(venue, "Mine", "Artist", onSale, starts);
		String json = CatalogFixtures.eventJson(venue, "Taken over", "Artist", CatalogFixtures.prices(venue), onSale, starts);

		edit(organizerToken(), id, json).andExpect(status().isForbidden());
		edit(createGuests(1).get(0).token(), id, json).andExpect(status().isForbidden());
		mvc.perform(put("/api/events/" + id).contentType(MediaType.APPLICATION_JSON).content(json)).andExpect(status().isUnauthorized());
		read(organizerToken(), "/events/" + id).andExpect(status().isForbidden());
		read(org, "/events/987654321").andExpect(status().isNotFound());
		read(org, "/events/" + id).andExpect(jsonPath("$.title").value("Mine"));
	}

	@Test
	void theEventsListIsPagedNewestFirstAndSizeIsClamped() throws Exception {
		String org = organizerToken();
		CatalogFixtures fx = new CatalogFixtures(mvc, org);
		CatalogFixtures.Venue venue = fx.createVenue("Montreal");
		String tag = UUID.randomUUID().toString().substring(0, 8);
		int a = fx.createDraft(venue, "A " + tag, "Artist", onSale, starts.plus(1, ChronoUnit.DAYS));
		int b = fx.createDraft(venue, "B " + tag, "Artist", onSale, starts.plus(2, ChronoUnit.DAYS));
		int c = fx.createDraft(venue, "C " + tag, "Artist", onSale, starts.plus(3, ChronoUnit.DAYS));

		String first = read(org, "/events?size=2&page=0").andExpect(status().isOk())
				.andExpect(jsonPath("$.totalItems").value(3)).andExpect(jsonPath("$.totalPages").value(2))
				.andExpect(jsonPath("$.size").value(2)).andExpect(jsonPath("$.items.length()").value(2))
				.andReturn().getResponse().getContentAsString();
		assertThat(JsonPath.<List<Integer>>read(first, "$.items[*].id")).containsExactly(c, b);
		read(org, "/events?size=2&page=1").andExpect(jsonPath("$.items.length()").value(1))
				.andExpect(jsonPath("$.items[0].id").value(a));
		read(org, "/events?size=2&page=5").andExpect(jsonPath("$.items.length()").value(0))
				.andExpect(jsonPath("$.totalItems").value(3));
		read(org, "/events?size=1000").andExpect(jsonPath("$.size").value(50));
		read(org, "/events?size=0&page=-3").andExpect(jsonPath("$.size").value(1)).andExpect(jsonPath("$.page").value(0));
	}

}
