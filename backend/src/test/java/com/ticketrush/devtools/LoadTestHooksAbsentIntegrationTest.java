package com.ticketrush.devtools;

import com.ticketrush.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Without the loadtest profile the hooks do not exist, even for an organizer. */
class LoadTestHooksAbsentIntegrationTest extends AbstractIntegrationTest {

	@Test
	void theHooksAreNotThereByDefault() throws Exception {
		String token = organizerToken();
		mvc.perform(post("/dev/load/guests?count=1").header("Authorization", bearer(token)))
				.andExpect(status().isNotFound());
		mvc.perform(get("/dev/load/payments").header("Authorization", bearer(token))).andExpect(status().isNotFound());
	}

}
