package com.ticketrush.catalog.api;

import com.ticketrush.catalog.application.OrderReconciler;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Cancelling an event gives every guest their money back, once, and a refund that fails is retried. */
class EventCancellationIntegrationTest extends OrderTestSupport {

	@Autowired
	private OrderReconciler reconciler;

	private ResultActions cancel(String token) throws Exception {
		return mvc.perform(post("/api/events/" + eventId + "/cancel").header("Authorization", bearer(token)));
	}

	private int liveTickets(long orderId) {
		return count("select count(*) from ticket where order_id = :p0 and status <> 'VOID'", orderId);
	}

	@Test
	void everyPaidOrderIsRefundedOnceItsTicketsAreVoidAndItsSeatsFree() throws Exception {
		setUpEvent();
		List<Guest> guests = createGuests(2);
		long first = buyTwo(guests.get(0), 0);
		long second = buyTwo(guests.get(1), 2);

		cancel(organizer).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));

		for (long order : List.of(first, second)) {
			assertThat(orderStatus(order)).isEqualTo("REFUNDED");
			assertThat(gateway.refundedKeys()).contains("refund-order-" + order);
			assertThat(liveTickets(order)).isZero();
			assertThat(count("select count(*) from ticket where order_id = :p0 and status = 'VOID'", order)).isEqualTo(2);
		}
		assertThat(gateway.refundedKeys().stream().filter(k -> k.equals("refund-order-" + first) || k.equals("refund-order-" + second)))
				.hasSize(2);
		assertThat(count("select count(*) from event_seat where event_id = :p0 and status = 'SOLD'", eventId)).isZero();
		assertMoneyAndSeatsAddUp();

		// The buyer still sees what they had, marked void, with its seat.
		mvc.perform(get("/api/tickets").header("Authorization", bearer(guests.get(0).token()))).andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(2)).andExpect(jsonPath("$[0].status").value("VOID"))
				.andExpect(jsonPath("$[0].section").value("Main")).andExpect(jsonPath("$[0].row").value("A"));
	}

	@Test
	void aCancelledEventCanStillBeReadButNeverBought() throws Exception {
		setUpEvent();
		cancel(organizer).andExpect(status().isOk());

		mvc.perform(get("/api/events/" + eventId)).andExpect(status().isOk())
				.andExpect(jsonPath("$.cancelled").value(true)).andExpect(jsonPath("$.saleState").value("ENDED"));
		mvc.perform(get("/api/events/" + eventId + "/seats")).andExpect(status().isNotFound());
		mvc.perform(get("/api/events").param("size", "50")).andExpect(jsonPath("$.items[?(@.id == " + eventId + ")]").isEmpty());
		hold(createGuests(1).get(0).token(), seats.get(0)).andExpect(status().isNotFound());
	}

	@Test
	void aTicketThatWasAlreadyScannedIsNotRefundedButOthersAre() throws Exception {
		setUpEvent();
		List<Guest> guests = createGuests(2);
		long attended = buyTwo(guests.get(0), 0);
		long absent = buyTwo(guests.get(1), 2);
		String code = jdbc.sql("select code from ticket where order_id = :o order by id limit 1").param("o", attended)
				.query(String.class).single();
		mvc.perform(post("/api/tickets/scan").contentType(MediaType.APPLICATION_JSON)
				.content("{\"code\":\"%s\",\"eventId\":%d}".formatted(code, eventId))
				.header("Authorization", bearer(organizer))).andExpect(jsonPath("$.outcome").value("VALID"));

		cancel(organizer).andExpect(status().isOk());

		assertThat(orderStatus(attended)).isEqualTo("PAID");
		assertThat(gateway.refundedKeys()).doesNotContain("refund-order-" + attended);
		assertThat(orderStatus(absent)).isEqualTo("REFUNDED");
		assertThat(liveTickets(absent)).isZero();
	}

	@Test
	void cancellingTwiceRefundsNobodyTwice() throws Exception {
		setUpEvent();
		long order = buyTwo(createGuests(1).get(0), 0);

		cancel(organizer).andExpect(status().isOk());
		int refunds = gateway.refundedKeys().size();
		cancel(organizer).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));

		assertThat(gateway.refundedKeys()).hasSize(refunds).contains("refund-order-" + order);
		assertThat(orderStatus(order)).isEqualTo("REFUNDED");
	}

	@Test
	void aRefundThatFailsStaysPendingAndTheReconcilerFinishesIt() throws Exception {
		setUpEvent();
		long order = buyTwo(createGuests(1).get(0), 0);
		gateway.failNextRefunds(1);

		cancel(organizer).andExpect(status().isOk());

		assertThat(orderStatus(order)).isEqualTo("REFUNDING");
		assertThat(gateway.refundedKeys()).doesNotContain("refund-order-" + order);
		assertThat(liveTickets(order)).isZero(); // the tickets stop working at once, whatever the provider does

		clock.advance(Duration.ofSeconds(1));
		reconciler.reconcile();

		assertThat(orderStatus(order)).isEqualTo("REFUNDED");
		assertThat(gateway.refundedKeys()).contains("refund-order-" + order);
	}

	@Test
	void aPaymentThatSettlesAfterTheCancelIsRefundedAndSellsNothing() throws Exception {
		setUpEvent();
		Guest guest = createGuests(1).get(0);
		long holdId = holdTwo(guest, 0);
		gateway.onCharge(() -> {
			try {
				cancel(organizer).andExpect(status().isOk());
			}
			catch (Exception e) {
				throw new IllegalStateException(e);
			}
		});

		// 409 as for any sale that cannot be completed; the refund has already gone through by the time we answer.
		long order = orderId(pay(guest, newKey(), holdId, "tok_visa").andExpect(status().isConflict())
				.andExpect(jsonPath("$.status").value("REFUNDED")));

		assertThat(orderStatus(order)).isEqualTo("REFUNDED");
		assertThat(gateway.refundedKeys()).contains("refund-order-" + order);
		assertThat(count("select count(*) from ticket where order_id = :p0", order)).isZero();
		assertMoneyAndSeatsAddUp();
	}

	@Test
	void onlyTheOwnerCanCancelAndNobodyIsRefundedOtherwise() throws Exception {
		setUpEvent();
		long order = buyTwo(createGuests(1).get(0), 0);

		cancel(organizerToken()).andExpect(status().isForbidden());
		cancel(createGuests(1).get(0).token()).andExpect(status().isForbidden());

		assertThat(orderStatus(order)).isEqualTo("PAID");
		assertThat(gateway.refundedKeys()).doesNotContain("refund-order-" + order);
		assertThat(liveTickets(order)).isEqualTo(2);
	}

}
