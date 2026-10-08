package com.ticketrush.catalog.application;

import com.ticketrush.catalog.domain.Event;
import com.ticketrush.catalog.domain.EventRepository;
import com.ticketrush.catalog.domain.EventStatus;
import com.ticketrush.catalog.domain.OrganizerStore;
import com.ticketrush.catalog.domain.OrganizerStore.Door;
import com.ticketrush.catalog.domain.OrganizerStore.EventRow;
import com.ticketrush.catalog.domain.OrganizerStore.Revenue;
import com.ticketrush.catalog.domain.OrganizerStore.ScanRow;
import com.ticketrush.catalog.domain.OrganizerStore.TierRow;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.List;
import java.util.Map;

/** What an organizer sees of their own events. Every read checks the event is theirs. */
@Service
public class OrganizerService {

	static final int MAX_SCANS = 100;

	private final EventRepository events;
	private final OrganizerStore store;
	private final Clock clock;

	public OrganizerService(EventRepository events, OrganizerStore store, Clock clock) {
		this.events = events;
		this.store = store;
		this.clock = clock;
	}

	public record SalesSummary(long eventId, String title, EventStatus status, List<TierRow> tiers, Revenue revenue,
			Map<String, Long> ordersByStatus, Door door) {
	}

	@Transactional(readOnly = true)
	public List<EventRow> events(long organizerId) {
		return store.eventsOf(organizerId);
	}

	@Transactional(readOnly = true)
	public SalesSummary summary(long organizerId, long eventId) {
		Event event = owned(organizerId, eventId);
		return new SalesSummary(eventId, event.getTitle(), event.getStatus(), store.tiers(eventId, clock.instant()),
				store.revenue(eventId), store.ordersByStatus(eventId), store.door(eventId));
	}

	@Transactional(readOnly = true)
	public List<ScanRow> scans(long organizerId, long eventId, int limit) {
		owned(organizerId, eventId);
		return store.recentScans(eventId, Math.max(1, Math.min(limit, MAX_SCANS)));
	}

	/** The event's owner, for modules that need to check ownership without loading the event. */
	@Transactional(readOnly = true)
	public Event owned(long organizerId, long eventId) {
		Event event = events.findById(eventId)
				.orElseThrow(() -> new NotFoundException("Event " + eventId + " not found"));
		if (!event.isOwnedBy(organizerId)) {
			throw new NotOwnerException();
		}
		return event;
	}

}
