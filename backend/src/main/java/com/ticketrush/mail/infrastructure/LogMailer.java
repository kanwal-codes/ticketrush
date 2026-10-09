package com.ticketrush.mail.infrastructure;

import com.ticketrush.mail.domain.Mailer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Development stand-in. Message bodies hold sign-in links, so they are logged only where the profile says so. */
class LogMailer implements Mailer {

	private static final Logger log = LoggerFactory.getLogger(LogMailer.class);

	private final boolean logBodies;

	LogMailer(boolean logBodies) {
		this.logBodies = logBodies;
	}

	@Override
	public boolean delivers() {
		return false;
	}

	@Override
	public void send(Mail mail) {
		if (logBodies) {
			log.info("Email to {}: {}\n{}", mail.to(), mail.subject(), mail.text());
		}
		else {
			log.info("Email to {} not sent (no mail provider configured): {}", mail.to(), mail.subject());
		}
	}

}
