package com.ticketrush.identity;

import com.ticketrush.AbstractIntegrationTest;
import com.ticketrush.identity.application.TurnstileVerifier;
import com.ticketrush.identity.application.TurnstileVerifier.Verdict;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.ResultActions;

import java.util.UUID;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** With the bot check on, an account needs a passed check; signing in does not. */
class SignUpBotCheckIntegrationTest extends AbstractIntegrationTest {

	@MockitoBean
	private TurnstileVerifier verifier;

	@BeforeEach
	void on() {
		when(verifier.enabled()).thenReturn(true);
	}

	private ResultActions register(String email, String tokenField) throws Exception {
		return mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"%s\",\"password\":\"a-long-password\",\"displayName\":\"Bot Check\"%s}".formatted(email, tokenField)));
	}

	private static String email() {
		return "botcheck-" + UUID.randomUUID() + "@example.org";
	}

	@Test
	void signUpWithoutAnAnswerIsRefusedAndNothingIsAsked() throws Exception {
		register(email(), "").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("Please complete the check and try again."));
		register(email(), ",\"turnstileToken\":\"  \"").andExpect(status().isBadRequest());
		verify(verifier, never()).verify(anyString(), anyString());
	}

	@Test
	void aPassedCheckCreatesTheAccountAndAFailedOneDoesNot() throws Exception {
		when(verifier.verify(eq("good"), anyString())).thenReturn(Verdict.PASSED);
		when(verifier.verify(eq("bad"), anyString())).thenReturn(Verdict.FAILED);
		String refused = email();

		register(email(), ",\"turnstileToken\":\"good\"").andExpect(status().isCreated());
		register(refused, ",\"turnstileToken\":\"bad\"").andExpect(status().isBadRequest());
		// The refused address was never taken, so it can still sign up properly.
		register(refused, ",\"turnstileToken\":\"good\"").andExpect(status().isCreated());
	}

	@Test
	void whenTheCheckCannotBeRunSignUpFailsClosedWithItsOwnMessage() throws Exception {
		when(verifier.verify(eq("slow"), anyString())).thenReturn(Verdict.UNAVAILABLE);
		register(email(), ",\"turnstileToken\":\"slow\"").andExpect(status().isServiceUnavailable())
				.andExpect(jsonPath("$.detail").value("We could not run the security check right now. Please try again in a moment."));
	}

	@Test
	void signingInNeverNeedsTheCheck() throws Exception {
		when(verifier.verify(eq("good"), anyString())).thenReturn(Verdict.PASSED);
		String email = email();
		register(email, ",\"turnstileToken\":\"good\"").andExpect(status().isCreated());
		mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"%s\",\"password\":\"a-long-password\"}".formatted(email))).andExpect(status().isOk());
	}

}
