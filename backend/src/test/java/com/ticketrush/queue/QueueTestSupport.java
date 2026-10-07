package com.ticketrush.queue;

import com.jayway.jsonpath.JsonPath;
import com.ticketrush.AbstractIntegrationTest;
import com.ticketrush.catalog.api.CatalogFixtures;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** Shared helpers for the waiting-room tests. */
public abstract class QueueTestSupport extends AbstractIntegrationTest {

	protected ResultActions join(Guest guest, int eventId) throws Exception {
		return mvc.perform(post("/api/events/" + eventId + "/queue").header("Authorization", bearer(guest.token())));
	}

	protected ResultActions queueStatus(Guest guest, int eventId) throws Exception {
		return mvc.perform(get("/api/events/" + eventId + "/queue").header("Authorization", bearer(guest.token())));
	}

	protected ResultActions leave(Guest guest, int eventId) throws Exception {
		return mvc.perform(delete("/api/events/" + eventId + "/queue").header("Authorization", bearer(guest.token())));
	}

	protected String field(ResultActions result, String path) throws Exception {
		Object value = JsonPath.read(result.andReturn().getResponse().getContentAsString(), path);
		return value == null ? null : value.toString();
	}

	/** A queue-enabled event whose sale is already open. */
	protected int onSaleQueueEvent() throws Exception {
		return queueEvent(Instant.now().minus(1, ChronoUnit.HOURS));
	}

	/** A queue-enabled event whose waiting room is open but whose sale starts in 5 minutes. */
	protected int queueOpenEvent() throws Exception {
		return queueEvent(Instant.now().plus(5, ChronoUnit.MINUTES));
	}

	protected int queueEvent(Instant onSaleAt) throws Exception {
		CatalogFixtures fx = new CatalogFixtures(mvc, organizerToken());
		return fx.createQueued(fx.createVenue("Montreal"), "Hot Drop", "Artist", onSaleAt,
				Instant.now().plus(30, ChronoUnit.DAYS));
	}

	protected void alignToSafePartOfTheMinute() {
		long second = clock.instant().getEpochSecond() % 60;
		if (second > 35) {
			clock.advance(Duration.ofSeconds(60 - second + 5));
		}
	}

}
