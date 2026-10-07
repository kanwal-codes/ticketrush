package com.ticketrush.catalog.api;

import com.ticketrush.AbstractIntegrationTest;
import com.ticketrush.catalog.application.HoldService;
import com.ticketrush.catalog.domain.SeatStore.ExpiryResult;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The scheduled sweeper is switched off in tests (interval one hour). Expiry is driven by moving the clock. */
class HoldExpiryIntegrationTest extends AbstractIntegrationTest {

	@Autowired
	private HoldService holdService;

	private int eventId;
	private List<Long> seats;

	private void setUpEvent() throws Exception {
		CatalogFixtures fx = new CatalogFixtures(mvc, organizerToken());
		Instant now = Instant.now();
		eventId = fx.createPublished(fx.createVenue("Montreal"), "Expiry Show", "Artist",
				now.minus(1, ChronoUnit.HOURS), now.plus(30, ChronoUnit.DAYS));
		seats = CatalogFixtures.seatIds(jdbc, eventId);
	}

	private ResultActions hold(Guest guest, long... seatIds) throws Exception {
		return mvc.perform(post("/api/events/" + eventId + "/holds").contentType(MediaType.APPLICATION_JSON)
				.content("{\"seatIds\":" + Arrays.toString(seatIds) + "}")
				.header("Authorization", bearer(guest.token())));
	}

	private String seatStatus(long seatId) {
		return jdbc.sql("select status from event_seat where event_id = :e and seat_id = :s")
				.param("e", eventId).param("s", seatId).query(String.class).single();
	}

	private String holdStatus(long userId) {
		return jdbc.sql("select status from seat_hold where event_id = :e and user_id = :u order by id desc limit 1")
				.param("e", eventId).param("u", userId).query(String.class).single();
	}

	@Test
	void anExpiredHoldFreesTheSeatEvenIfTheSweeperNeverRuns() throws Exception {
		setUpEvent();
		List<Guest> guests = createGuests(2);
		hold(guests.get(0), seats.get(0)).andExpect(status().isCreated());

		clock.advance(Duration.ofMinutes(11));

		// Still HELD in the table, but every read already treats it as available.
		assertThat(seatStatus(seats.get(0))).isEqualTo("HELD");
		mvc.perform(get("/api/events/" + eventId + "/seats"))
				.andExpect(jsonPath("$.sections[0].rows[0].seats[0].status").value("AVAILABLE"));
		mvc.perform(get("/api/events/" + eventId)).andExpect(jsonPath("$.availableSeats").value(15));
		mvc.perform(get("/api/events/" + eventId + "/holds/me")
				.header("Authorization", bearer(guests.get(0).token()))).andExpect(status().isNotFound());

		// So another guest can take it right away.
		hold(guests.get(1), seats.get(0)).andExpect(status().isCreated());
		assertThat(holdStatus(guests.get(1).id())).isEqualTo("ACTIVE");
	}

	@Test
	void theSweeperFreesSeatsAndMarksTheHoldExpired() throws Exception {
		setUpEvent();
		Guest guest = createGuests(1).get(0);
		hold(guest, seats.get(0), seats.get(1)).andExpect(status().isCreated());
		clock.advance(Duration.ofMinutes(11));

		// The sweeper is global, so other tests' leftovers may be counted too: check at least ours.
		ExpiryResult first = holdService.expireDue();
		assertThat(first.seatsFreed()).isGreaterThanOrEqualTo(2);
		assertThat(first.holdsExpired()).isGreaterThanOrEqualTo(1);
		assertThat(seatStatus(seats.get(0))).isEqualTo("AVAILABLE");
		assertThat(holdStatus(guest.id())).isEqualTo("EXPIRED");
		int stillLinked = jdbc.sql("select count(*) from event_seat where event_id = :e and hold_id is not null")
				.param("e", eventId).query(Integer.class).single();
		assertThat(stillLinked).isZero();

		ExpiryResult second = holdService.expireDue();
		assertThat(second.seatsFreed()).isZero();
		assertThat(second.holdsExpired()).isZero();
	}

	@Test
	void theSweeperLeavesLiveHoldsAlone() throws Exception {
		setUpEvent();
		Guest guest = createGuests(1).get(0);
		hold(guest, seats.get(0)).andExpect(status().isCreated());
		clock.advance(Duration.ofMinutes(9));

		holdService.expireDue();

		assertThat(seatStatus(seats.get(0))).isEqualTo("HELD");
		assertThat(holdStatus(guest.id())).isEqualTo("ACTIVE");
	}

	@Test
	void releasingAnExpiredHoldNeverFreesTheSeatsOfWhoeverTookThemNext() throws Exception {
		setUpEvent();
		List<Guest> guests = createGuests(2);
		String body = hold(guests.get(0), seats.get(0)).andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString();
		int oldHold = com.jayway.jsonpath.JsonPath.read(body, "$.id");
		clock.advance(Duration.ofMinutes(11));
		hold(guests.get(1), seats.get(0)).andExpect(status().isCreated());

		mvc.perform(delete("/api/holds/" + oldHold).header("Authorization", bearer(guests.get(0).token())))
				.andExpect(status().isNoContent());

		assertThat(seatStatus(seats.get(0))).isEqualTo("HELD");
		assertThat(holdStatus(guests.get(1).id())).isEqualTo("ACTIVE");
	}

	@Test
	void aGuestWithAnExpiredHoldCanHoldAgain() throws Exception {
		setUpEvent();
		Guest guest = createGuests(1).get(0);
		hold(guest, seats.get(0)).andExpect(status().isCreated());
		clock.advance(Duration.ofMinutes(11));

		hold(guest, seats.get(1)).andExpect(status().isCreated());

		assertThat(seatStatus(seats.get(1))).isEqualTo("HELD");
		assertThat(jdbc.sql("select count(*) from seat_hold where event_id = :e and user_id = :u and status = 'ACTIVE'")
				.param("e", eventId).param("u", guest.id()).query(Integer.class).single()).isEqualTo(1);
	}

}
