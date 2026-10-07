package com.ticketrush.catalog.api;

import com.jayway.jsonpath.JsonPath;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Builds venues and events through the real API, as an organizer would. */
final class CatalogFixtures {

	/** Floor is 2 rows x 5 seats = 10, Balcony is 1 row x 5 seats = 5. Fifteen seats in all. */
	record Venue(int id, int floorId, int balconyId) {
	}

	static final int SEATS = 15;

	private final MockMvc mvc;
	private final String token;

	CatalogFixtures(MockMvc mvc, String token) {
		this.mvc = mvc;
		this.token = token;
	}

	Venue createVenue(String city) throws Exception {
		String body = send("/api/venues", """
				{"name":"Test Hall","city":"%s","sections":[
				 {"name":"Floor","rows":2,"seatsPerRow":5},{"name":"Balcony","rows":1,"seatsPerRow":5}]}""".formatted(city))
				.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
		return new Venue(JsonPath.read(body, "$.id"), JsonPath.read(body, "$.sections[0].id"),
				JsonPath.read(body, "$.sections[1].id"));
	}

	static String prices(Venue v) {
		return """
				[{"sectionId":%d,"priceCents":12800},{"sectionId":%d,"priceCents":6400}]""".formatted(v.floorId(),
				v.balconyId());
	}

	static String eventJson(Venue venue, String title, String artist, String prices, Instant onSaleAt,
			Instant startsAt) {
		return """
				{"title":"%s","artist":"%s","description":"Two hours of new songs.",
				 "venueId":%d,"startsAt":"%s","doorsAt":"%s","dropOpensAt":"%s","onSaleAt":"%s",
				 "poster":{"style":"ORBIT","inkOne":"#2B2FD9","inkTwo":"#FF5A36","paperColor":"#FFD9C4"},
				 "prices":%s}""".formatted(title, artist, venue.id(), startsAt, startsAt.minus(1, ChronoUnit.HOURS),
				onSaleAt.minus(10, ChronoUnit.MINUTES), onSaleAt, prices);
	}

	int createDraft(Venue venue, String title, String artist, Instant onSaleAt, Instant startsAt) throws Exception {
		String body = send("/api/events", eventJson(venue, title, artist, prices(venue), onSaleAt, startsAt))
				.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
		return JsonPath.read(body, "$.id");
	}

	int createPublished(Venue venue, String title, String artist, Instant onSaleAt, Instant startsAt)
			throws Exception {
		int id = createDraft(venue, title, artist, onSaleAt, startsAt);
		send("/api/events/" + id + "/publish", null).andExpect(status().isOk());
		return id;
	}

	ResultActions send(String url, String json) throws Exception {
		return send(token, url, json);
	}

	ResultActions send(String asToken, String url, String json) throws Exception {
		MockHttpServletRequestBuilder request = post(url).contentType(MediaType.APPLICATION_JSON);
		if (json != null) {
			request.content(json);
		}
		if (asToken != null) {
			request.header("Authorization", "Bearer " + asToken);
		}
		return mvc.perform(request);
	}

}
