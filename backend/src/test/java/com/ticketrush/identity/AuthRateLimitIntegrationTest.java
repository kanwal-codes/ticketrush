package com.ticketrush.identity;

import com.ticketrush.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;

import java.time.Duration;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Gets its own context, because the limit is switched off for every other test. */
@TestPropertySource(properties = "ticketrush.auth.rate-limit-per-minute=3")
class AuthRateLimitIntegrationTest extends AbstractIntegrationTest {

	private static final String WRONG = "{\"email\":\"nobody@example.org\",\"password\":\"not-the-password\"}";

	@Test
	void guessingPasswordsIsSlowedDownAndTheAnswerSaysHowLong() throws Exception {
		long second = clock.instant().getEpochSecond() % 60;
		if (second > 50) {
			clock.advance(Duration.ofSeconds(60 - second + 2)); // stay inside one window for the whole test
		}
		for (int i = 0; i < 3; i++) {
			mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(WRONG))
					.andExpect(status().isUnauthorized());
		}
		mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(WRONG))
				.andExpect(status().isTooManyRequests())
				.andExpect(header().exists("Retry-After"))
				.andExpect(jsonPath("$.title").value("Slow down"))
				.andExpect(jsonPath("$.detail").value(containsString("Try again in")));

		// Sign-up has its own count, and reading things is never limited.
		mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"rate-" + System.nanoTime() + "@example.org\",\"password\":\"long-enough-pw\",\"displayName\":\"Rate\"}"))
				.andExpect(status().isCreated());
		mvc.perform(get("/api/events")).andExpect(status().isOk());
	}

}
