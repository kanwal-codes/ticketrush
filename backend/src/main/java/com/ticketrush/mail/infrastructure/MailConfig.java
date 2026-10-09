package com.ticketrush.mail.infrastructure;

import com.ticketrush.mail.domain.Mailer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Real email when a Resend API key is set; otherwise a stand-in that only logs, so development needs no account. */
@Configuration
class MailConfig {

	@Bean
	Mailer mailer(@Value("${ticketrush.mail.resend-api-key:}") String apiKey,
			@Value("${ticketrush.mail.from}") String from,
			@Value("${ticketrush.mail.api-url:https://api.resend.com/emails}") String url,
			@Value("${ticketrush.mail.log-bodies:false}") boolean logBodies) {
		return apiKey.isBlank() ? new LogMailer(logBodies) : new ResendMailer(apiKey.strip(), from, url);
	}

}
