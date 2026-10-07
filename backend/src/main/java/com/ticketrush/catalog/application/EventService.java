package com.ticketrush.catalog.application;

import com.ticketrush.catalog.domain.Event;
import com.ticketrush.catalog.domain.EventPrice;
import com.ticketrush.catalog.domain.EventPriceRepository;
import com.ticketrush.catalog.domain.EventRepository;
import com.ticketrush.catalog.domain.EventStatus;
import com.ticketrush.catalog.domain.PosterStyle;
import com.ticketrush.catalog.domain.SeatStore;
import com.ticketrush.catalog.domain.Venue;
import com.ticketrush.catalog.domain.VenueRepository;
import com.ticketrush.catalog.domain.VenueSection;
import com.ticketrush.catalog.domain.VenueSectionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class EventService {

	private final EventRepository events;
	private final EventPriceRepository prices;
	private final VenueRepository venues;
	private final VenueSectionRepository sections;
	private final SeatStore seats;
	private final Clock clock;

	public EventService(EventRepository events, EventPriceRepository prices, VenueRepository venues,
			VenueSectionRepository sections, SeatStore seats, Clock clock) {
		this.events = events;
		this.prices = prices;
		this.venues = venues;
		this.sections = sections;
		this.seats = seats;
		this.clock = clock;
	}

	public record Poster(PosterStyle style, String inkOne, String inkTwo, String paperColor) {
	}

	public record PriceSpec(long sectionId, int priceCents) {
	}

	public record NewEvent(String title, String artist, String description, long venueId, Instant startsAt,
			Instant doorsAt, Instant dropOpensAt, Instant onSaleAt, Poster poster, List<PriceSpec> prices,
			boolean waitingRoom) {
	}

	public record EventRef(long id, EventStatus status) {
	}

	/** Creates a draft. Nothing is visible to guests and no seats exist until it is published. */
	@Transactional
	public EventRef create(long organizerId, NewEvent cmd) {
		if (cmd.dropOpensAt().isAfter(cmd.onSaleAt())) {
			throw new RuleViolationException("The waiting room cannot open after tickets go on sale");
		}
		if (!cmd.onSaleAt().isBefore(cmd.startsAt())) {
			throw new RuleViolationException("Tickets must go on sale before the event starts");
		}
		if (cmd.doorsAt().isAfter(cmd.startsAt())) {
			throw new RuleViolationException("Doors cannot open after the event starts");
		}
		if (!cmd.startsAt().isAfter(clock.instant())) {
			throw new RuleViolationException("The event must start in the future");
		}

		Venue venue = venues.findById(cmd.venueId())
				.orElseThrow(() -> new NotFoundException("Venue " + cmd.venueId() + " not found"));
		Set<Long> venueSections = sections.findByVenueIdOrderBySortOrder(venue.getId()).stream()
				.map(VenueSection::getId).collect(Collectors.toSet());
		Set<Long> seen = new HashSet<>();
		for (PriceSpec price : cmd.prices()) {
			if (!venueSections.contains(price.sectionId())) {
				throw new RuleViolationException("Section " + price.sectionId() + " is not part of this venue");
			}
			if (!seen.add(price.sectionId())) {
				throw new RuleViolationException("Section " + price.sectionId() + " is priced twice");
			}
		}

		Poster poster = cmd.poster();
		Event event = events.save(new Event(organizerId, venue, cmd.title().strip(), cmd.artist().strip(),
				cmd.description() == null ? "" : cmd.description().strip(), cmd.startsAt(), cmd.doorsAt(),
				cmd.dropOpensAt(), cmd.onSaleAt(), poster.style(), poster.inkOne(), poster.inkTwo(),
				poster.paperColor(), cmd.waitingRoom()));
		prices.saveAll(cmd.prices().stream()
				.map(p -> new EventPrice(event.getId(), p.sectionId(), p.priceCents())).toList());
		return new EventRef(event.getId(), event.getStatus());
	}

	/**
	 * Makes the event visible and creates one inventory row per seat. Safe to call twice: the event row is
	 * locked, so a second concurrent call waits and then finds it already published.
	 */
	@Transactional
	public EventRef publish(long organizerId, long eventId) {
		Event event = lockOwned(organizerId, eventId);
		if (event.getStatus() == EventStatus.PUBLISHED) {
			return ref(event);
		}
		if (event.getStatus() == EventStatus.CANCELLED) {
			throw new RuleViolationException("A cancelled event cannot be published");
		}
		if (!event.getStartsAt().isAfter(clock.instant())) {
			throw new RuleViolationException("An event that has already started cannot be published");
		}

		long venueId = event.getVenue().getId();
		Set<Long> priced = prices.findByEventId(eventId).stream().map(EventPrice::getSectionId)
				.collect(Collectors.toSet());
		List<String> missing = sections.findByVenueIdOrderBySortOrder(venueId).stream()
				.filter(s -> !priced.contains(s.getId())).map(VenueSection::getName).toList();
		if (!missing.isEmpty()) {
			throw new RuleViolationException("Every section needs a price. Missing: " + String.join(", ", missing));
		}

		seats.createEventInventory(eventId, venueId);
		event.markPublished();
		return ref(event);
	}

	@Transactional
	public EventRef cancel(long organizerId, long eventId) {
		Event event = lockOwned(organizerId, eventId);
		if (event.getStatus() != EventStatus.CANCELLED) {
			event.markCancelled();
		}
		return ref(event);
	}

	private Event lockOwned(long organizerId, long eventId) {
		Event event = events.findByIdForUpdate(eventId)
				.orElseThrow(() -> new NotFoundException("Event " + eventId + " not found"));
		if (!event.isOwnedBy(organizerId)) {
			throw new NotOwnerException();
		}
		return event;
	}

	private static EventRef ref(Event event) {
		return new EventRef(event.getId(), event.getStatus());
	}

}
