package com.ticketrush.identity.infrastructure;

import com.ticketrush.identity.application.TurnstileVerifier.Verdict;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class CloudflareTurnstileVerifierTest {

	private static final String URL = "https://challenges.test/siteverify";

	private MockRestServiceServer server;

	private CloudflareTurnstileVerifier verifier(String secret) {
		RestClient.Builder builder = RestClient.builder().baseUrl(URL);
		server = MockRestServiceServer.bindTo(builder).build();
		return new CloudflareTurnstileVerifier(secret, builder.build());
	}

	@Test
	void isOffWithoutASecret() {
		assertThat(verifier("").enabled()).isFalse();
		assertThat(verifier("   ").enabled()).isFalse();
		assertThat(verifier(null).enabled()).isFalse();
		assertThat(verifier("s3cret").enabled()).isTrue();
	}

	@Test
	void sendsTheSecretTheAnswerAndTheAddressAndReadsASuccess() {
		CloudflareTurnstileVerifier v = verifier("s3cret");
		server.expect(requestTo(URL)).andExpect(method(HttpMethod.POST))
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_FORM_URLENCODED))
				.andExpect(content().string(containsString("secret=s3cret")))
				.andExpect(content().string(containsString("response=the-token")))
				.andExpect(content().string(containsString("remoteip=203.0.113.9")))
				.andRespond(withSuccess("{\"success\":true}", MediaType.APPLICATION_JSON));

		assertThat(v.verify("the-token", "203.0.113.9")).isEqualTo(Verdict.PASSED);
		server.verify();
	}

	@Test
	void aRefusedAnswerFailsTheCheck() {
		CloudflareTurnstileVerifier v = verifier("s3cret");
		server.expect(requestTo(URL)).andRespond(withSuccess("{\"success\":false,\"error-codes\":[\"invalid-input-response\"]}", MediaType.APPLICATION_JSON));
		assertThat(v.verify("forged", null)).isEqualTo(Verdict.FAILED);
	}

	@Test
	void aProviderThatDoesNotAnswerMeansTheCheckCouldNotBeRun() {
		CloudflareTurnstileVerifier v = verifier("s3cret");
		server.expect(requestTo(URL)).andRespond(withStatus(HttpStatus.BAD_GATEWAY));
		assertThat(v.verify("token", "203.0.113.9")).isEqualTo(Verdict.UNAVAILABLE);
	}

}
