package com.ticketrush.catalog.api;

import com.jayway.jsonpath.JsonPath;
import com.ticketrush.AbstractIntegrationTest;
import com.ticketrush.catalog.infrastructure.MockPaymentGateway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class OrderIntegrationTest extends AbstractIntegrationTest {

	@Autowired
	private MockPaymentGateway gateway;

	private CatalogFixtures fx;
	private int eventId;
	private List<Long> seats;

	@AfterEach
	void clearGatewayHooks() {
		gateway.clearHooks();
	}

	/** A fresh on-sale event: 2 rows of 5 seats at $96 each, so two seats cost $192 plus $14.40 in fees. */
	private void setUpEvent() throws Exception {
		fx = new CatalogFixtures(mvc, organizerToken());
		eventId = fx.createOnSaleEvent("City-" + UUID.randomUUID(), 2, 5);
		seats = CatalogFixtures.seatIds(jdbc, eventId);
	}

	private ResultActions hold(String token, long... seatIds) throws Exception {
		StringBuilder ids = new StringBuilder();
		for (long id : seatIds) {
			ids.append(ids.isEmpty() ? "" : ",").append(id);
		}
		return mvc.perform(post("/api/events/" + eventId + "/holds").contentType(MediaType.APPLICATION_JSON)
				.content("{\"seatIds\":[" + ids + "]}").header("Authorization", bearer(token)));
	}

	private long holdTwo(Guest guest, int from) throws Exception {
		String body = hold(guest.token(), seats.get(from), seats.get(from + 1)).andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString();
		return ((Number) JsonPath.read(body, "$.id")).longValue();
	}

	private ResultActions pay(String token, String key, long holdId, String paymentToken) throws Exception {
		var request = post("/api/orders").contentType(MediaType.APPLICATION_JSON)
				.content("{\"holdId\":%d,\"paymentToken\":\"%s\"}".formatted(holdId, paymentToken))
				.header("Authorization", bearer(token));
		if (key != null) {
			request.header("Idempotency-Key", key);
		}
		return mvc.perform(request);
	}

	private static String newKey() {
		return "key-" + UUID.randomUUID();
	}

	private long orderId(ResultActions result) throws Exception {
		return ((Number) JsonPath.read(result.andReturn().getResponse().getContentAsString(), "$.id")).longValue();
	}

	private int chargesFor(long orderId) {
		return gateway.successfulCharges().containsKey("order-" + orderId) ? 1 : 0;
	}

	private String seatStatus(long seatId) {
		return jdbc.sql("select status from event_seat where event_id = :e and seat_id = :s")
				.param("e", eventId).param("s", seatId).query(String.class).single();
	}

	private int count(String sql, Object... params) {
		var spec = jdbc.sql(sql);
		for (int i = 0; i < params.length; i++) {
			spec = spec.param("p" + i, params[i]);
		}
		return spec.query(Integer.class).single();
	}

	@Test
	void payingForAHoldSellsTheSeatsAndIssuesTickets() throws Exception {
		setUpEvent();
		Guest guest = createGuests(1).get(0);
		long holdId = holdTwo(guest, 0);

		String body = pay(guest.token(), newKey(), holdId, "tok_visa").andExpect(status().isCreated())
				.andExpect(jsonPath("$.status").value("PAID"))
				.andExpect(jsonPath("$.subtotalCents").value(19200))
				.andExpect(jsonPath("$.feeCents").value(1440))
				.andExpect(jsonPath("$.totalCents").value(20640))
				.andExpect(jsonPath("$.seats.length()").value(2))
				.andExpect(jsonPath("$.tickets.length()").value(2))
				.andReturn().getResponse().getContentAsString();
		long orderId = ((Number) JsonPath.read(body, "$.id")).longValue();

		assertThat(seatStatus(seats.get(0))).isEqualTo("SOLD");
		assertThat(seatStatus(seats.get(1))).isEqualTo("SOLD");
		assertThat(jdbc.sql("select status from seat_hold where id = :h").param("h", holdId)
				.query(String.class).single()).isEqualTo("CONVERTED");
		assertThat(jdbc.sql("select count(distinct code) from ticket where order_id = :o").param("o", orderId)
				.query(Integer.class).single()).isEqualTo(2);
		assertThat(jdbc.sql("select count(*) from outbox_event where aggregate_id = :o and type = 'OrderPaid'")
				.param("o", orderId).query(Integer.class).single()).isEqualTo(1);
		assertThat(chargesFor(orderId)).isEqualTo(1);
		assertThat(gateway.successfulCharges().get("order-" + orderId)).isEqualTo(20640L);

		mvc.perform(get("/api/orders/" + orderId).header("Authorization", bearer(guest.token())))
				.andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PAID"));
		mvc.perform(get("/api/orders/" + orderId).header("Authorization", bearer(createGuests(1).get(0).token())))
				.andExpect(status().isForbidden());
	}

	@Test
	void aDeclinedCardFailsTheOrderButKeepsTheHoldForAnotherTry() throws Exception {
		setUpEvent();
		Guest guest = createGuests(1).get(0);
		long holdId = holdTwo(guest, 0);

		pay(guest.token(), newKey(), holdId, "tok_declined").andExpect(status().isPaymentRequired())
				.andExpect(jsonPath("$.status").value("FAILED"))
				.andExpect(jsonPath("$.failureReason").isNotEmpty())
				.andExpect(jsonPath("$.tickets.length()").value(0));
		assertThat(seatStatus(seats.get(0))).isEqualTo("HELD");

		pay(guest.token(), newKey(), holdId, "tok_visa").andExpect(status().isCreated())
				.andExpect(jsonPath("$.status").value("PAID"));
		assertThat(count("select count(*) from ticket_order where hold_id = :p0 and status = 'PAID'", holdId))
				.isEqualTo(1);
		assertThat(count("select count(*) from ticket_order where hold_id = :p0", holdId)).isEqualTo(2);
	}

	@Test
	void anUnknownOutcomeStaysPendingAndKeepsTheSeatsBeyondTheOriginalExpiry() throws Exception {
		setUpEvent();
		Guest guest = createGuests(1).get(0);
		Guest other = createGuests(1).get(0);
		long holdId = holdTwo(guest, 0);

		clock.advance(Duration.ofMinutes(9));
		pay(guest.token(), newKey(), holdId, "tok_error").andExpect(status().isAccepted())
				.andExpect(jsonPath("$.status").value("PENDING_PAYMENT"))
				.andExpect(jsonPath("$.tickets.length()").value(0));

		// The original hold ended at minute 10. The checkout window carries it to minute 12.
		clock.advance(Duration.ofMinutes(2));
		hold(other.token(), seats.get(0)).andExpect(status().isConflict());
		assertThat(seatStatus(seats.get(0))).isEqualTo("HELD");
	}

	@Test
	void whilePaymentIsPendingTheHoldCannotBeReplacedOrReleased() throws Exception {
		setUpEvent();
		Guest guest = createGuests(1).get(0);
		long holdId = holdTwo(guest, 0);
		pay(guest.token(), newKey(), holdId, "tok_error").andExpect(status().isAccepted());

		hold(guest.token(), seats.get(5)).andExpect(status().isConflict());
		mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
				.delete("/api/holds/" + holdId).header("Authorization", bearer(guest.token())))
				.andExpect(status().isConflict());
		assertThat(seatStatus(seats.get(0))).isEqualTo("HELD");
	}

	@Test
	void refusesHoldsThatAreMissingExpiredOrSomeoneElses() throws Exception {
		setUpEvent();
		List<Guest> guests = createGuests(2);
		long holdId = holdTwo(guests.get(0), 0);

		pay(guests.get(1).token(), newKey(), holdId, "tok_visa").andExpect(status().isForbidden());
		pay(guests.get(0).token(), newKey(), 987654321L, "tok_visa").andExpect(status().isNotFound());

		clock.advance(Duration.ofMinutes(11));
		pay(guests.get(0).token(), newKey(), holdId, "tok_visa").andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail").value("Your hold has expired. Pick your seats again."));
		assertThat(count("select count(*) from ticket_order where hold_id = :p0", holdId)).isZero();
	}

	@Test
	void theIdempotencyKeyIsRequiredAndMustLookLikeAKey() throws Exception {
		setUpEvent();
		Guest guest = createGuests(1).get(0);
		long holdId = holdTwo(guest, 0);

		pay(guest.token(), null, holdId, "tok_visa").andExpect(status().isBadRequest());
		pay(guest.token(), "short", holdId, "tok_visa").andExpect(status().isBadRequest());
		mvc.perform(post("/api/orders").contentType(MediaType.APPLICATION_JSON)
				.content("{\"holdId\":%d,\"paymentToken\":\"tok_visa\"}".formatted(holdId)).header("Idempotency-Key", newKey()))
				.andExpect(status().isUnauthorized());
		assertThat(count("select count(*) from ticket_order where hold_id = :p0", holdId)).isZero();
	}

	@Test
	void repeatingARequestWithTheSameKeyReplaysTheOrderAndChargesOnce() throws Exception {
		setUpEvent();
		Guest guest = createGuests(1).get(0);
		long holdId = holdTwo(guest, 0);
		String key = newKey();

		long first = orderId(pay(guest.token(), key, holdId, "tok_visa").andExpect(status().isCreated())
				.andExpect(header().doesNotExist("Idempotent-Replay")));
		long second = orderId(pay(guest.token(), key, holdId, "tok_visa").andExpect(status().isOk())
				.andExpect(header().string("Idempotent-Replay", "true"))
				.andExpect(jsonPath("$.status").value("PAID")));

		assertThat(second).isEqualTo(first);
		assertThat(count("select count(*) from ticket_order where hold_id = :p0", holdId)).isEqualTo(1);
		assertThat(count("select count(*) from ticket where order_id = :p0", first)).isEqualTo(2);
		assertThat(chargesFor(first)).isEqualTo(1);
	}

	@Test
	void theSameKeyForADifferentRequestIsRejected() throws Exception {
		setUpEvent();
		Guest guest = createGuests(1).get(0);
		long holdId = holdTwo(guest, 0);
		String key = newKey();

		pay(guest.token(), key, holdId, "tok_declined").andExpect(status().isPaymentRequired());
		pay(guest.token(), key, holdId, "tok_visa").andExpect(status().isUnprocessableEntity());
		assertThat(count("select count(*) from ticket_order where hold_id = :p0 and status = 'PAID'", holdId)).isZero();
	}

	@Test
	void aRequestRefusedBeforeAnyChargeDoesNotUseUpTheKey() throws Exception {
		setUpEvent();
		Guest guest = createGuests(1).get(0);
		long holdId = holdTwo(guest, 0);
		String key = newKey();

		pay(guest.token(), key, 987654321L, "tok_visa").andExpect(status().isNotFound());
		pay(guest.token(), key, holdId, "tok_visa").andExpect(status().isCreated());
	}

	@Test
	void tenIdenticalRequestsAtOnceMakeOneOrderAndOneCharge() throws Exception {
		setUpEvent();
		Guest guest = createGuests(1).get(0);
		long holdId = holdTwo(guest, 0);
		String key = newKey();

		List<Integer> statuses = race(10, i -> pay(guest.token(), key, holdId, "tok_visa"));

		assertThat(statuses).containsOnly(200, 201);
		assertThat(statuses.stream().filter(s -> s == 201).count()).isEqualTo(1);
		assertThat(count("select count(*) from ticket_order where hold_id = :p0", holdId)).isEqualTo(1);
		long orderId = jdbc.sql("select id from ticket_order where hold_id = :h").param("h", holdId)
				.query(Long.class).single();
		assertThat(chargesFor(orderId)).isEqualTo(1);
		assertThat(count("select count(*) from ticket where order_id = :p0", orderId)).isEqualTo(2);
	}

	@Test
	void tenRequestsWithDifferentKeysForOneHoldPayExactlyOnce() throws Exception {
		setUpEvent();
		Guest guest = createGuests(1).get(0);
		long holdId = holdTwo(guest, 0);

		List<Integer> statuses = race(10, i -> pay(guest.token(), newKey(), holdId, "tok_visa"));

		assertThat(statuses.stream().filter(s -> s == 201).count()).isEqualTo(1);
		assertThat(statuses).allMatch(s -> s == 201 || s == 409);
		assertThat(count("select count(*) from ticket_order where hold_id = :p0 and status = 'PAID'", holdId))
				.isEqualTo(1);
		assertThat(count("select count(*) from ticket t join ticket_order o on o.id = t.order_id "
				+ "where o.hold_id = :p0", holdId)).isEqualTo(2);
		long charged = gateway.successfulCharges().keySet().stream()
				.filter(k -> jdbc.sql("select count(*) from ticket_order where hold_id = :h and 'order-' || id = :k")
						.param("h", holdId).param("k", k).query(Integer.class).single() == 1)
				.count();
		assertThat(charged).isEqualTo(1);
	}

	@Test
	void guestsPayingForDifferentHoldsDoNotInterfere() throws Exception {
		setUpEvent();
		List<Guest> guests = createGuests(5);
		List<Long> holds = new ArrayList<>();
		for (int i = 0; i < guests.size(); i++) {
			holds.add(holdTwo(guests.get(i), i * 2));
		}

		List<Integer> statuses = race(5, i -> pay(guests.get(i).token(), newKey(), holds.get(i), "tok_visa"));

		assertThat(statuses).containsOnly(201);
		assertThat(count("select count(*) from event_seat where event_id = :p0 and status = 'SOLD'", eventId)).isEqualTo(10);
		assertThat(count("select count(*) from ticket where event_id = :p0", eventId)).isEqualTo(10);
	}

	@Test
	void seatsTakenWhileTheChargeRunsAreRefundedAndNoTicketsExist() throws Exception {
		setUpEvent();
		List<Guest> guests = createGuests(2);
		long holdId = holdTwo(guests.get(0), 0);

		// Mid-charge the hold runs out and another guest takes the same seats.
		gateway.onCharge(() -> {
			clock.advance(Duration.ofMinutes(11));
			try {
				hold(guests.get(1).token(), seats.get(0), seats.get(1)).andExpect(status().isCreated());
			}
			catch (Exception e) {
				throw new IllegalStateException(e);
			}
		});

		String body = pay(guests.get(0).token(), newKey(), holdId, "tok_visa").andExpect(status().isConflict())
				.andExpect(jsonPath("$.status").value("REFUNDED"))
				.andExpect(jsonPath("$.tickets.length()").value(0))
				.andReturn().getResponse().getContentAsString();
		long orderId = ((Number) JsonPath.read(body, "$.id")).longValue();

		assertThat(gateway.refundedKeys()).contains("refund-order-" + orderId);
		assertThat(count("select count(*) from ticket where order_id = :p0", orderId)).isZero();
		assertThat(seatStatus(seats.get(0))).isEqualTo("HELD");
		assertThat(count("select count(*) from event_seat where hold_id = :p0 and status = 'HELD'",
				jdbc.sql("select id from seat_hold where user_id = :u and event_id = :e").param("u", guests.get(1).id())
						.param("e", eventId).query(Long.class).single())).isEqualTo(2);
	}

	/** Runs n calls at the same instant on virtual threads and returns each HTTP status. */
	private List<Integer> race(int n, Call call) throws Exception {
		CountDownLatch ready = new CountDownLatch(n);
		CountDownLatch go = new CountDownLatch(1);
		try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
			List<Future<Integer>> futures = new ArrayList<>();
			for (int i = 0; i < n; i++) {
				int index = i;
				futures.add(pool.submit(() -> {
					ready.countDown();
					go.await();
					return call.run(index).andReturn().getResponse().getStatus();
				}));
			}
			ready.await();
			go.countDown();
			List<Integer> statuses = new ArrayList<>();
			for (Future<Integer> f : futures) {
				statuses.add(f.get());
			}
			return statuses;
		}
	}

	private interface Call {
		ResultActions run(int index) throws Exception;
	}

}
