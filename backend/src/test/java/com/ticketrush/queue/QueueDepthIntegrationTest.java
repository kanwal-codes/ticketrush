package com.ticketrush.queue;

import com.ticketrush.catalog.api.CatalogFixtures;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class QueueDepthIntegrationTest extends QueueTestSupport {

	@Test
	void theOwnerSeesTheLineAndNobodyElseDoes() throws Exception {
		String owner = organizerToken();
		CatalogFixtures fx = new CatalogFixtures(mvc, owner);
		int eventId = fx.createQueued(fx.createVenue("Montreal"), "Hot Drop", "Artist",
				Instant.now().plus(5, ChronoUnit.MINUTES), Instant.now().plus(30, ChronoUnit.DAYS));
		List<Guest> guests = createGuests(3);
		for (Guest g : guests) {
			join(g, eventId).andExpect(status().isOk());
		}
		String path = "/api/organizer/events/" + eventId + "/queue";

		mvc.perform(get(path).header("Authorization", bearer(owner))).andExpect(status().isOk())
				.andExpect(jsonPath("$.waiting").value(3)).andExpect(jsonPath("$.inside").value(0));
		mvc.perform(get(path).header("Authorization", bearer(organizerToken()))).andExpect(status().isForbidden());
		mvc.perform(get(path).header("Authorization", bearer(guests.get(0).token()))).andExpect(status().isForbidden());
		mvc.perform(get(path)).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/organizer/events/987654321/queue").header("Authorization", bearer(owner)))
				.andExpect(status().isNotFound());
	}

}
