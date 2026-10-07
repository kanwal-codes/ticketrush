package com.ticketrush.catalog.api;

import com.jayway.jsonpath.JsonPath;
import com.ticketrush.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * The point of the project: many people grab the same seats at the same moment and the answer is always
 * consistent. Every request below is released at the same instant from its own virtual thread.
 */
class HoldConcurrencyIntegrationTest extends AbstractIntegrationTest {

	record Result(int status, String body) {
	}

	private Result holdSeats(Guest guest, int eventId, List<Long> seatIds) throws Exception {
		var response = mvc.perform(post("/api/events/" + eventId + "/holds").contentType(MediaType.APPLICATION_JSON)
				.content("{\"seatIds\":" + seatIds + "}").header("Authorization", bearer(guest.token())))
				.andReturn().getResponse();
		return new Result(response.getStatus(), response.getContentAsString());
	}

	/** Starts every task at once and waits for all of them. */
	private List<Result> race(List<Callable<Result>> tasks) throws Exception {
		CountDownLatch gun = new CountDownLatch(1);
		List<Future<Result>> futures = new ArrayList<>();
		try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
			for (Callable<Result> task : tasks) {
				futures.add(pool.submit(() -> {
					gun.await();
					return task.call();
				}));
			}
			gun.countDown();
		}
		List<Result> results = new ArrayList<>();
		for (Future<Result> future : futures) {
			results.add(future.get());
		}
		return results;
	}

	private static long count(List<Result> results, int status) {
		return results.stream().filter(r -> r.status() == status).count();
	}

	private static String city() {
		return "City" + UUID.randomUUID().toString().substring(0, 8);
	}

	private CatalogFixtures organizerFixtures() throws Exception {
		return new CatalogFixtures(mvc, organizerToken());
	}

	private int scalar(String sql, int eventId) {
		return jdbc.sql(sql).param("e", eventId).query(Integer.class).single();
	}

	@Test
	void threeHundredGuestsRaceForOneSeatAndExactlyOneWins() throws Exception {
		int eventId = organizerFixtures().createOnSaleEvent(city(), 1, 5);
		long seat = CatalogFixtures.seatIds(jdbc, eventId).get(0);
		List<Guest> guests = createGuests(300);

		List<Callable<Result>> tasks = new ArrayList<>();
		for (Guest guest : guests) {
			tasks.add(() -> holdSeats(guest, eventId, List.of(seat)));
		}
		List<Result> results = race(tasks);

		assertThat(count(results, 201)).isEqualTo(1);
		assertThat(count(results, 409)).isEqualTo(299);
		assertThat(results).allSatisfy(r -> assertThat(r.status()).isIn(201, 409));
		assertThat(scalar("select count(*) from event_seat where event_id = :e and status = 'HELD'", eventId))
				.isEqualTo(1);

		// The seat belongs to the guest whose request succeeded.
		Result winner = results.stream().filter(r -> r.status() == 201).findFirst().orElseThrow();
		int winningHold = JsonPath.read(winner.body(), "$.id");
		long holder = jdbc.sql("select hold_id from event_seat where event_id = :e and seat_id = :s")
				.param("e", eventId).param("s", seat).query(Long.class).single();
		assertThat(holder).isEqualTo(winningHold);
	}

	@Test
	void fiveHundredGuestsGrabOverlappingPairsAndNoSeatIsEverHeldTwice() throws Exception {
		int eventId = organizerFixtures().createOnSaleEvent(city(), 1, 40);
		List<Long> seats = CatalogFixtures.seatIds(jdbc, eventId);
		List<Guest> guests = createGuests(500);
		Random random = new Random(42);

		List<List<Long>> wanted = new ArrayList<>();
		List<Callable<Result>> tasks = new ArrayList<>();
		for (Guest guest : guests) {
			int first = random.nextInt(seats.size());
			int second = (first + 1 + random.nextInt(seats.size() - 1)) % seats.size();
			List<Long> pair = List.of(seats.get(first), seats.get(second));
			wanted.add(pair);
			tasks.add(() -> holdSeats(guest, eventId, pair));
		}
		List<Result> results = race(tasks);

		// Every answer is a clean yes or no. No crashes, no deadlocks, no timeouts.
		assertThat(results).allSatisfy(r -> assertThat(r.status()).isIn(201, 409));
		long granted = count(results, 201);
		assertThat(granted).isBetween(1L, 20L); // 40 seats, 2 per hold

		// Each success got exactly the seats it asked for.
		for (int i = 0; i < results.size(); i++) {
			if (results.get(i).status() == 201) {
				List<Integer> got = JsonPath.read(results.get(i).body(), "$.seats[*].seatId");
				assertThat(new HashSet<>(got.stream().map(Integer::longValue).toList()))
						.isEqualTo(new HashSet<>(wanted.get(i)));
			}
		}

		// The database agrees with the answers given.
		assertThat(scalar("select count(*) from seat_hold where event_id = :e and status = 'ACTIVE'", eventId))
				.isEqualTo((int) granted);
		assertThat(scalar("select count(*) from event_seat where event_id = :e and status = 'HELD'", eventId))
				.isEqualTo((int) granted * 2);
		// Every held seat belongs to an active hold.
		assertThat(scalar("select count(*) from event_seat s join seat_hold h on h.id = s.hold_id "
				+ "where s.event_id = :e and s.status = 'HELD' and h.status <> 'ACTIVE'", eventId)).isZero();
		// Every active hold holds exactly the number of seats it says it does.
		assertThat(scalar("select count(*) from seat_hold h where h.event_id = :e and h.status = 'ACTIVE' "
				+ "and h.seat_count <> (select count(*) from event_seat s where s.hold_id = h.id "
				+ "and s.status = 'HELD')", eventId)).isZero();
		// And no two winners share a seat: distinct held seats equals total held rows.
		assertThat(scalar("select count(distinct seat_id) from event_seat where event_id = :e and status = 'HELD'",
				eventId)).isEqualTo((int) granted * 2);
	}

	@Test
	void aRetryStormFromOneGuestEndsWithExactlyOneHold() throws Exception {
		int eventId = organizerFixtures().createOnSaleEvent(city(), 1, 5);
		List<Long> seats = CatalogFixtures.seatIds(jdbc, eventId);
		Guest guest = createGuests(1).get(0);
		List<Long> pair = List.of(seats.get(0), seats.get(1));

		List<Callable<Result>> tasks = new ArrayList<>();
		for (int i = 0; i < 10; i++) {
			tasks.add(() -> holdSeats(guest, eventId, pair));
		}
		List<Result> results = race(tasks);

		// One guest's requests run one after another, each replacing the last, so all succeed.
		assertThat(count(results, 201)).isEqualTo(10);
		assertThat(scalar("select count(*) from seat_hold where event_id = :e and status = 'ACTIVE'", eventId))
				.isEqualTo(1);
		assertThat(scalar("select count(*) from seat_hold where event_id = :e and status = 'RELEASED'", eventId))
				.isEqualTo(9);
		assertThat(scalar("select count(*) from event_seat where event_id = :e and status = 'HELD'", eventId))
				.isEqualTo(2);
	}

	@Test
	void aHundredGuestsRaceForASeatWhoseHoldJustExpiredAndExactlyOneWins() throws Exception {
		int eventId = organizerFixtures().createOnSaleEvent(city(), 1, 5);
		long seat = CatalogFixtures.seatIds(jdbc, eventId).get(0);
		List<Guest> guests = createGuests(101);
		assertThat(holdSeats(guests.get(0), eventId, List.of(seat)).status()).isEqualTo(201);
		clock.advance(Duration.ofMinutes(11));

		List<Callable<Result>> tasks = new ArrayList<>();
		for (Guest guest : guests.subList(1, 101)) {
			tasks.add(() -> holdSeats(guest, eventId, List.of(seat)));
		}
		List<Result> results = race(tasks);

		assertThat(count(results, 201)).isEqualTo(1);
		assertThat(count(results, 409)).isEqualTo(99);
		Set<Long> holders = new HashSet<>(jdbc.sql("select h.user_id from event_seat s join seat_hold h "
				+ "on h.id = s.hold_id where s.event_id = :e and s.seat_id = :s and s.status = 'HELD'")
				.param("e", eventId).param("s", seat).query(Long.class).list());
		assertThat(holders).hasSize(1).doesNotContain(guests.get(0).id());
	}

}
