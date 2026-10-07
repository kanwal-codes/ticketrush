package com.ticketrush.catalog.application;

import com.ticketrush.catalog.domain.Event;
import com.ticketrush.catalog.domain.EventPrice;
import com.ticketrush.catalog.domain.EventPriceRepository;
import com.ticketrush.catalog.domain.EventRepository;
import com.ticketrush.catalog.domain.EventStatus;
import com.ticketrush.catalog.domain.FeePolicy;
import com.ticketrush.catalog.domain.HoldStatus;
import com.ticketrush.catalog.domain.SaleState;
import com.ticketrush.catalog.domain.SeatHold;
import com.ticketrush.catalog.domain.SeatHoldRepository;
import com.ticketrush.catalog.domain.SeatStore;
import com.ticketrush.catalog.domain.SeatStore.ExpiryResult;
import com.ticketrush.catalog.domain.OrderStatus;
import com.ticketrush.catalog.domain.SeatStore.HeldSeat;
import com.ticketrush.catalog.domain.TicketOrderRepository;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Holding seats. The guarantee: a seat is in at most one live hold. It comes from one conditional claim in
 * the database (see JdbcSeatStore.claim), not from anything in this class, so it holds across threads and
 * across app instances.
 */
@Service
public class HoldService {

	private final EventRepository events;
	private final SeatHoldRepository holds;
	private final TicketOrderRepository orders;
	private final EventPriceRepository prices;
	private final SeatStore seats;
	private final AdmissionCheck admission;
	private final Clock clock;
	private final Duration ttl;
	private final int maxSeats;
	private final MeterRegistry meters;

	/** Orders in these states are using the hold's seats, so the hold must not be replaced or released. */
	private static final Set<OrderStatus> USING_THE_HOLD = EnumSet.of(OrderStatus.PENDING_PAYMENT, OrderStatus.PAID,
			OrderStatus.REFUNDING);

	public HoldService(EventRepository events, SeatHoldRepository holds, TicketOrderRepository orders,
			EventPriceRepository prices,
			SeatStore seats, AdmissionCheck admission, Clock clock, @Value("${ticketrush.holds.ttl}") Duration ttl,
			@Value("${ticketrush.holds.max-seats}") int maxSeats, MeterRegistry meters) {
		this.events = events;
		this.holds = holds;
		this.orders = orders;
		this.prices = prices;
		this.seats = seats;
		this.admission = admission;
		this.clock = clock;
		this.ttl = ttl;
		this.maxSeats = maxSeats;
		this.meters = meters;
	}

	public record HoldSeatView(long seatId, String section, String row, int number, long faceCents) {
	}

	/** Money in cents. Fees are per ticket, so they add up the same way the guest sees them. */
	public record HoldView(long id, long eventId, Instant expiresAt, Instant serverTime, List<HoldSeatView> seats,
			long subtotalCents, long feeCents, long totalCents) {
	}

	/**
	 * Holds the seats for the guest, replacing any hold they already have for this event. All or nothing: if any
	 * seat is not free, nothing changes, and the guest keeps their previous hold.
	 */
	@Transactional
	public HoldView hold(long userId, long eventId, List<Long> seatIds, String admissionToken) {
		try {
			HoldView view = tryHold(userId, eventId, seatIds, admissionToken);
			meters.counter("ticketrush.holds", "result", "held").increment();
			return view;
		}
		catch (SeatsUnavailableException e) {
			meters.counter("ticketrush.holds", "result", "seats_taken").increment();
			throw e;
		}
		catch (RuntimeException e) {
			meters.counter("ticketrush.holds", "result", "rejected").increment();
			throw e;
		}
	}

	private HoldView tryHold(long userId, long eventId, List<Long> seatIds, String admissionToken) {
		validate(seatIds);
		Instant now = clock.instant();
		Event event = events.findById(eventId).filter(e -> e.getStatus() == EventStatus.PUBLISHED)
				.orElseThrow(() -> new NotFoundException("Event " + eventId + " not found"));
		requireOnSale(event, now);
		if (event.isQueueEnabled()) {
			// Checked before touching any seat, so a guest who skipped the line costs the database nothing.
			admission.require(userId, eventId, admissionToken);
		}

		// One guest's requests for one event run one after the other, so a retry cannot fight itself.
		seats.lockUserEvent(userId, eventId);
		holds.findByEventIdAndUserIdAndStatus(eventId, userId, HoldStatus.ACTIVE).ifPresent(old -> {
			requireNotBeingPaidFor(old);
			seats.releaseHold(old.getId());
			old.markReleased();
			// Written before the new hold is inserted, or the one-active-hold index would reject the insert.
			holds.saveAndFlush(old);
		});

		SeatHold hold = holds.save(new SeatHold(eventId, userId, seatIds.size(), now, now.plus(ttl)));
		List<Long> claimed = seats.claim(eventId, hold.getId(), seatIds, now, hold.getExpiresAt());
		if (claimed.size() != seatIds.size()) {
			// Throwing rolls back the claim, the new hold and the release of the old one.
			throw explainFailure(eventId, seatIds, claimed);
		}
		return view(hold, now);
	}

	@Transactional(readOnly = true)
	public HoldView current(long userId, long eventId) {
		Instant now = clock.instant();
		return holds.findByEventIdAndUserIdAndStatus(eventId, userId, HoldStatus.ACTIVE)
				.filter(h -> h.isLive(now)).map(h -> view(h, now))
				.orElseThrow(() -> new NotFoundException("You have no active hold for this event"));
	}

	/** Gives the seats back. Safe to repeat. */
	@Transactional
	public void release(long userId, long holdId) {
		SeatHold hold = holds.findById(holdId)
				.orElseThrow(() -> new NotFoundException("Hold " + holdId + " not found"));
		if (!hold.isOwnedBy(userId)) {
			throw new NotOwnerException("This hold belongs to another guest");
		}
		if (hold.getStatus() == HoldStatus.ACTIVE) {
			requireNotBeingPaidFor(hold);
			seats.releaseHold(holdId);
			hold.markReleased();
		}
	}

	/** Housekeeping for the scheduled sweeper. Nothing depends on it running: expired seats are claimable anyway. */
	@Transactional
	public ExpiryResult expireDue() {
		return seats.expireDue(clock.instant());
	}

	private void requireNotBeingPaidFor(SeatHold hold) {
		if (orders.existsByHoldIdAndStatusIn(hold.getId(), USING_THE_HOLD)) {
			throw new PaymentInProgressException();
		}
	}

	private void validate(List<Long> seatIds) {
		if (seatIds == null || seatIds.isEmpty()) {
			throw new RuleViolationException("Pick at least one seat");
		}
		if (seatIds.size() > maxSeats) {
			throw new RuleViolationException("You can hold at most " + maxSeats + " seats at once");
		}
		if (new HashSet<>(seatIds).size() != seatIds.size()) {
			throw new RuleViolationException("Each seat can only be listed once");
		}
	}

	private static void requireOnSale(Event event, Instant now) {
		SaleState state = event.saleState(now);
		if (state == SaleState.ENDED) {
			throw new RuleViolationException("This event has already started");
		}
		if (state != SaleState.ON_SALE) {
			throw new RuleViolationException("Tickets are not on sale yet");
		}
	}

	private RuntimeException explainFailure(long eventId, List<Long> requested, List<Long> claimed) {
		Set<Long> known = new HashSet<>(seats.seatsInEvent(eventId, requested));
		List<Long> foreign = requested.stream().filter(id -> !known.contains(id)).toList();
		if (!foreign.isEmpty()) {
			return new RuleViolationException("Seat " + foreign.get(0) + " is not part of this event");
		}
		Set<Long> got = new HashSet<>(claimed);
		return new SeatsUnavailableException(requested.stream().filter(id -> !got.contains(id)).toList());
	}

	private HoldView view(SeatHold hold, Instant now) {
		Map<Long, Integer> faceBySection = prices.findByEventId(hold.getEventId()).stream()
				.collect(Collectors.toMap(EventPrice::getSectionId, EventPrice::getPriceCents));
		List<HoldSeatView> items = seats.heldSeats(hold.getId()).stream()
				.map(s -> toView(s, faceBySection)).toList();
		long subtotal = items.stream().mapToLong(HoldSeatView::faceCents).sum();
		long fees = items.stream().mapToLong(i -> FeePolicy.fee(i.faceCents())).sum();
		return new HoldView(hold.getId(), hold.getEventId(), hold.getExpiresAt(), now, items, subtotal, fees,
				subtotal + fees);
	}

	private static HoldSeatView toView(HeldSeat seat, Map<Long, Integer> faceBySection) {
		return new HoldSeatView(seat.seatId(), seat.sectionName(), seat.row(), seat.number(),
				faceBySection.get(seat.sectionId()));
	}

}
