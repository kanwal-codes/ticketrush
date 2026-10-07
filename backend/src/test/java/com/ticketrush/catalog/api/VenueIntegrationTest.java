package com.ticketrush.catalog.api;

import com.jayway.jsonpath.JsonPath;
import com.ticketrush.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class VenueIntegrationTest extends AbstractIntegrationTest {

	private ResultActions createVenue(String token, String sectionsJson) throws Exception {
		var request = post("/api/venues").contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"name":"Test Hall","city":"Montreal","sections":%s}""".formatted(sectionsJson));
		if (token != null) {
			request.header("Authorization", bearer(token));
		}
		return mvc.perform(request);
	}

	@Test
	void organizerCreatesAVenueAndEverySeatIsGenerated() throws Exception {
		String body = createVenue(organizerToken(), """
				[{"name":"Floor","rows":3,"seatsPerRow":4},{"name":"Balcony","rows":2,"seatsPerRow":5}]""")
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.totalSeats").value(22))
				.andExpect(jsonPath("$.sections[0].name").value("Floor"))
				.andExpect(jsonPath("$.sections[0].seats").value(12))
				.andExpect(jsonPath("$.sections[1].seats").value(10))
				.andReturn().getResponse().getContentAsString();
		int venueId = JsonPath.read(body, "$.id");

		int stored = jdbc.sql("select count(*) from venue_seat vs join venue_section s on s.id = vs.section_id "
				+ "where s.venue_id = :v").param("v", venueId).query(Integer.class).single();
		assertThat(stored).isEqualTo(22);

		List<String> rows = jdbc.sql("select distinct row_label from venue_seat vs join venue_section s "
				+ "on s.id = vs.section_id where s.venue_id = :v and s.name = 'Floor' order by 1")
				.param("v", venueId).query(String.class).list();
		assertThat(rows).containsExactly("A", "B", "C");
	}

	@Test
	void rowLabelsContinueAfterZ() throws Exception {
		String body = createVenue(organizerToken(), """
				[{"name":"Long","rows":30,"seatsPerRow":1}]""").andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString();
		int venueId = JsonPath.read(body, "$.id");

		List<String> rows = jdbc.sql("select row_label from venue_seat vs join venue_section s "
				+ "on s.id = vs.section_id where s.venue_id = :v").param("v", venueId).query(String.class).list();
		assertThat(rows).hasSize(30).doesNotHaveDuplicates().contains("Z", "AA", "AD");
	}

	@Test
	void guestsAndAnonymousUsersCannotCreateVenues() throws Exception {
		String layout = """
				[{"name":"Floor","rows":1,"seatsPerRow":1}]""";
		createVenue(guestToken(), layout).andExpect(status().isForbidden());
		createVenue(null, layout).andExpect(status().isUnauthorized());
	}

	@Test
	void layoutsOverTheSeatCapOrWithRepeatedNamesAreRejected() throws Exception {
		String token = organizerToken();
		createVenue(token, """
				[{"name":"A","rows":100,"seatsPerRow":51}]""")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("A venue can have at most 5000 seats, and this layout has 5100"));
		createVenue(token, """
				[{"name":"Floor","rows":1,"seatsPerRow":1},{"name":"floor","rows":1,"seatsPerRow":1}]""")
				.andExpect(status().isBadRequest());
		createVenue(token, """
				[{"name":"Floor","rows":0,"seatsPerRow":1}]""")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors").exists());
	}

	@Test
	void unknownVenueIs404() throws Exception {
		mvc.perform(get("/api/venues/999999").header("Authorization", bearer(organizerToken())))
				.andExpect(status().isNotFound());
	}

}
