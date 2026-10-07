package com.ticketrush.queue;

import com.ticketrush.queue.application.QueueService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Many guests and many admission rounds at the same instant. Test settings: 10 per round, 15 inside at most. */
class QueueConcurrencyIntegrationTest extends QueueTestSupport {

	@Autowired
	private QueueService queue;

	private <T> List<T> race(List<Callable<T>> tasks) throws Exception {
		CountDownLatch gun = new CountDownLatch(1);
		List<Future<T>> futures = new ArrayList<>();
		try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
			for (Callable<T> task : tasks) {
				futures.add(pool.submit(() -> {
					gun.await();
					return task.call();
				}));
			}
			gun.countDown();
		}
		List<T> results = new ArrayList<>();
		for (Future<T> future : futures) {
			results.add(future.get());
		}
		return results;
	}

	@Test
	void twoHundredGuestsJoinAtOnceAndEndUpWithPlacesOneToTwoHundred() throws Exception {
		int eventId = onSaleQueueEvent();
		List<Guest> guests = createGuests(200);

		List<Integer> codes = race(guests.stream().<Callable<Integer>>map(g -> () -> join(g, eventId).andReturn()
				.getResponse().getStatus()).toList());
		assertThat(codes).allMatch(code -> code == 200);

		List<Integer> positions = new ArrayList<>();
		for (Guest guest : guests) {
			positions.add(Integer.parseInt(field(queueStatus(guest, eventId), "$.position")));
		}
		// Every guest has a different place, and the places have no gaps.
		assertThat(positions).hasSize(200).doesNotHaveDuplicates();
		assertThat(positions.stream().collect(Collectors.toSet()))
				.isEqualTo(IntStream.rangeClosed(1, 200).boxed().collect(Collectors.toSet()));
	}

	@Test
	void eightAdmissionRoundsAtOnceNeverLetInMoreThanTheCapOrTheSameGuestTwice() throws Exception {
		int eventId = onSaleQueueEvent();
		List<Guest> guests = createGuests(100);
		for (Guest guest : guests) {
			join(guest, eventId).andExpect(status().isOk());
		}

		race(IntStream.range(0, 8).<Callable<Integer>>mapToObj(i -> queue::admitDue).toList());

		List<Integer> admitted = new ArrayList<>();
		for (int i = 0; i < guests.size(); i++) {
			if ("ADMITTED".equals(field(queueStatus(guests.get(i), eventId), "$.state"))) {
				admitted.add(i);
			}
		}
		// Exactly the cap, and exactly the first 15 in line.
		assertThat(admitted).containsExactlyElementsOf(IntStream.range(0, 15).boxed().toList());
		long stillWaiting = guests.stream().filter(g -> {
			try {
				return "WAITING".equals(field(queueStatus(g, eventId), "$.state"));
			}
			catch (Exception e) {
				throw new IllegalStateException(e);
			}
		}).count();
		assertThat(stillWaiting).isEqualTo(85);
	}

}
