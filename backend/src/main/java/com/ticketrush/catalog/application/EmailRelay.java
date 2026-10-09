package com.ticketrush.catalog.application;

import com.ticketrush.catalog.domain.SentEmailRepository;
import com.ticketrush.mail.domain.Mailer;
import com.ticketrush.mail.domain.Mailer.Mail;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.util.List;

/**
 * Sends the order emails the app has written down. Each message is locked, sent and marked in its own transaction, so
 * two instances never send the same one, and a failure leaves it to be tried again on the next run. The message's id is
 * the provider's idempotency key: if the answer was lost after the provider accepted it, the retry is not sent twice.
 */
@Service
public class EmailRelay {

	private static final Logger log = LoggerFactory.getLogger(EmailRelay.class);
	private static final int BATCH = 20;

	private final SentEmailRepository emails;
	private final Mailer mailer;
	private final TransactionTemplate tx;
	private final Clock clock;

	public EmailRelay(SentEmailRepository emails, Mailer mailer, TransactionTemplate tx, Clock clock) {
		this.emails = emails;
		this.mailer = mailer;
		this.tx = tx;
		this.clock = clock;
	}

	/** Sends up to one batch. Returns how many went out. */
	public int relay() {
		int sent = 0;
		List<Long> ids = emails.unsentIds(BATCH);
		for (long id : ids) {
			try {
				if (Boolean.TRUE.equals(tx.execute(status -> send(id)))) {
					sent++;
				}
			}
			catch (RuntimeException e) {
				log.warn("Email {} was not sent: {}", id, e.getMessage());
				tx.executeWithoutResult(status -> emails.findById(id).ifPresent(row -> row.markFailed(e.toString())));
			}
		}
		return sent;
	}

	private boolean send(long id) {
		return emails.lockUnsent(id).map(row -> {
			mailer.send(new Mail(row.getToEmail(), row.getSubject(), row.getBody(), "sent-email-" + row.getId()));
			row.markSent(clock.instant());
			return true;
		}).orElse(false);
	}

}
