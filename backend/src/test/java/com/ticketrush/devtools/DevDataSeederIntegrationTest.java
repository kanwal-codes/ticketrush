package com.ticketrush.devtools;

import com.jayway.jsonpath.JsonPath;
import com.ticketrush.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Boots with the dev profile, which seeds demo data. Gets its own Spring context and its own database. */
@ActiveProfiles("dev")
@TestPropertySource(properties = "ticketrush.seed.organizer-password=seed-test-password-123")
class DevDataSeederIntegrationTest extends AbstractIntegrationTest {

	@Test
	void seedsThePublishedDemoEventsAndTheDemoOrganizerCanSignIn() throws Exception {
		// Thirteen in all: nine in Montreal, two in Toronto, two in Quebec City.
		mvc.perform(get("/api/events")).andExpect(jsonPath("$.totalItems").value(13));
		mvc.perform(get("/api/events").param("city", "Toronto")).andExpect(jsonPath("$.totalItems").value(2));
		String list = mvc.perform(get("/api/events").param("city", "Montreal"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.totalItems").value(9))
				.andReturn().getResponse().getContentAsString();
		int afterlight = JsonPath.<java.util.List<Integer>>read(list, "$.items[?(@.title=='Afterlight Tour')].id").get(0);

		// 400 + 1000 + 600 seats, and the $96.00 Stalls ticket shows as $103.20 with the fee.
		mvc.perform(get("/api/events/" + afterlight))
				.andExpect(jsonPath("$.totalSeats").value(2000))
				.andExpect(jsonPath("$.tiers[?(@.name=='Stalls')].allInCents", contains(10320)));

		String login = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"email":"organizer@ticketrush.dev","password":"seed-test-password-123"}"""))
				.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
		mvc.perform(get("/api/me").header("Authorization", "Bearer " + JsonPath.read(login, "$.accessToken")))
				.andExpect(jsonPath("$.role").value("ORGANIZER"));
	}

}
