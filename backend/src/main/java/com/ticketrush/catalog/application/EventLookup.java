package com.ticketrush.catalog.application;

import com.ticketrush.catalog.domain.EventRepository;
import com.ticketrush.catalog.domain.EventStatus;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;

/** The few event facts other modules need, cheap enough to ask on every request. */
@Service
public class EventLookup {

	private final EventRepository events;

	public EventLookup(EventRepository events) {
		this.events = events;
	}

	/** The schedule of a published event. Cached for a moment, because it rarely changes and is asked often. */
	public record Schedule(boolean waitingRoom, Instant dropOpensAt, Instant onSaleAt, Instant startsAt) {
	}

	@Cacheable(cacheNames = "eventschedule", key = "#eventId")
	@Transactional(readOnly = true)
	public Optional<Schedule> schedule(long eventId) {
		return events.findById(eventId).filter(e -> e.getStatus() == EventStatus.PUBLISHED)
				.map(e -> new Schedule(e.isQueueEnabled(), e.getDropOpensAt(), e.getOnSaleAt(), e.getStartsAt()));
	}

}
