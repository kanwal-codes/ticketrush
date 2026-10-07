package com.ticketrush.queue.domain;

import java.time.Instant;
import java.util.Optional;

/** What the waiting room needs to know about an event. Filled in from the catalog by an adapter. */
public interface EventFacts {

	Optional<Facts> find(long eventId, Instant now);

	record Facts(boolean waitingRoom, SalePhase phase, Instant opensAt) {
	}

}
