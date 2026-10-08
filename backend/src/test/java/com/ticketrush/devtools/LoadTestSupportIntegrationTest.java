package com.ticketrush.devtools;

import com.jayway.jsonpath.JsonPath;
import com.ticketrush.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The loadtest profile is on here, which gives this class its own application context. */
@ActiveProfiles({ "test", "loadtest" })
class LoadTestSupportIntegrationTest extends AbstractIntegrationTest {

	@Test
	void anOrganizerCanCreateGuestsInBulkAndTheirTokensWork() throws Exception {
		String body = mvc.perform(post("/dev/load/guests?count=25").header("Authorization", bearer(organizerToken())))
				.andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(25))
				.andReturn().getResponse().getContentAsString();
		List<String> tokens = JsonPath.read(body, "$[*].token");
		assertThat(tokens).doesNotHaveDuplicates();

		mvc.perform(get("/api/me").header("Authorization", bearer(tokens.get(0)))).andExpect(status().isOk());
	}

	@Test
	void onlyOrganizersMayUseTheHooksAndTheCountIsCapped() throws Exception {
		mvc.perform(post("/dev/load/guests?count=1").header("Authorization", bearer(guestToken())))
				.andExpect(status().isForbidden());
		mvc.perform(post("/dev/load/guests?count=1")).andExpect(status().isUnauthorized());
		mvc.perform(post("/dev/load/guests?count=5001").header("Authorization", bearer(organizerToken())))
				.andExpect(status().isBadRequest());
		mvc.perform(get("/dev/load/payments").header("Authorization", bearer(organizerToken())))
				.andExpect(status().isOk()).andExpect(jsonPath("$.charges").isNumber());
	}

}
