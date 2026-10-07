package com.ticketrush.queue;

import com.jayway.jsonpath.JsonPath;
import com.ticketrush.queue.application.QueueService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Test settings: 10 admitted per round, at most 15 inside at once, rounds are run by hand with the clock
 * moved as needed. Other tests' events share Redis, so assertions look only at this test's own guests.
 */
class QueueAdmissionIntegrationTest extends QueueTestSupport {

	@Autowired
	private QueueService queue;

	private List<Guest> joinAll(int eventId, int count) throws Exception {
		List<Guest> guests = createGuests(count);
		for (Guest guest : guests) {
			join(guest, eventId).andExpect(status().isOk());
		}
		return guests;
	}

	private String state(Guest guest, int eventId) throws Exception {
		return field(queueStatus(guest, eventId), "$.state");
	}

	@Test
	void nobodyIsLetInUntilTheSaleOpens() throws Exception {
		int eventId = queueOpenEvent();
		List<Guest> guests = joinAll(eventId, 3);

		queue.admitDue();
		for (Guest guest : guests) {
			assertThat(state(guest, eventId)).isEqualTo("WAITING");
		}

		clock.advance(Duration.ofMinutes(6));
		queue.admitDue();
		for (Guest guest : guests) {
			queueStatus(guest, eventId).andExpect(jsonPath("$.state").value("ADMITTED"))
					.andExpect(jsonPath("$.saleState").value("ON_SALE"));
		}
	}

	@Test
	void eachRoundLetsInExactlyTheNextGuestsInOrder() throws Exception {
		int eventId = onSaleQueueEvent();
		List<Guest> guests = joinAll(eventId, 25);

		queue.admitDue();
		for (int i = 0; i < 25; i++) {
			assertThat(state(guests.get(i), eventId)).isEqualTo(i < 10 ? "ADMITTED" : "WAITING");
		}
		// The 11th guest is now first in line, and the line is 15 long.
		queueStatus(guests.get(10), eventId).andExpect(jsonPath("$.position").value(1))
				.andExpect(jsonPath("$.queueLength").value(15));
	}

	@Test
	void noMoreThanTheCapAreInsideUntilAdmissionsRunOut() throws Exception {
		int eventId = onSaleQueueEvent();
		List<Guest> guests = joinAll(eventId, 40);

		queue.admitDue(); // 10 inside
		queue.admitDue(); // 15 inside, the cap
		queue.admitDue(); // nobody more fits
		long inside = 0;
		for (Guest guest : guests) {
			if (state(guest, eventId).equals("ADMITTED")) {
				inside++;
			}
		}
		assertThat(inside).isEqualTo(15);

		// Ten minutes pass, the admissions run out, the next guests are let in.
		clock.advance(Duration.ofMinutes(11));
		queue.admitDue();
		assertThat(state(guests.get(0), eventId)).isEqualTo("NOT_IN_QUEUE");
		assertThat(state(guests.get(15), eventId)).isEqualTo("ADMITTED");
		assertThat(state(guests.get(24), eventId)).isEqualTo("ADMITTED");
		assertThat(state(guests.get(25), eventId)).isEqualTo("WAITING");
	}

	@Test
	void leavingFreesARoomForTheNextGuest() throws Exception {
		int eventId = onSaleQueueEvent();
		List<Guest> guests = joinAll(eventId, 20);
		queue.admitDue();
		queue.admitDue(); // 15 inside, 5 waiting
		assertThat(state(guests.get(15), eventId)).isEqualTo("WAITING");

		leave(guests.get(0), eventId).andExpect(status().isNoContent());
		queue.admitDue();

		assertThat(state(guests.get(15), eventId)).isEqualTo("ADMITTED");
		assertThat(state(guests.get(16), eventId)).isEqualTo("WAITING");
	}

	@Test
	void joiningAgainWhileAdmittedDoesNotPutYouBackInLine() throws Exception {
		int eventId = onSaleQueueEvent();
		List<Guest> guests = joinAll(eventId, 3);
		queue.admitDue();

		join(guests.get(0), eventId).andExpect(jsonPath("$.state").value("ADMITTED"))
				.andExpect(jsonPath("$.queueLength").value(0));
	}

	@Test
	void theAdmissionTokenNamesTheGuestTheEventAndWhenItEnds() throws Exception {
		int eventId = onSaleQueueEvent();
		Guest guest = joinAll(eventId, 1).get(0);
		Instant before = clock.instant();
		queue.admitDue();

		var admitted = queueStatus(guest, eventId).andExpect(jsonPath("$.state").value("ADMITTED"));
		String body = admitted.andReturn().getResponse().getContentAsString();
		String token = JsonPath.read(body, "$.admissionToken");
		Instant until = Instant.parse(JsonPath.read(body, "$.admittedUntil"));
		assertThat(Duration.between(before, until)).isBetween(Duration.ofMinutes(10).minusSeconds(5),
				Duration.ofMinutes(10).plusSeconds(5));

		String payload = new String(Base64.getUrlDecoder().decode(token.split("\\.")[1]));
		assertThat(JsonPath.<String>read(payload, "$.scope")).isEqualTo("admission");
		assertThat(JsonPath.<Integer>read(payload, "$.event")).isEqualTo(eventId);
		assertThat(JsonPath.<String>read(payload, "$.sub")).isEqualTo(String.valueOf(guest.id()));
		assertThat(Instant.ofEpochSecond(JsonPath.<Integer>read(payload, "$.exp").longValue()))
				.isBetween(until.minusSeconds(1), until.plusSeconds(1));
	}

	@Test
	void theWaitEstimateComesFromTheAdmissionRate() throws Exception {
		int eventId = onSaleQueueEvent();
		List<Guest> guests = joinAll(eventId, 25);
		// 24 guests ahead at 10 per second is 2.4 seconds, rounded up.
		queueStatus(guests.get(24), eventId).andExpect(jsonPath("$.aheadOfYou").value(24))
				.andExpect(jsonPath("$.estimatedWaitSeconds").value(3));
		queueStatus(guests.get(0), eventId).andExpect(jsonPath("$.estimatedWaitSeconds").value(0));
	}

}
