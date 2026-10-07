package com.ticketrush.queue;

import com.ticketrush.catalog.api.CatalogFixtures;
import com.ticketrush.queue.application.QueueService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** On an event with a waiting room, holding seats needs an admission token for that guest and that event. */
class HoldAdmissionGateIntegrationTest extends QueueTestSupport {

	@Autowired
	private QueueService queue;

	private ResultActions hold(Guest guest, int eventId, long seatId, String admissionToken) throws Exception {
		var request = post("/api/events/" + eventId + "/holds").contentType(MediaType.APPLICATION_JSON)
				.content("{\"seatIds\":[" + seatId + "]}").header("Authorization", bearer(guest.token()));
		if (admissionToken != null) {
			request.header("X-Admission-Token", admissionToken);
		}
		return mvc.perform(request);
	}

	private String admittedToken(Guest guest, int eventId) throws Exception {
		join(guest, eventId).andExpect(status().isOk());
		queue.admitDue();
		return field(queueStatus(guest, eventId), "$.admissionToken");
	}

	private long firstSeat(int eventId) {
		return CatalogFixtures.seatIds(jdbc, eventId).get(0);
	}

	private String seatState(int eventId, long seatId) {
		return jdbc.sql("select status from event_seat where event_id = :e and seat_id = :s")
				.param("e", eventId).param("s", seatId).query(String.class).single();
	}

	@Test
	void withoutATokenYouCannotHoldAndNothingIsTouched() throws Exception {
		int eventId = onSaleQueueEvent();
		Guest guest = createGuests(1).get(0);

		hold(guest, eventId, firstSeat(eventId), null).andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("ADMISSION_REQUIRED"))
				.andExpect(jsonPath("$.title").value("Waiting room"));
		assertThat(seatState(eventId, firstSeat(eventId))).isEqualTo("AVAILABLE");
	}

	@Test
	void anAdmittedGuestCanHoldAndKeepShoppingUntilTheAdmissionEnds() throws Exception {
		int eventId = onSaleQueueEvent();
		List<Long> seats = CatalogFixtures.seatIds(jdbc, eventId);
		Guest guest = createGuests(1).get(0);
		String token = admittedToken(guest, eventId);

		hold(guest, eventId, seats.get(0), token).andExpect(status().isCreated());
		hold(guest, eventId, seats.get(1), token).andExpect(status().isCreated());
		assertThat(seatState(eventId, seats.get(0))).isEqualTo("AVAILABLE");
		assertThat(seatState(eventId, seats.get(1))).isEqualTo("HELD");
	}

	@Test
	void aGuestStillWaitingCannotUseSomeoneElsesToken() throws Exception {
		int eventId = onSaleQueueEvent();
		List<Guest> guests = createGuests(2);
		String firstGuestsToken = admittedToken(guests.get(0), eventId);

		hold(guests.get(1), eventId, firstSeat(eventId), firstGuestsToken).andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("ADMISSION_REQUIRED"));
	}

	@Test
	void aTokenForAnotherEventIsRefused() throws Exception {
		int eventA = onSaleQueueEvent();
		int eventB = onSaleQueueEvent();
		Guest guest = createGuests(1).get(0);
		String tokenForA = admittedToken(guest, eventA);

		hold(guest, eventB, firstSeat(eventB), tokenForA).andExpect(status().isForbidden());
		hold(guest, eventA, firstSeat(eventA), tokenForA).andExpect(status().isCreated());
	}

	@Test
	void anExpiredTokenIsRefused() throws Exception {
		int eventId = onSaleQueueEvent();
		Guest guest = createGuests(1).get(0);
		String token = admittedToken(guest, eventId);

		clock.advance(Duration.ofMinutes(11));

		hold(guest, eventId, firstSeat(eventId), token).andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("ADMISSION_REQUIRED"));
	}

	@Test
	void aSignInTokenGarbageAndATamperedTokenAreAllRefused() throws Exception {
		int eventId = onSaleQueueEvent();
		Guest guest = createGuests(1).get(0);
		String real = admittedToken(guest, eventId);
		String tampered = real.substring(0, real.length() - 4) + (real.endsWith("AAAA") ? "BBBB" : "AAAA");

		for (String bad : List.of(guest.token(), "not-a-token", tampered, " ")) {
			hold(guest, eventId, firstSeat(eventId), bad).andExpect(status().isForbidden())
					.andExpect(jsonPath("$.code").value("ADMISSION_REQUIRED"));
		}
		assertThat(seatState(eventId, firstSeat(eventId))).isEqualTo("AVAILABLE");
	}

	@Test
	void eventsWithoutAWaitingRoomNeedNoToken() throws Exception {
		CatalogFixtures fx = new CatalogFixtures(mvc, organizerToken());
		var now = java.time.Instant.now();
		int plain = fx.createPublished(fx.createVenue("Montreal"), "Plain", "Artist",
				now.minus(Duration.ofHours(1)), now.plus(Duration.ofDays(30)));
		Guest guest = createGuests(1).get(0);

		hold(guest, plain, firstSeat(plain), null).andExpect(status().isCreated());
	}

}
