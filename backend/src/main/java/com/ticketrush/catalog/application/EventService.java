package com.ticketrush.catalog.application;

import com.ticketrush.catalog.domain.Event;
import com.ticketrush.catalog.domain.EventPrice;
import com.ticketrush.catalog.domain.EventPriceRepository;
import com.ticketrush.catalog.domain.EventRepository;
import com.ticketrush.catalog.domain.EventStatus;
import com.ticketrush.catalog.domain.PosterStyle;
import com.ticketrush.catalog.domain.SeatStore;
import com.ticketrush.catalog.domain.SentEmail;
import com.ticketrush.catalog.domain.SentEmailRepository;
import com.ticketrush.catalog.domain.TicketOrder;
import com.ticketrush.catalog.domain.TicketOrderRepository;
import com.ticketrush.catalog.domain.TicketRepository;
import com.ticketrush.catalog.domain.Venue;
import com.ticketrush.catalog.domain.VenueRepository;
import com.ticketrush.catalog.domain.VenueSection;
import com.ticketrush.catalog.domain.VenueSectionRepository;
import com.ticketrush.identity.domain.User;
import com.ticketrush.identity.domain.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class EventService {

	private static final Logger log = LoggerFactory.getLogger(EventService.class);

	private final EventRepository events;
	private final EventPriceRepository prices;
	private final VenueRepository venues;
	private final VenueSectionRepository sections;
	private final SeatStore seats;
	private final TicketOrderRepository orderRows;
	private final TicketRepository tickets;
	private final OrderService orders;
	private final SentEmailRepository emails;
	private final UserRepository users;
	private final TransactionTemplate tx;
	private final Clock clock;

	public EventService(EventRepository events, EventPriceRepository prices, VenueRepository venues,
			VenueSectionRepository sections, SeatStore seats, TicketOrderRepository orderRows,
			TicketRepository tickets, OrderService orders, SentEmailRepository emails, UserRepository users,
			TransactionTemplate tx, Clock clock) {
		this.events = events;
		this.prices = prices;
		this.venues = venues;
		this.sections = sections;
		this.seats = seats;
		this.orderRows = orderRows;
		this.tickets = tickets;
		this.orders = orders;
		this.emails = emails;
		this.users = users;
		this.tx = tx;
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
		Venue venue = checkRules(cmd);
		Poster poster = cmd.poster();
		Event event = events.save(new Event(organizerId, venue, cmd.title().strip(), cmd.artist().strip(),
				cmd.description() == null ? "" : cmd.description().strip(), cmd.startsAt(), cmd.doorsAt(),
				cmd.dropOpensAt(), cmd.onSaleAt(), poster.style(), poster.inkOne(), poster.inkTwo(),
				poster.paperColor(), cmd.waitingRoom()));
		savePrices(event.getId(), cmd);
		return new EventRef(event.getId(), event.getStatus());
	}

	/**
	 * Replaces a draft with a new version of itself, under the same rules as creating one. Only a draft can be
	 * changed: once it is published guests have seen it and may hold seats, so it is cancelled and remade instead.
	 */
	@Transactional
	public EventRef update(long organizerId, long eventId, NewEvent cmd) {
		Event event = lockOwned(organizerId, eventId);
		if (event.getStatus() != EventStatus.DRAFT) {
			throw new NotEditableException("Only a draft can be edited. Cancel this event and create a new one instead.");
		}
		Venue venue = checkRules(cmd);
		Poster poster = cmd.poster();
		event.revise(venue, cmd.title().strip(), cmd.artist().strip(),
				cmd.description() == null ? "" : cmd.description().strip(), cmd.startsAt(), cmd.doorsAt(),
				cmd.dropOpensAt(), cmd.onSaleAt(), poster.style(), poster.inkOne(), poster.inkTwo(),
				poster.paperColor(), cmd.waitingRoom());
		prices.deleteByEventId(eventId);
		savePrices(eventId, cmd);
		return ref(event);
	}

	/** The rules for an event's times, venue and prices, shared by create and update so they cannot drift apart. */
	private Venue checkRules(NewEvent cmd) {
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
		return venue;
	}

	private void savePrices(long eventId, NewEvent cmd) {
		prices.saveAll(cmd.prices().stream().map(p -> new EventPrice(eventId, p.sectionId(), p.priceCents())).toList());
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

	/**
	 * Takes the event off sale and gives every guest their money back. In one transaction the event is cancelled and
	 * each paid order that nobody has been admitted on is set to REFUNDING, its tickets voided and its seats freed.
	 * After that commits the refunds are sent; one that fails stays REFUNDING and the reconciler retries it, so a
	 * provider outage cannot lose a refund. An order with a ticket already scanned is left alone: that guest was
	 * let in. Safe to repeat: a second cancel finds nothing left to refund.
	 */
	public EventRef cancel(long organizerId, long eventId) {
		Cancelled done = tx.execute(status -> cancelInTransaction(organizerId, eventId));
		for (long orderId : done.refunds()) {
			try {
				orders.completeRefund(orderId);
			}
			catch (RuntimeException e) {
				log.warn("Refund of order {} did not go through, the reconciler will retry it: {}", orderId, e.getMessage());
			}
		}
		return done.ref();
	}

	private record Cancelled(EventRef ref, List<Long> refunds) {
	}

	private Cancelled cancelInTransaction(long organizerId, long eventId) {
		Event event = lockOwned(organizerId, eventId);
		if (event.getStatus() != EventStatus.CANCELLED) {
			event.markCancelled();
		}
		List<Long> refunds = new ArrayList<>();
		for (TicketOrder order : orderRows.findPaidByEventId(eventId)) {
			if (tickets.anyUsed(order.getId())) {
				continue;
			}
			seats.freeSoldSeatsOf(order.getId());
			tickets.voidIssued(order.getId());
			order.markRefunding(order.getPaymentRef(), "The event was cancelled. You are being refunded.");
			refunds.add(order.getId());
			tellGuest(event, order);
		}
		return new Cancelled(ref(event), refunds);
	}

	/** Leaves the guest a message, to be sent by the email relay, that the event is off and the money is coming back. */
	private void tellGuest(Event event, TicketOrder order) {
		if (emails.existsByOrderIdAndKind(order.getId(), SentEmail.CANCELLATION)) {
			return;
		}
		User guest = users.findById(order.getUserId()).orElseThrow();
		String body = "Hi %s, %s was cancelled by the organizer. Order %s, %s in total, is being refunded to the card you paid with. "
				+ "Refunds usually show up within a few business days.";
		emails.save(new SentEmail(order.getId(), SentEmail.CANCELLATION, guest.getEmail(),
				event.getTitle() + " was cancelled, order " + order.getPublicRef(),
				body.formatted(guest.getDisplayName(), event.getTitle(), order.getPublicRef(),
						String.format(Locale.CANADA, "$%,.2f", order.getTotalCents() / 100.0)),
				clock.instant()));
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
