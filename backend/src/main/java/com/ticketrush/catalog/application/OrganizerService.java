package com.ticketrush.catalog.application;

import com.ticketrush.catalog.application.EventQueryService.PageView;
import com.ticketrush.catalog.application.EventQueryService.PosterView;
import com.ticketrush.catalog.domain.Event;
import com.ticketrush.catalog.domain.EventPriceRepository;
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
import java.time.Instant;
import java.util.List;
import java.util.Map;

/** What an organizer sees of their own events. Every read checks the event is theirs. */
@Service
public class OrganizerService {

	static final int MAX_SCANS = 100;
	static final int MAX_PAGE = 50;

	private final EventRepository events;
	private final EventPriceRepository prices;
	private final OrganizerStore store;
	private final Clock clock;

	public OrganizerService(EventRepository events, EventPriceRepository prices, OrganizerStore store, Clock clock) {
		this.events = events;
		this.prices = prices;
		this.store = store;
		this.clock = clock;
	}

	/** An event as the organizer's form edits it, whatever its status. */
	public record OrganizerEvent(long id, EventStatus status, String title, String artist, String description,
			long venueId, Instant startsAt, Instant doorsAt, Instant dropOpensAt, Instant onSaleAt, PosterView poster,
			List<PriceView> prices, boolean waitingRoom) {
	}

	public record PriceView(long sectionId, int priceCents) {
	}

	public record SalesSummary(long eventId, String title, EventStatus status, List<TierRow> tiers, Revenue revenue,
			Map<String, Long> ordersByStatus, Door door) {
	}

	/** One page of the organizer's events, newest first. */
	@Transactional(readOnly = true)
	public PageView<EventRow> events(long organizerId, int page, int size) {
		int pageSize = Math.max(1, Math.min(size, MAX_PAGE));
		int index = Math.max(0, page);
		long total = store.countEventsOf(organizerId);
		List<EventRow> items = store.eventsOf(organizerId, pageSize, index * pageSize);
		return new PageView<>(items, index, pageSize, total, (int) Math.ceil(total / (double) pageSize));
	}

	@Transactional(readOnly = true)
	public OrganizerEvent event(long organizerId, long eventId) {
		Event e = owned(organizerId, eventId);
		List<PriceView> priced = prices.findByEventId(eventId).stream()
				.map(p -> new PriceView(p.getSectionId(), p.getPriceCents())).toList();
		return new OrganizerEvent(e.getId(), e.getStatus(), e.getTitle(), e.getArtist(), e.getDescription(),
				e.getVenue().getId(), e.getStartsAt(), e.getDoorsAt(), e.getDropOpensAt(), e.getOnSaleAt(),
				new PosterView(e.getPosterStyle(), e.getInkOne(), e.getInkTwo(), e.getPaperColor()), priced,
				e.isQueueEnabled());
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
