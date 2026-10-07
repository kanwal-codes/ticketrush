package com.ticketrush.catalog.infrastructure;

import com.ticketrush.catalog.application.OrderReconciler;
import com.ticketrush.catalog.application.OutboxRelay;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Runs the order reconciler and the outbox relay on a timer. Both are safe to run on several instances. */
@Component
class OrderJobs {

	private static final Logger log = LoggerFactory.getLogger(OrderJobs.class);

	private final OrderReconciler reconciler;
	private final OutboxRelay relay;

	OrderJobs(OrderReconciler reconciler, OutboxRelay relay) {
		this.reconciler = reconciler;
		this.relay = relay;
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

}
