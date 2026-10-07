package com.ticketrush.catalog.api;

import com.jayway.jsonpath.JsonPath;
import com.ticketrush.AbstractIntegrationTest;
import com.ticketrush.catalog.infrastructure.MockPaymentGateway;
import org.junit.jupiter.api.AfterEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Shared steps for tests that hold seats and pay for them. */
public abstract class OrderTestSupport extends AbstractIntegrationTest {

	@Autowired
	protected MockPaymentGateway gateway;

	protected CatalogFixtures fx;
	protected String organizer;
	protected int eventId;
	protected List<Long> seats;

	@AfterEach
	void clearGatewayHooks() {
		gateway.clearHooks();
	}

	/** A fresh on-sale event: 2 rows of 5 seats at $96 each, so two seats cost $192 plus $14.40 in fees. */
	protected void setUpEvent() throws Exception {
		organizer = organizerToken();
		fx = new CatalogFixtures(mvc, organizer);
		eventId = fx.createOnSaleEvent("City-" + UUID.randomUUID(), 2, 5);
		seats = CatalogFixtures.seatIds(jdbc, eventId);
	}

	protected ResultActions hold(String token, long... seatIds) throws Exception {
		StringBuilder ids = new StringBuilder();
		for (long id : seatIds) {
			ids.append(ids.isEmpty() ? "" : ",").append(id);
		}
		return mvc.perform(post("/api/events/" + eventId + "/holds").contentType(MediaType.APPLICATION_JSON)
				.content("{\"seatIds\":[" + ids + "]}").header("Authorization", bearer(token)));
	}

	/** Holds the two seats starting at position {@code from} in the event's seat list. */
	protected long holdTwo(Guest guest, int from) throws Exception {
		String body = hold(guest.token(), seats.get(from), seats.get(from + 1)).andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString();
		return ((Number) JsonPath.read(body, "$.id")).longValue();
	}

	protected ResultActions pay(String token, String key, long holdId, String paymentToken) throws Exception {
		var request = post("/api/orders").contentType(MediaType.APPLICATION_JSON)
				.content("{\"holdId\":%d,\"paymentToken\":\"%s\"}".formatted(holdId, paymentToken))
				.header("Authorization", bearer(token));
		if (key != null) {
			request.header("Idempotency-Key", key);
		}
		return mvc.perform(request);
	}

	protected ResultActions pay(Guest guest, String key, long holdId, String paymentToken) throws Exception {
		return pay(guest.token(), key, holdId, paymentToken);
	}

	/** Holds two seats and pays for them. Returns the order id. */
	protected long buyTwo(Guest guest, int from) throws Exception {
		return orderId(pay(guest, newKey(), holdTwo(guest, from), "tok_visa").andExpect(status().isCreated()));
	}

	protected static String newKey() {
		return "key-" + UUID.randomUUID();
	}

	protected long orderId(ResultActions result) throws Exception {
		return ((Number) JsonPath.read(result.andReturn().getResponse().getContentAsString(), "$.id")).longValue();
	}

	protected int chargesFor(long orderId) {
		return gateway.successfulCharges().containsKey("order-" + orderId) ? 1 : 0;
	}

	protected String seatStatus(long seatId) {
		return jdbc.sql("select status from event_seat where event_id = :e and seat_id = :s")
				.param("e", eventId).param("s", seatId).query(String.class).single();
	}

	protected String orderStatus(long orderId) {
		return jdbc.sql("select status from ticket_order where id = :o").param("o", orderId).query(String.class)
				.single();
	}

	/** Runs a count query. Parameters are named :p0, :p1 and so on. */
	protected int count(String sql, Object... params) {
		var spec = jdbc.sql(sql);
		for (int i = 0; i < params.length; i++) {
			spec = spec.param("p" + i, params[i]);
		}
		return spec.query(Integer.class).single();
	}

	/** Runs n calls at the same instant on virtual threads and returns each HTTP status. */
	protected List<Integer> race(int n, Call call) throws Exception {
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

	protected interface Call {
		ResultActions run(int index) throws Exception;
	}

	/**
	 * Facts about the whole database that must hold after anything the tests did, however many requests raced.
	 * Other tests share the database, so this checks everything they left behind as well.
	 */
	protected void assertMoneyAndSeatsAddUp() {
		assertThat(count("select count(*) from (select 1 from ticket where status <> 'VOID' "
				+ "group by event_id, seat_id having count(*) > 1) x")).as("seats sold twice").isZero();
		assertThat(count("select count(*) from ticket_order o where o.status = 'PAID' and o.total_cents <> "
				+ "(select coalesce(sum(face_cents + fee_cents), 0) from ticket where order_id = o.id)"))
				.as("paid orders whose tickets do not add up to the total").isZero();
		assertThat(count("select count(*) from ticket t join ticket_order o on o.id = t.order_id "
				+ "where o.status <> 'PAID'")).as("tickets on orders that are not paid").isZero();
		assertThat(count("select count(*) from event_seat es where es.status = 'SOLD' and exists "
				+ "(select 1 from ticket_order o where o.event_id = es.event_id) and not exists "
				+ "(select 1 from ticket t where t.event_id = es.event_id and t.seat_id = es.seat_id "
				+ "and t.status <> 'VOID')")).as("sold seats without a ticket (in events that have orders)").isZero();
		List<Long> paid = jdbc.sql("select id from ticket_order where status = 'PAID'").query(Long.class).list();
		assertThat(paid).as("every paid order was charged once")
				.allMatch(id -> gateway.successfulCharges().containsKey("order-" + id));
	}

}
