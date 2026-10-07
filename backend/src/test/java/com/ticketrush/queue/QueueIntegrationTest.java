package com.ticketrush.queue;

import com.ticketrush.catalog.api.CatalogFixtures;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class QueueIntegrationTest extends QueueTestSupport {

	@Test
	void guestsAreNumberedInArrivalOrderAndRefreshingKeepsYourPlace() throws Exception {
		int eventId = onSaleQueueEvent();
		List<Guest> guests = createGuests(5);
		for (int i = 0; i < 5; i++) {
			join(guests.get(i), eventId).andExpect(status().isOk())
					.andExpect(jsonPath("$.state").value("WAITING"))
					.andExpect(jsonPath("$.position").value(i + 1))
					.andExpect(jsonPath("$.aheadOfYou").value(i))
					.andExpect(jsonPath("$.queueLength").value(i + 1));
		}

		// Joining again, or checking after a page refresh, never moves you.
		join(guests.get(1), eventId).andExpect(jsonPath("$.position").value(2));
		queueStatus(guests.get(1), eventId).andExpect(jsonPath("$.position").value(2))
				.andExpect(jsonPath("$.queueLength").value(5));
		join(guests.get(4), eventId).andExpect(jsonPath("$.position").value(5));
	}

	@Test
	void leavingMovesEveryoneBehindUpByOne() throws Exception {
		int eventId = onSaleQueueEvent();
		List<Guest> guests = createGuests(4);
		for (Guest guest : guests) {
			join(guest, eventId).andExpect(status().isOk());
		}

		leave(guests.get(1), eventId).andExpect(status().isNoContent());

		queueStatus(guests.get(0), eventId).andExpect(jsonPath("$.position").value(1));
		queueStatus(guests.get(2), eventId).andExpect(jsonPath("$.position").value(2));
		queueStatus(guests.get(3), eventId).andExpect(jsonPath("$.position").value(3))
				.andExpect(jsonPath("$.queueLength").value(3));
		queueStatus(guests.get(1), eventId).andExpect(jsonPath("$.state").value("NOT_IN_QUEUE"))
				.andExpect(jsonPath("$.position").doesNotExist());
		leave(guests.get(1), eventId).andExpect(status().isNoContent());
	}

	@Test
	void aGuestWhoNeverJoinedIsNotInTheQueue() throws Exception {
		int eventId = onSaleQueueEvent();
		queueStatus(createGuests(1).get(0), eventId).andExpect(status().isOk())
				.andExpect(jsonPath("$.state").value("NOT_IN_QUEUE"))
				.andExpect(jsonPath("$.queueLength").value(0));
	}

	@Test
	void youCanJoinOnceTheWaitingRoomOpensButNotBefore() throws Exception {
		Guest guest = createGuests(1).get(0);

		int upcoming = queueEvent(Instant.now().plus(2, ChronoUnit.DAYS));
		join(guest, upcoming).andExpect(status().isConflict())
				.andExpect(jsonPath("$.title").value("Waiting room closed"))
				.andExpect(jsonPath("$.detail", startsWith("The waiting room opens at ")));

		int queueOpen = queueOpenEvent();
		join(guest, queueOpen).andExpect(status().isOk())
				.andExpect(jsonPath("$.state").value("WAITING"))
				.andExpect(jsonPath("$.saleState").value("QUEUE_OPEN"));
	}

	@Test
	void youCannotJoinAfterTheEventHasStarted() throws Exception {
		int eventId = queueOpenEvent();
		clock.advance(Duration.ofDays(31));
		join(createGuests(1).get(0), eventId).andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail").value("This event has already started"));
	}

	@Test
	void eventsWithoutAWaitingRoomUnknownEventsAndDraftsAreRefused() throws Exception {
		Guest guest = createGuests(1).get(0);
		CatalogFixtures fx = new CatalogFixtures(mvc, organizerToken());
		Instant onSale = Instant.now().minus(1, ChronoUnit.HOURS);
		Instant starts = Instant.now().plus(30, ChronoUnit.DAYS);
		var venue = fx.createVenue("Montreal");

		int plain = fx.createPublished(venue, "Plain", "Artist", onSale, starts);
		join(guest, plain).andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail").value("This event has no waiting room"));
		int draft = fx.createDraft(venue, "Draft", "Artist", onSale, starts);
		join(guest, draft).andExpect(status().isNotFound());
		join(guest, 999999).andExpect(status().isNotFound());
	}

	@Test
	void theWaitingRoomNeedsASignIn() throws Exception {
		int eventId = onSaleQueueEvent();
		mvc.perform(post("/api/events/" + eventId + "/queue")).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/events/" + eventId + "/queue")).andExpect(status().isUnauthorized());
	}

	@Test
	void joiningTooOftenIsRefusedWithAWaitTime() throws Exception {
		int eventId = onSaleQueueEvent();
		Guest guest = createGuests(1).get(0);
		alignToSafePartOfTheMinute();

		for (int i = 1; i <= 20; i++) {
			join(guest, eventId).andExpect(status().isOk());
		}
		join(guest, eventId).andExpect(status().isTooManyRequests())
				.andExpect(header().exists("Retry-After"))
				.andExpect(jsonPath("$.title").value("Slow down"));
		// Someone else is not affected by this guest's limit.
		join(createGuests(1).get(0), eventId).andExpect(status().isOk());
		assertThat(Long.parseLong(join(guest, eventId).andReturn().getResponse().getHeader("Retry-After")))
				.isBetween(1L, 60L);
	}

}
