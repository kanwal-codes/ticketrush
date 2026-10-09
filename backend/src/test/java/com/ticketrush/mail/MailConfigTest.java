package com.ticketrush.mail;

import com.ticketrush.mail.domain.Mailer;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

/** Without a provider key the app only logs email; with one it sends. */
class MailConfigTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withUserConfiguration(configClass());

	private static Class<?> configClass() {
		try {
			return Class.forName("com.ticketrush.mail.infrastructure.MailConfig");
		}
		catch (ClassNotFoundException e) {
			throw new IllegalStateException(e);
		}
	}

	@Test
	void logsOnlyWithoutAKey() {
		runner.withPropertyValues("ticketrush.mail.from=a@b.test").run(context -> {
			Mailer mailer = context.getBean(Mailer.class);
			assertThat(mailer.delivers()).isFalse();
			mailer.send(new Mailer.Mail("x@example.org", "Subject", "Body", null));
		});
		runner.withPropertyValues("ticketrush.mail.from=a@b.test", "ticketrush.mail.log-bodies=true").run(context -> {
			context.getBean(Mailer.class).send(new Mailer.Mail("x@example.org", "Subject", "Body with a link", null));
		});
	}

	@Test
	void sendsForRealWithAKey() {
		runner.withPropertyValues("ticketrush.mail.from=a@b.test", "ticketrush.mail.resend-api-key=re_123")
				.run(context -> assertThat(context.getBean(Mailer.class).delivers()).isTrue());
	}

}
