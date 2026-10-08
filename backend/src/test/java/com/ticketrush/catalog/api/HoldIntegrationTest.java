package com.ticketrush.catalog.api;

import com.jayway.jsonpath.JsonPath;
import com.ticketrush.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
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

class HoldIntegrationTest extends AbstractIntegrationTest {

	private CatalogFixtures fx;
	private int eventId;
	private List<Long> seats;

	/** A fresh on-sale event with the standard 15-seat venue: seats 0 to 9 are Floor, 10 to 14 Balcony. */
	private void setUpEvent() throws Exception {
		fx = new CatalogFixtures(mvc, organizerToken());
		Instant now = Instant.now();
		eventId = fx.createPublished(fx.createVenue("Montreal"), "Held Show", "Artist",
				now.minus(1, ChronoUnit.HOURS), now.plus(30, ChronoUnit.DAYS));
		seats = CatalogFixtures.seatIds(jdbc, eventId);
	}

	private ResultActions hold(String token, int event, long... seatIds) throws Exception {
		var request = post("/api/events/" + event + "/holds").contentType(MediaType.APPLICATION_JSON)
				.content("{\"seatIds\":" + Arrays.toString(seatIds) + "}");
		if (token != null) {
			request.header("Authorization", bearer(token));
		}
		return mvc.perform(request);
	}

	private String seatStatus(long seatId) {
		return jdbc.sql("select status from event_seat where event_id = :e and seat_id = :s")
				.param("e", eventId).param("s", seatId).query(String.class).single();
	}

	private int count(String status, long userId) {
		return jdbc.sql("select count(*) from seat_hold where event_id = :e and user_id = :u and status = :st")
				.param("e", eventId).param("u", userId).param("st", status).query(Integer.class).single();
	}

	@Test
	void holdingSeatsReturnsAnItemisedPriceAndTenMinutes() throws Exception {
		setUpEvent();
		Guest guest = createGuests(1).get(0);

		String body = hold(guest.token(), eventId, seats.get(0), seats.get(1)).andExpect(status().isCreated())
				.andExpect(jsonPath("$.seats.length()").value(2))
				.andExpect(jsonPath("$.seats[0].section").value("Floor"))
				.andExpect(jsonPath("$.seats[0].row").value("A"))
				.andExpect(jsonPath("$.seats[0].number").value(1))
				.andExpect(jsonPath("$.seats[0].faceCents").value(12800))
				.andExpect(jsonPath("$.subtotalCents").value(25600))
				.andExpect(jsonPath("$.feeCents").value(1920))
				.andExpect(jsonPath("$.totalCents").value(27520))
				.andReturn().getResponse().getContentAsString();

		Instant serverTime = Instant.parse(JsonPath.read(body, "$.serverTime"));
		Instant expiresAt = Instant.parse(JsonPath.read(body, "$.expiresAt"));
		assertThat(Duration.between(serverTime, expiresAt)).isEqualTo(Duration.ofMinutes(10));
		assertThat(seatStatus(seats.get(0))).isEqualTo("HELD");
		assertThat(seatStatus(seats.get(2))).isEqualTo("AVAILABLE");

		mvc.perform(get("/api/events/" + eventId + "/seats"))
				.andExpect(jsonPath("$.sections[0].rows[0].seats[0].status").value("HELD"))
				.andExpect(jsonPath("$.sections[0].rows[0].seats[2].status").value("AVAILABLE"));
		mvc.perform(get("/api/events/" + eventId).header("Accept", "application/json"))
				.andExpect(jsonPath("$.availableSeats").value(13));
		mvc.perform(get("/api/events/" + eventId + "/holds/me").header("Authorization", bearer(guest.token())))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value((int) (long) JsonPath.<Integer>read(body, "$.id")));
	}

	@Test
	void aSeatHeldByOneGuestCannotBeTakenByAnotherAndNothingIsHalfHeld() throws Exception {
		setUpEvent();
		List<Guest> guests = createGuests(2);
		hold(guests.get(0).token(), eventId, seats.get(0)).andExpect(status().isCreated());

		hold(guests.get(1).token(), eventId, seats.get(0)).andExpect(status().isConflict())
				.andExpect(jsonPath("$.title").value("Seats unavailable"))
				.andExpect(jsonPath("$.unavailableSeatIds[0]").value((int) (long) seats.get(0)));

		// Asking for a free seat together with a taken one fails as a whole: the free seat stays free.
		hold(guests.get(1).token(), eventId, seats.get(1), seats.get(0)).andExpect(status().isConflict());
		assertThat(seatStatus(seats.get(1))).isEqualTo("AVAILABLE");
		assertThat(count("ACTIVE", guests.get(1).id())).isZero();
	}

	@Test
	void aNewHoldReplacesTheGuestsOldOne() throws Exception {
		setUpEvent();
		Guest guest = createGuests(1).get(0);
		hold(guest.token(), eventId, seats.get(0)).andExpect(status().isCreated());
		hold(guest.token(), eventId, seats.get(1)).andExpect(status().isCreated());

		assertThat(seatStatus(seats.get(0))).isEqualTo("AVAILABLE");
		assertThat(seatStatus(seats.get(1))).isEqualTo("HELD");
		assertThat(count("ACTIVE", guest.id())).isEqualTo(1);
		assertThat(count("RELEASED", guest.id())).isEqualTo(1);
	}

	@Test
	void aFailedReplacementLeavesTheOldHoldUntouched() throws Exception {
		setUpEvent();
		List<Guest> guests = createGuests(2);
		hold(guests.get(0).token(), eventId, seats.get(0)).andExpect(status().isCreated());
		hold(guests.get(1).token(), eventId, seats.get(1)).andExpect(status().isCreated());

		hold(guests.get(0).token(), eventId, seats.get(1)).andExpect(status().isConflict());

		mvc.perform(get("/api/events/" + eventId + "/holds/me").header("Authorization", bearer(guests.get(0).token())))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.seats[0].seatId").value((int) (long) seats.get(0)));
		assertThat(seatStatus(seats.get(0))).isEqualTo("HELD");
		assertThat(count("ACTIVE", guests.get(0).id())).isEqualTo(1);
	}

	@Test
	void ownersReleaseIsRepeatableAndStrangersAreRefused() throws Exception {
		setUpEvent();
		List<Guest> guests = createGuests(2);
		String body = hold(guests.get(0).token(), eventId, seats.get(0)).andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString();
		int holdId = JsonPath.read(body, "$.id");

		mvc.perform(delete("/api/holds/" + holdId).header("Authorization", bearer(guests.get(1).token())))
				.andExpect(status().isForbidden());
		assertThat(seatStatus(seats.get(0))).isEqualTo("HELD");

		mvc.perform(delete("/api/holds/" + holdId).header("Authorization", bearer(guests.get(0).token())))
				.andExpect(status().isNoContent());
		mvc.perform(delete("/api/holds/" + holdId).header("Authorization", bearer(guests.get(0).token())))
				.andExpect(status().isNoContent());
		assertThat(seatStatus(seats.get(0))).isEqualTo("AVAILABLE");

		mvc.perform(delete("/api/holds/999999").header("Authorization", bearer(guests.get(0).token())))
				.andExpect(status().isNotFound());
		mvc.perform(get("/api/events/" + eventId + "/holds/me").header("Authorization", bearer(guests.get(0).token())))
				.andExpect(status().isNotFound());
		// Once released, another guest can take the seat.
		hold(guests.get(1).token(), eventId, seats.get(0)).andExpect(status().isCreated());
	}

	@Test
	void rulesAreEnforcedWithClearReasons() throws Exception {
		setUpEvent();
		String token = createGuests(1).get(0).token();

		hold(token, eventId, seats.get(0), seats.get(1), seats.get(2), seats.get(3), seats.get(4), seats.get(5),
				seats.get(6)).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("You can hold at most 6 seats at once"));
		hold(token, eventId, seats.get(0), seats.get(0)).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("Each seat can only be listed once"));
		mvc.perform(post("/api/events/" + eventId + "/holds").contentType(MediaType.APPLICATION_JSON)
				.content("{\"seatIds\":[]}").header("Authorization", bearer(token)))
				.andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.seatIds").exists());
		hold(null, eventId, seats.get(0)).andExpect(status().isUnauthorized());
		hold(token, 999999, 1).andExpect(status().isNotFound());

		// A seat that belongs to some other event.
		Instant now = Instant.now();
		int other = fx.createPublished(fx.createVenue("Montreal"), "Other", "Artist", now.minus(1, ChronoUnit.HOURS),
				now.plus(30, ChronoUnit.DAYS));
		long foreign = CatalogFixtures.seatIds(jdbc, other).get(0);
		hold(token, eventId, foreign).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("Seat " + foreign + " is not part of this event"));
		assertThat(seatStatus(seats.get(0))).isEqualTo("AVAILABLE");
	}

	@Test
	void seatsCannotBeHeldBeforeTheSaleOpens() throws Exception {
		setUpEvent();
		String token = createGuests(1).get(0).token();
		Instant now = Instant.now();
		Instant starts = now.plus(30, ChronoUnit.DAYS);

		int notYet = fx.createPublished(fx.createVenue("Montreal"), "Later", "Artist", now.plus(2, ChronoUnit.DAYS),
				starts);
		int queueOpen = fx.createPublished(fx.createVenue("Montreal"), "Queue", "Artist",
				now.plus(5, ChronoUnit.MINUTES), starts);
		for (int event : new int[] { notYet, queueOpen }) {
			long seat = CatalogFixtures.seatIds(jdbc, event).get(0);
			hold(token, event, seat).andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.detail").value("Tickets are not on sale yet"));
		}
	}

	@Test
	void guestsCanHoldButStillCannotUseOrganizerEndpoints() throws Exception {
		setUpEvent();
		String guest = createGuests(1).get(0).token();
		hold(guest, eventId, seats.get(0)).andExpect(status().isCreated());
		new CatalogFixtures(mvc, guest).send("/api/events", "{}").andExpect(status().isForbidden());
		new CatalogFixtures(mvc, guest).send("/api/events/" + eventId + "/publish", null)
				.andExpect(status().isForbidden());
	}

	@Test
	void seatsThatAreAlreadyTakenAreRefusedWithoutWritingAnything() throws Exception {
		setUpEvent();
		List<Guest> guests = createGuests(2);
		hold(guests.get(0).token(), eventId, seats.get(0)).andExpect(status().isCreated());
		int holdsBefore = jdbc.sql("select count(*) from seat_hold where event_id = :e").param("e", eventId)
				.query(Integer.class).single();

		hold(guests.get(1).token(), eventId, seats.get(0), seats.get(1)).andExpect(status().isConflict())
				.andExpect(jsonPath("$.unavailableSeatIds.length()").value(1))
				.andExpect(jsonPath("$.unavailableSeatIds[0]").value(seats.get(0)));

		// No hold row was created, and the free seat in the request was not touched either.
		assertThat(jdbc.sql("select count(*) from seat_hold where event_id = :e").param("e", eventId)
				.query(Integer.class).single()).isEqualTo(holdsBefore);
		assertThat(seatStatus(seats.get(1))).isEqualTo("AVAILABLE");
	}

	@Test
	void holdingSeatsYouAlreadyHoldReplacesYourHoldInsteadOfBeingRefused() throws Exception {
		setUpEvent();
		Guest guest = createGuests(1).get(0);
		hold(guest.token(), eventId, seats.get(0), seats.get(1)).andExpect(status().isCreated());

		// A refresh or a retry after a timeout sends the same seats again. They are yours, so this must work.
		hold(guest.token(), eventId, seats.get(0), seats.get(1)).andExpect(status().isCreated());

		assertThat(count("ACTIVE", guest.id())).isEqualTo(1);
		assertThat(count("RELEASED", guest.id())).isEqualTo(1);
		assertThat(seatStatus(seats.get(0))).isEqualTo("HELD");
		assertThat(seatStatus(seats.get(1))).isEqualTo("HELD");
	}

}
