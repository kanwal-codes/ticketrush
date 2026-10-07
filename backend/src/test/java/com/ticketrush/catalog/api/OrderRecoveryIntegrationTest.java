package com.ticketrush.catalog.api;

import com.ticketrush.catalog.application.OrderReconciler;
import com.ticketrush.catalog.application.OutboxRelay;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Duration;
import java.util.UUID;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** What happens after a request could not finish the job: the reconciler and the outbox relay. */
class OrderRecoveryIntegrationTest extends OrderTestSupport {

	@Autowired
	private OrderReconciler reconciler;

	@Autowired
	private OutboxRelay relay;

	private void waitForCharge(long orderId) throws Exception {
		for (int i = 0; i < 100 && !gateway.successfulCharges().containsKey("order-" + orderId); i++) {
			Thread.sleep(50);
		}
		assertThat(gateway.successfulCharges()).containsKey("order-" + orderId);
	}

	@Test
	void aSlowChargeIsFoundAndSettledByTheReconciler() throws Exception {
		setUpEvent();
		Guest guest = createGuests(1).get(0);
		long orderId = orderId(pay(guest, "key-" + UUID.randomUUID(), holdTwo(guest, 0), "tok_slow")
				.andExpect(status().isAccepted()).andExpect(jsonPath("$.status").value("PENDING_PAYMENT")));
		assertThat(orderStatus(orderId)).isEqualTo("PENDING_PAYMENT");

		waitForCharge(orderId);
		clock.advance(Duration.ofSeconds(1));
		reconciler.reconcile();

		assertThat(orderStatus(orderId)).isEqualTo("PAID");
		assertThat(count("select count(*) from ticket where order_id = :p0", orderId)).isEqualTo(2);
		assertThat(count("select count(*) from event_seat where status = 'SOLD' and event_id = :p0", eventId))
				.isEqualTo(2);
	}

	@Test
	void aProviderWithNoRecordLeavesTheOrderPendingNotFailed() throws Exception {
		setUpEvent();
		Guest guest = createGuests(1).get(0);
		long orderId = orderId(pay(guest, "key-" + UUID.randomUUID(), holdTwo(guest, 0), "tok_error")
				.andExpect(status().isAccepted()));

		clock.advance(Duration.ofSeconds(1));
		reconciler.reconcile();

		assertThat(orderStatus(orderId)).isEqualTo("PENDING_PAYMENT");
	}

	@Test
	void retryingWithTheSameKeyAfterAnUnknownOutcomeSettlesWithoutASecondCharge() throws Exception {
		setUpEvent();
		Guest guest = createGuests(1).get(0);
		long holdId = holdTwo(guest, 0);
		String key = "key-" + UUID.randomUUID();

		gateway.failNextCharges(1);
		long orderId = orderId(pay(guest, key, holdId, "tok_visa").andExpect(status().isAccepted()));
		assertThat(gateway.successfulCharges()).doesNotContainKey("order-" + orderId);

		pay(guest, key, holdId, "tok_visa").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PAID"))
				.andExpect(jsonPath("$.id").value(orderId));
		assertThat(gateway.successfulCharges()).containsKey("order-" + orderId);
		assertThat(count("select count(*) from ticket where order_id = :p0", orderId)).isEqualTo(2);
	}

	@Test
	void aRefundThatFailedIsRetriedByTheReconciler() throws Exception {
		setUpEvent();
		List<Guest> guests = createGuests(2);
		long holdId = holdTwo(guests.get(0), 0);
		gateway.onCharge(() -> {
			clock.advance(Duration.ofMinutes(11));
			try {
				hold(guests.get(1).token(), seats.get(0), seats.get(1)).andExpect(status().isCreated());
			}
			catch (Exception e) {
				throw new IllegalStateException(e);
			}
		});
		gateway.failNextRefunds(1);

		long orderId = orderId(pay(guests.get(0), "key-" + UUID.randomUUID(), holdId, "tok_visa")
				.andExpect(status().isConflict()).andExpect(jsonPath("$.status").value("REFUNDING")));
		assertThat(gateway.refundedKeys()).doesNotContain("refund-order-" + orderId);

		clock.advance(Duration.ofSeconds(1));
		reconciler.reconcile();

		assertThat(orderStatus(orderId)).isEqualTo("REFUNDED");
		assertThat(gateway.refundedKeys()).contains("refund-order-" + orderId);
		assertThat(count("select count(*) from ticket where order_id = :p0", orderId)).isZero();
	}

	@Test
	void aPaidOrderGetsExactlyOneConfirmationEvenIfTheRelayRunsTwice() throws Exception {
		setUpEvent();
		Guest guest = createGuests(1).get(0);
		long orderId = orderId(pay(guest, "key-" + UUID.randomUUID(), holdTwo(guest, 0), "tok_visa")
				.andExpect(status().isCreated()));
		assertThat(count("select count(*) from sent_email where order_id = :p0", orderId)).isZero();

		relay.relay();
		relay.relay();

		assertThat(count("select count(*) from sent_email where order_id = :p0 and kind = 'CONFIRMATION'", orderId))
				.isEqualTo(1);
		assertThat(count("select count(*) from outbox_event where aggregate_id = :p0 and published_at is not null",
				orderId)).isEqualTo(1);
		String body = jdbc.sql("select body from sent_email where order_id = :o").param("o", orderId)
				.query(String.class).single();
		assertThat(body).contains("2 tickets").contains("$206.40");
	}

	@Test
	void anEventThatCannotBeDeliveredIsCountedAndDoesNotBlockTheOthers() throws Exception {
		setUpEvent();
		Guest guest = createGuests(1).get(0);
		long orderId = orderId(pay(guest, "key-" + UUID.randomUUID(), holdTwo(guest, 0), "tok_visa")
				.andExpect(status().isCreated()));
		long badId = jdbc.sql("insert into outbox_event (type, aggregate_id, payload, created_at) "
				+ "values ('Bogus', 1, '{}', now()) returning id").query(Long.class).single();
		try {
			relay.relay();

			assertThat(count("select count(*) from sent_email where order_id = :p0", orderId)).isEqualTo(1);
			assertThat(count("select attempts from outbox_event where id = :p0", badId)).isEqualTo(1);
			assertThat(jdbc.sql("select last_error from outbox_event where id = :i").param("i", badId)
					.query(String.class).single()).contains("Unknown outbox event type");
			assertThat(count("select count(*) from outbox_event where id = :p0 and published_at is null", badId))
					.isEqualTo(1);
		}
		finally {
			jdbc.sql("delete from outbox_event where id = :i").param("i", badId).update();
		}
	}

}
