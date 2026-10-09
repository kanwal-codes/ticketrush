package com.ticketrush.identity;

import com.jayway.jsonpath.JsonPath;
import com.ticketrush.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Duration;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** A person who is using the app keeps their sign-in, for a limited time and no longer than the account exists. */
class SessionRefreshIntegrationTest extends AbstractIntegrationTest {

	@Autowired
	private JwtDecoder decoder;

	private String signUpAndIn() throws Exception {
		String email = "refresh-" + UUID.randomUUID() + "@example.org";
		mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"%s\",\"password\":\"a-long-password\",\"displayName\":\"Refresh\"}".formatted(email)))
				.andExpect(status().isCreated());
		String body = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"%s\",\"password\":\"a-long-password\"}".formatted(email)))
				.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
		return JsonPath.read(body, "$.accessToken");
	}

	private String refresh(String token) throws Exception {
		String body = mvc.perform(post("/api/auth/refresh").header("Authorization", bearer(token)))
				.andExpect(status().isOk()).andExpect(jsonPath("$.tokenType").value("Bearer"))
				.andExpect(jsonPath("$.expiresIn").value(1800)).andReturn().getResponse().getContentAsString();
		return JsonPath.read(body, "$.accessToken");
	}

	@Test
	void aRefreshedTokenWorksAndKeepsWhoAndWhenTheyEnteredThePassword() throws Exception {
		String first = signUpAndIn();
		String second = refresh(first);

		var a = decoder.decode(first);
		var b = decoder.decode(second);
		assertThat(b.getSubject()).isEqualTo(a.getSubject());
		assertThat(b.<Object>getClaim("auth_time")).isEqualTo(a.<Object>getClaim("auth_time"));
		assertThat(b.getExpiresAt()).isAfterOrEqualTo(a.getExpiresAt());
		mvc.perform(get("/api/me").header("Authorization", bearer(second))).andExpect(status().isOk());
	}

	@Test
	void aRefreshCannotKeepASignInAliveForever() throws Exception {
		String token = signUpAndIn();
		refresh(token);

		clock.advance(Duration.ofHours(9));

		mvc.perform(post("/api/auth/refresh").header("Authorization", bearer(token)))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.detail").value("Your session has ended. Please sign in again."));
	}

	@Test
	void aRefreshNeedsATokenAndReadsTheAccountAgain() throws Exception {
		mvc.perform(post("/api/auth/refresh")).andExpect(status().isUnauthorized());
		mvc.perform(post("/api/auth/refresh").header("Authorization", "Bearer not-a-token")).andExpect(status().isUnauthorized());

		// A role change shows in the next token, and a deleted account cannot renew.
		String token = signUpAndIn();
		long id = Long.parseLong(decoder.decode(token).getSubject());
		jdbc.sql("update app_user set role = 'ORGANIZER' where id = :id").param("id", id).update();
		String promoted = refresh(token);
		mvc.perform(get("/api/organizer/events").header("Authorization", bearer(promoted))).andExpect(status().isOk());

		jdbc.sql("delete from app_user where id = :id").param("id", id).update();
		mvc.perform(post("/api/auth/refresh").header("Authorization", bearer(promoted))).andExpect(status().isUnauthorized());
	}

}
