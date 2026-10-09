package com.ticketrush.mail;

import com.ticketrush.mail.domain.Mailer;
import com.ticketrush.mail.domain.Mailer.Mail;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class ResendMailerTest {

	private static final String URL = "https://mail.test/emails";

	private final RestClient.Builder builder = RestClient.builder().baseUrl(URL).defaultHeader("Authorization", "Bearer re_key");
	private final MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();

	private Mailer mailer() throws Exception {
		var constructor = Class.forName("com.ticketrush.mail.infrastructure.ResendMailer").getDeclaredConstructor(RestClient.class, String.class);
		constructor.setAccessible(true);
		return (Mailer) constructor.newInstance(builder.build(), "TicketRush <hi@tickets.test>");
	}

	@Test
	void postsTheMessageWithTheKeyAndTheIdempotencyKey() throws Exception {
		server.expect(requestTo(URL)).andExpect(method(HttpMethod.POST)).andExpect(header("Authorization", "Bearer re_key"))
				.andExpect(header("Idempotency-Key", "sent-email-7"))
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
				.andExpect(content().string(containsString("\"to\":[\"dana@example.org\"]")))
				.andExpect(content().string(containsString("\"from\":\"TicketRush <hi@tickets.test>\"")))
				.andExpect(content().string(containsString("\"subject\":\"Hello\"")))
				.andRespond(withSuccess("{\"id\":\"1\"}", MediaType.APPLICATION_JSON));

		Mailer mailer = mailer();
		assertThat(mailer.delivers()).isTrue();
		mailer.send(new Mail("dana@example.org", "Hello", "Body", "sent-email-7"));
		server.verify();
	}

	@Test
	void sendsWithoutAnIdempotencyKeyWhenThereIsNone() throws Exception {
		server.expect(requestTo(URL)).andExpect(request -> assertThat(request.getHeaders().containsHeader("Idempotency-Key")).isFalse())
				.andRespond(withSuccess());
		mailer().send(new Mail("dana@example.org", "Hello", "Body", null));
		server.verify();
	}

	@Test
	void aRefusalFromTheProviderIsAFailedDelivery() throws Exception {
		server.expect(requestTo(URL)).andRespond(withStatus(HttpStatus.UNPROCESSABLE_ENTITY));
		assertThatThrownBy(() -> mailer().send(new Mail("dana@example.org", "Hello", "Body", "k")))
				.isInstanceOf(Mailer.DeliveryException.class);
	}

}
