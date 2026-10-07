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
public final class CatalogFixtures {

	/** Floor is 2 rows x 5 seats = 10, Balcony is 1 row x 5 seats = 5. Fifteen seats in all. */
	public record Venue(int id, int floorId, int balconyId) {
	}

	public static final int SEATS = 15;

	private final MockMvc mvc;
	private final String token;

	public CatalogFixtures(MockMvc mvc, String token) {
		this.mvc = mvc;
		this.token = token;
	}

	public Venue createVenue(String city) throws Exception {
		String body = send("/api/venues", """
				{"name":"Test Hall","city":"%s","sections":[
				 {"name":"Floor","rows":2,"seatsPerRow":5},{"name":"Balcony","rows":1,"seatsPerRow":5}]}""".formatted(city))
				.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
		return new Venue(JsonPath.read(body, "$.id"), JsonPath.read(body, "$.sections[0].id"),
				JsonPath.read(body, "$.sections[1].id"));
	}

	public static String prices(Venue v) {
		return """
				[{"sectionId":%d,"priceCents":12800},{"sectionId":%d,"priceCents":6400}]""".formatted(v.floorId(),
				v.balconyId());
	}

	public static String eventJson(Venue venue, String title, String artist, String prices, Instant onSaleAt,
			Instant startsAt) {
		return """
				{"title":"%s","artist":"%s","description":"Two hours of new songs.",
				 "venueId":%d,"startsAt":"%s","doorsAt":"%s","dropOpensAt":"%s","onSaleAt":"%s",
				 "poster":{"style":"ORBIT","inkOne":"#2B2FD9","inkTwo":"#FF5A36","paperColor":"#FFD9C4"},
				 "prices":%s}""".formatted(title, artist, venue.id(), startsAt, startsAt.minus(1, ChronoUnit.HOURS),
				onSaleAt.minus(10, ChronoUnit.MINUTES), onSaleAt, prices);
	}

	/** A published event with a waiting room. Standard 15-seat venue. */
	public int createQueued(Venue venue, String title, String artist, Instant onSaleAt, Instant startsAt) throws Exception {
		String json = eventJson(venue, title, artist, prices(venue), onSaleAt, startsAt).replaceFirst("\\{",
				"{\"waitingRoom\":true,");
		String body = send("/api/events", json).andExpect(status().isCreated()).andReturn().getResponse()
				.getContentAsString();
		int id = JsonPath.read(body, "$.id");
		send("/api/events/" + id + "/publish", null).andExpect(status().isOk());
		return id;
	}

	public int createDraft(Venue venue, String title, String artist, Instant onSaleAt, Instant startsAt) throws Exception {
		String body = send("/api/events", eventJson(venue, title, artist, prices(venue), onSaleAt, startsAt))
				.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
		return JsonPath.read(body, "$.id");
	}

	public int createPublished(Venue venue, String title, String artist, Instant onSaleAt, Instant startsAt)
			throws Exception {
		int id = createDraft(venue, title, artist, onSaleAt, startsAt);
		send("/api/events/" + id + "/publish", null).andExpect(status().isOk());
		return id;
	}

	/** A venue with one section of rows x seatsPerRow, and a published event that is on sale now. */
	public int createOnSaleEvent(String city, int rows, int seatsPerRow) throws Exception {
		String body = send("/api/venues", """
				{"name":"Big Hall","city":"%s","sections":[{"name":"Main","rows":%d,"seatsPerRow":%d}]}"""
				.formatted(city, rows, seatsPerRow)).andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString();
		Venue venue = new Venue(JsonPath.read(body, "$.id"), JsonPath.read(body, "$.sections[0].id"), -1);
		String prices = """
				[{"sectionId":%d,"priceCents":9600}]""".formatted(venue.floorId());
		Instant now = Instant.now();
		String eventBody = send("/api/events", eventJson(venue, "Big Show", "Artist", prices,
				now.minus(1, ChronoUnit.HOURS), now.plus(30, ChronoUnit.DAYS))).andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString();
		int id = JsonPath.read(eventBody, "$.id");
		send("/api/events/" + id + "/publish", null).andExpect(status().isOk());
		return id;
	}

	/** Seat ids of an event, lowest first. For the standard venue the first 10 are Floor and the last 5 Balcony. */
	public static java.util.List<Long> seatIds(org.springframework.jdbc.core.simple.JdbcClient jdbc, int eventId) {
		return jdbc.sql("select seat_id from event_seat where event_id = :e order by seat_id")
				.param("e", eventId).query(Long.class).list();
	}

	public ResultActions send(String url, String json) throws Exception {
		return send(token, url, json);
	}

	public ResultActions send(String asToken, String url, String json) throws Exception {
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
