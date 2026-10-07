package com.ticketrush.identity.api;

import com.jayway.jsonpath.JsonPath;
import com.ticketrush.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AuthIntegrationTest extends AbstractIntegrationTest {

	private static final String PASSWORD = "correct-horse-battery";

	@Test
	void registerLoginAndReadProfile() throws Exception {
		String email = uniqueEmail();
		register(email, PASSWORD)
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.email").value(email))
				.andExpect(jsonPath("$.role").value("GUEST"));

		String body = login(email, PASSWORD).andExpect(status().isOk())
				.andExpect(jsonPath("$.tokenType").value("Bearer"))
				.andReturn().getResponse().getContentAsString();
		String token = JsonPath.read(body, "$.accessToken");

		mvc.perform(get("/api/me").header("Authorization", "Bearer " + token))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.email").value(email))
				.andExpect(jsonPath("$.displayName").value("Dana Whitfield"));
	}

	@Test
	void duplicateEmailIsRejectedIgnoringCase() throws Exception {
		String email = uniqueEmail();
		register(email, PASSWORD).andExpect(status().isCreated());
		register(email.toUpperCase(), PASSWORD)
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.title").value("Email already registered"));
	}

	@Test
	void invalidInputListsEachBadField() throws Exception {
		register("not-an-email", "short")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.title").value("Validation failed"))
				.andExpect(jsonPath("$.errors.email").exists())
				.andExpect(jsonPath("$.errors.password").exists());
	}

	@Test
	void wrongPasswordAndUnknownEmailLookTheSame() throws Exception {
		String email = uniqueEmail();
		register(email, PASSWORD).andExpect(status().isCreated());

		String wrongPassword = login(email, "not-the-password").andExpect(status().isUnauthorized())
				.andReturn().getResponse().getContentAsString();
		String unknownEmail = login(uniqueEmail(), PASSWORD).andExpect(status().isUnauthorized())
				.andReturn().getResponse().getContentAsString();

		assertThat(JsonPath.<String>read(wrongPassword, "$.detail"))
				.isEqualTo(JsonPath.<String>read(unknownEmail, "$.detail"));
	}

	@Test
	void profileRequiresAToken() throws Exception {
		mvc.perform(get("/api/me")).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/me").header("Authorization", "Bearer not.a.token")).andExpect(status().isUnauthorized());
	}

	@Test
	void concurrentSignUpsWithOneEmailCreateExactlyOneAccount() throws Exception {
		String email = uniqueEmail();
		int attempts = 8;
		CountDownLatch start = new CountDownLatch(1);
		List<Future<Integer>> results = new ArrayList<>();
		try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
			for (int i = 0; i < attempts; i++) {
				Callable<Integer> attempt = () -> {
					start.await();
					return register(email, PASSWORD).andReturn().getResponse().getStatus();
				};
				results.add(pool.submit(attempt));
			}
			start.countDown();
		}
		List<Integer> statuses = new ArrayList<>();
		for (Future<Integer> result : results) {
			statuses.add(result.get());
		}

		assertThat(statuses).filteredOn(s -> s == 201).hasSize(1);
		assertThat(statuses).filteredOn(s -> s == 409).hasSize(attempts - 1);
	}

	private ResultActions register(String email, String password) throws Exception {
		return mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"email":"%s","password":"%s","displayName":"Dana Whitfield"}""".formatted(email, password)));
	}

	private ResultActions login(String email, String password) throws Exception {
		return mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"email":"%s","password":"%s"}""".formatted(email, password)));
	}

	private static String uniqueEmail() {
		return "dana-" + UUID.randomUUID() + "@example.org";
	}

}
