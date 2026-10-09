package com.ticketrush.identity;

import com.jayway.jsonpath.JsonPath;
import com.ticketrush.AbstractIntegrationTest;
import com.ticketrush.RecordingMailer;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.time.Duration;
import java.util.UUID;

import static com.ticketrush.RecordingMailer.tokenIn;
import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Forgotten passwords, confirming an address, and who may join a queue before they have. */
class AccountEmailsIntegrationTest extends AbstractIntegrationTest {

	private static final String NEW_PASSWORD = "a-brand-new-password";

	private String register() throws Exception {
		String email = "recover-" + UUID.randomUUID() + "@example.org";
		mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"%s\",\"password\":\"%s\",\"displayName\":\"Recover\"}".formatted(email, PASSWORD)))
				.andExpect(status().isCreated());
		return email;
	}

	private String login(String email, String password, int expected) throws Exception {
		String body = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password)))
				.andExpect(status().is(expected)).andReturn().getResponse().getContentAsString();
		return expected == 200 ? JsonPath.read(body, "$.accessToken") : null;
	}

	private void forgot(String email) throws Exception {
		mvc.perform(post("/api/auth/forgot-password").contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"%s\"}".formatted(email))).andExpect(status().isAccepted());
	}

	private org.springframework.test.web.servlet.ResultActions reset(String token, String password) throws Exception {
		return mvc.perform(post("/api/auth/reset-password").contentType(MediaType.APPLICATION_JSON)
				.content("{\"token\":\"%s\",\"password\":\"%s\"}".formatted(token, password)));
	}

	@Test
	void aResetLinkChoosesANewPasswordOnceAndStopsTheOldOne() throws Exception {
		String email = register();
		forgot(email);
		await().untilAsserted(() -> assertThat(mailer.sentTo(email)).hasSize(1));
		var mail = mailer.sentTo(email).get(0);
		assertThat(mail.subject()).contains("Reset");
		assertThat(RecordingMailer.linkIn(mail)).startsWith("http://localhost:5173/reset-password?token=");

		String token = tokenIn(mail);
		reset(token, NEW_PASSWORD).andExpect(status().isNoContent());

		login(email, NEW_PASSWORD, 200);
		login(email, PASSWORD, 401);
		// The link is used up.
		reset(token, "yet-another-password").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("This link has expired or was already used. Ask for a new one."));
	}

	@Test
	void aResetLinkExpiresAfterAnHourAndAnInventedOneNeverWorks() throws Exception {
		String email = register();
		forgot(email);
		await().untilAsserted(() -> assertThat(mailer.sentTo(email)).hasSize(1));
		String token = tokenIn(mailer.sentTo(email).get(0));

		reset("not-a-real-token", NEW_PASSWORD).andExpect(status().isBadRequest());
		clock.advance(Duration.ofMinutes(61));
		reset(token, NEW_PASSWORD).andExpect(status().isBadRequest());
		login(email, PASSWORD, 200);
	}

	@Test
	void askingTwiceInAMinuteSendsOneEmailAndTheAnswerNeverRevealsWhoHasAnAccount() throws Exception {
		String email = register();
		String stranger = "nobody-" + UUID.randomUUID() + "@example.org";
		forgot(stranger);
		forgot(email);
		forgot(email);
		await().untilAsserted(() -> assertThat(mailer.sentTo(email)).hasSize(1));
		assertThat(mailer.sentTo(stranger)).isEmpty();

		clock.advance(Duration.ofSeconds(61));
		forgot(email);
		await().untilAsserted(() -> assertThat(mailer.sentTo(email)).hasSize(2));
	}

	@Test
	void choosingANewPasswordRetiresOtherLinksAndEndsOlderSignIns() throws Exception {
		String email = register();
		String oldSignIn = login(email, PASSWORD, 200);
		forgot(email);
		await().untilAsserted(() -> assertThat(mailer.sentTo(email)).hasSize(1));
		clock.advance(Duration.ofSeconds(61));
		forgot(email);
		await().untilAsserted(() -> assertThat(mailer.sentTo(email)).hasSize(2));
		String first = tokenIn(mailer.sentTo(email).get(0));
		String second = tokenIn(mailer.sentTo(email).get(1));

		reset(second, NEW_PASSWORD).andExpect(status().isNoContent());
		reset(first, "somebody-elses-guess").andExpect(status().isBadRequest());

		// Whoever held the old sign-in cannot renew it; a new sign-in with the new password can.
		mvc.perform(post("/api/auth/refresh").header("Authorization", bearer(oldSignIn))).andExpect(status().isUnauthorized());
		mvc.perform(post("/api/auth/refresh").header("Authorization", bearer(login(email, NEW_PASSWORD, 200))))
				.andExpect(status().isOk());
	}

	@Test
	void theNewPasswordFollowsTheSameRulesAsSignUp() throws Exception {
		reset("anything", "short").andExpect(status().isBadRequest());
	}

	@Test
	void whereMailIsReallySentANewGuestMustConfirmTheAddressBeforeJoiningAQueue() throws Exception {
		mailer.delivers(true);
		String email = register();
		await().untilAsserted(() -> assertThat(mailer.sentTo(email)).hasSize(1));
		var mail = mailer.sentTo(email).get(0);
		assertThat(RecordingMailer.linkIn(mail)).startsWith("http://localhost:5173/verify-email?token=");

		String token = login(email, PASSWORD, 200);
		mvc.perform(get("/api/me").header("Authorization", bearer(token))).andExpect(status().isOk())
				.andExpect(jsonPath("$.emailVerified").value(false));
		for (String path : new String[] { "/api/events/1/queue", "/api/events/1/holds", "/api/orders" }) {
			mvc.perform(post(path).header("Authorization", bearer(token)).contentType(MediaType.APPLICATION_JSON).content("{}"))
					.andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("EMAIL_NOT_VERIFIED"));
		}
		// Reading is still fine, and so is leaving a queue.
		mvc.perform(get("/api/events")).andExpect(status().isOk());

		mvc.perform(post("/api/auth/verify-email").contentType(MediaType.APPLICATION_JSON)
				.content("{\"token\":\"%s\"}".formatted(tokenIn(mail)))).andExpect(status().isNoContent());
		mvc.perform(post("/api/auth/verify-email").contentType(MediaType.APPLICATION_JSON)
				.content("{\"token\":\"%s\"}".formatted(tokenIn(mail)))).andExpect(status().isBadRequest());

		// The old token still says unconfirmed; a renewed one says confirmed and gets past the gate (the event does not exist).
		String renewed = JsonPath.read(mvc.perform(post("/api/auth/refresh").header("Authorization", bearer(token)))
				.andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.accessToken");
		mvc.perform(post("/api/events/999999/queue").header("Authorization", bearer(renewed))).andExpect(status().isNotFound());
	}

	@Test
	void aGuestCanAskForANewConfirmationLinkButNotTwiceInAMinute() throws Exception {
		mailer.delivers(true);
		String email = register();
		String token = login(email, PASSWORD, 200);
		await().untilAsserted(() -> assertThat(mailer.sentTo(email)).hasSize(1));

		mvc.perform(post("/api/auth/verify-email/resend").header("Authorization", bearer(token))).andExpect(status().isTooManyRequests());
		clock.advance(Duration.ofSeconds(61));
		mvc.perform(post("/api/auth/verify-email/resend").header("Authorization", bearer(token))).andExpect(status().isNoContent());
		await().untilAsserted(() -> assertThat(mailer.sentTo(email)).hasSize(2));

		mvc.perform(post("/api/auth/verify-email").contentType(MediaType.APPLICATION_JSON)
				.content("{\"token\":\"%s\"}".formatted(tokenIn(mailer.sentTo(email).get(1))))).andExpect(status().isNoContent());
		clock.advance(Duration.ofSeconds(61));
		mvc.perform(post("/api/auth/verify-email/resend").header("Authorization", bearer(token))).andExpect(status().isNoContent());
		assertThat(mailer.sentTo(email)).hasSize(2);
	}

	@Test
	void whenMailCannotBeSentGuestsAreNotAskedToConfirmAndCanGoStraightToTheQueue() throws Exception {
		String email = register();
		String token = login(email, PASSWORD, 200);
		mvc.perform(get("/api/me").header("Authorization", bearer(token))).andExpect(jsonPath("$.emailVerified").value(true));
		assertThat(mailer.sentTo(email)).isEmpty();
		mvc.perform(post("/api/events/999999/queue").header("Authorization", bearer(token))).andExpect(status().isNotFound());
	}

	@Test
	void resettingThroughTheLinkAlsoConfirmsTheAddress() throws Exception {
		mailer.delivers(true);
		String email = register();
		await().untilAsserted(() -> assertThat(mailer.sentTo(email)).hasSize(1));
		clock.advance(Duration.ofSeconds(61));
		forgot(email);
		await().untilAsserted(() -> assertThat(mailer.sentTo(email)).hasSize(2));
		reset(tokenIn(mailer.sentTo(email).get(1)), NEW_PASSWORD).andExpect(status().isNoContent());
		mvc.perform(get("/api/me").header("Authorization", bearer(login(email, NEW_PASSWORD, 200))))
				.andExpect(jsonPath("$.emailVerified").value(true));
	}

}
