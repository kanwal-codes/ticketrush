package com.ticketrush.mail.infrastructure;

import com.ticketrush.mail.domain.Mailer;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Map;

/** Sends through Resend's HTTP API. Anything but a 2xx answer, or no answer, is a failed delivery. */
class ResendMailer implements Mailer {

	private static final Duration TIMEOUT = Duration.ofSeconds(5);

	private final RestClient client;
	private final String from;

	ResendMailer(String apiKey, String from, String url) {
		this(client(apiKey, url), from);
	}

	private static RestClient client(String apiKey, String url) {
		JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(TIMEOUT).build());
		factory.setReadTimeout(TIMEOUT);
		return RestClient.builder().baseUrl(url).requestFactory(factory).defaultHeader("Authorization", "Bearer " + apiKey).build();
	}

	ResendMailer(RestClient client, String from) {
		this.client = client;
		this.from = from;
	}

	@Override
	public boolean delivers() {
		return true;
	}

	@Override
	public void send(Mail mail) {
		try {
			RestClient.RequestBodySpec request = client.post().contentType(MediaType.APPLICATION_JSON);
			if (mail.key() != null) {
				request.header("Idempotency-Key", mail.key());
			}
			request.body(Map.of("from", from, "to", List.of(mail.to()), "subject", mail.subject(), "text", mail.text()))
					.retrieve().toBodilessEntity();
		}
		catch (RuntimeException e) {
			throw new DeliveryException("The email provider did not accept the message: " + e.getMessage(), e);
		}
	}

}
