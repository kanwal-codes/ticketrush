package com.ticketrush.queue.infrastructure;

import com.ticketrush.catalog.application.EventLookup;
import com.ticketrush.catalog.domain.SaleState;
import com.ticketrush.queue.domain.EventFacts;
import com.ticketrush.queue.domain.SalePhase;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Optional;

/** Fills the waiting room's view of an event from the catalog. */
@Component
class CatalogEventFacts implements EventFacts {

	private final EventLookup lookup;

	CatalogEventFacts(EventLookup lookup) {
		this.lookup = lookup;
	}

	@Override
	public Optional<Facts> find(long eventId, Instant now) {
		return lookup.schedule(eventId).map(s -> new Facts(s.waitingRoom(),
				phase(SaleState.at(s.dropOpensAt(), s.onSaleAt(), s.startsAt(), now)), s.dropOpensAt()));
	}

	@Override
	public Optional<Long> organizerOf(long eventId) {
		return lookup.organizerOf(eventId);
	}

	private static SalePhase phase(SaleState state) {
		return switch (state) {
			case UPCOMING -> SalePhase.NOT_YET;
			case QUEUE_OPEN -> SalePhase.QUEUE_OPEN;
			case ON_SALE -> SalePhase.ON_SALE;
			case ENDED -> SalePhase.ENDED;
		};
	}

}
