package com.ticketrush.catalog.infrastructure;

import com.ticketrush.catalog.application.EmailRelay;
import com.ticketrush.catalog.application.OrderReconciler;
import com.ticketrush.catalog.application.OutboxRelay;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Runs the order reconciler, the outbox relay and the email relay on a timer. Both are safe to run on several instances. */
@Component
class OrderJobs {

	private static final Logger log = LoggerFactory.getLogger(OrderJobs.class);

	private final OrderReconciler reconciler;
	private final OutboxRelay relay;
	private final EmailRelay emails;

	OrderJobs(OrderReconciler reconciler, OutboxRelay relay, EmailRelay emails) {
		this.reconciler = reconciler;
		this.relay = relay;
		this.emails = emails;
	}

	@Scheduled(fixedDelayString = "${ticketrush.payments.reconcile-interval}",
			initialDelayString = "${ticketrush.payments.reconcile-interval}")
	void reconcile() {
		int moved = reconciler.reconcile();
		if (moved > 0) {
			log.info("Reconciled {} orders", moved);
		}
	}

	@Scheduled(fixedDelayString = "${ticketrush.payments.outbox-interval}",
			initialDelayString = "${ticketrush.payments.outbox-interval}")
	void relay() {
		relay.relay();
	}

	@Scheduled(fixedDelayString = "${ticketrush.mail.relay-interval:PT5S}",
			initialDelayString = "${ticketrush.mail.relay-interval:PT5S}")
	void sendEmails() {
		emails.relay();
	}

}
