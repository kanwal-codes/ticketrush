package com.ticketrush.catalog.application;

import com.ticketrush.catalog.domain.OrderPaidEvent;
import com.ticketrush.catalog.domain.OutboxEvent;
import com.ticketrush.catalog.domain.OutboxEventRepository;
import com.ticketrush.catalog.domain.TicketOrder;
import com.ticketrush.catalog.domain.TicketOrderRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.util.List;

/**
 * Delivers what the outbox promises. Each row is handled in its own transaction: the row is locked, listeners
 * run, the row is marked delivered. If a listener fails, that transaction rolls back (so half a delivery leaves
 * nothing behind) and the failure is counted; the row is tried again on the next run. Listeners must therefore
 * tolerate seeing the same event twice.
 */
@Service
public class OutboxRelay {

	private static final Logger log = LoggerFactory.getLogger(OutboxRelay.class);
	private static final int BATCH = 50;

	private final OutboxEventRepository outbox;
	private final TicketOrderRepository orders;
	private final ApplicationEventPublisher publisher;
	private final TransactionTemplate tx;
	private final Clock clock;

	public OutboxRelay(OutboxEventRepository outbox, TicketOrderRepository orders, ApplicationEventPublisher publisher,
			TransactionTemplate tx, Clock clock) {
		this.outbox = outbox;
		this.orders = orders;
		this.publisher = publisher;
		this.tx = tx;
		this.clock = clock;
	}

	/** Delivers up to one batch. Returns how many rows were delivered by this call. */
	public int relay() {
		List<Long> ids = outbox.undeliveredIds(BATCH);
		int delivered = 0;
		for (long id : ids) {
			try {
				if (Boolean.TRUE.equals(tx.execute(status -> deliver(id)))) {
					delivered++;
				}
			}
			catch (RuntimeException e) {
				log.warn("Outbox event {} was not delivered: {}", id, e.toString());
				tx.executeWithoutResult(status -> outbox.findById(id).ifPresent(row -> row.markFailed(e.toString())));
			}
		}
		return delivered;
	}

	private boolean deliver(long id) {
		OutboxEvent row = outbox.lockUndelivered(id).orElse(null);
		if (row == null) {
			return false;
		}
		if (!OutboxEvent.ORDER_PAID.equals(row.getType())) {
			throw new IllegalStateException("Unknown outbox event type " + row.getType());
		}
		TicketOrder order = orders.findById(row.getAggregateId()).orElseThrow();
		publisher.publishEvent(new OrderPaidEvent(order.getId(), order.getEventId(), order.getUserId()));
		row.markPublished(clock.instant());
		return true;
	}

}
