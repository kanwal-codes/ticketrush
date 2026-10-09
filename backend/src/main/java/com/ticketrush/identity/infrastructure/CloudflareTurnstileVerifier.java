package com.ticketrush.identity.infrastructure;

import com.ticketrush.identity.application.TurnstileVerifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Map;

/** Cloudflare Turnstile. With no secret configured the check is off; with one, a missing answer counts as unavailable. */
@Component
class CloudflareTurnstileVerifier implements TurnstileVerifier {

	private static final Logger log = LoggerFactory.getLogger(CloudflareTurnstileVerifier.class);
	private static final Duration TIMEOUT = Duration.ofSeconds(3);

	private final RestClient client;
	private final String secret;

	@Autowired
	CloudflareTurnstileVerifier(@Value("${ticketrush.signup.turnstile-secret:}") String secret,
			@Value("${ticketrush.signup.turnstile-verify-url:https://challenges.cloudflare.com/turnstile/v0/siteverify}") String url) {
		this(secret, RestClient.builder().baseUrl(url).requestFactory(factory()).build());
	}

	CloudflareTurnstileVerifier(String secret, RestClient client) {
		this.secret = secret == null ? "" : secret.strip();
		this.client = client;
	}

	private static JdkClientHttpRequestFactory factory() {
		JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(TIMEOUT).build());
		factory.setReadTimeout(TIMEOUT);
		return factory;
	}

	@Override
	public boolean enabled() {
		return !secret.isEmpty();
	}

	@Override
	@SuppressWarnings("unchecked")
	public Verdict verify(String token, String clientAddress) {
		MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
		form.add("secret", secret);
		form.add("response", token);
		if (clientAddress != null) {
			form.add("remoteip", clientAddress);
		}
		try {
			Map<String, Object> answer = client.post().contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form)
					.retrieve().body(Map.class);
			return answer != null && Boolean.TRUE.equals(answer.get("success")) ? Verdict.PASSED : Verdict.FAILED;
		}
		catch (RuntimeException e) {
			log.warn("The Turnstile check could not be made: {}", e.getMessage());
			return Verdict.UNAVAILABLE;
		}
	}

}
