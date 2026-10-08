package com.ticketrush.catalog.application;

import com.ticketrush.catalog.application.OrderQueryService.OrderView;
import com.ticketrush.catalog.application.OrderQueryService.TicketView;
import com.ticketrush.catalog.domain.Event;
import com.ticketrush.catalog.domain.EventRepository;
import com.ticketrush.catalog.domain.OrganizerStore;
import com.ticketrush.catalog.domain.SeatStore;
import com.ticketrush.catalog.domain.SeatStore.HeldSeat;
import com.ticketrush.catalog.domain.Ticket;
import com.ticketrush.catalog.domain.TicketOrder;
import com.ticketrush.catalog.domain.TicketOrderRepository;
import com.ticketrush.catalog.domain.TicketRepository;
import com.ticketrush.catalog.domain.TicketStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;

/** A guest's tickets, their QR codes, and accepting them at the door. */
@Service
public class TicketService {

	private final TicketRepository tickets;
	private final TicketOrderRepository orders;
	private final EventRepository events;
	private final SeatStore seats;
	private final OrderQueryService orderViews;
	private final OrganizerStore organizer;
	private final Clock clock;

	public TicketService(TicketRepository tickets, TicketOrderRepository orders, EventRepository events,
			SeatStore seats, OrderQueryService orderViews, OrganizerStore organizer, Clock clock) {
		this.tickets = tickets;
		this.orders = orders;
		this.events = events;
		this.seats = seats;
		this.orderViews = orderViews;
		this.organizer = organizer;
		this.clock = clock;
	}

	public record MyTicket(long id, String code, String orderReference, long eventId, String section, String row,
			int number, TicketStatus status) {
	}

	public enum ScanOutcome {
		VALID, ALREADY_USED, WRONG_EVENT, UNKNOWN
	}

	/** The seat is shown to the person at the door; usedAt only when the ticket was already accepted. */
	public record ScanResult(ScanOutcome outcome, @Schema(nullable = true) String seat,
			@Schema(nullable = true) Instant usedAt) {
	}

	/** Every ticket the guest holds, newest order first. */
	public List<MyTicket> mine(long userId) {
		return orderViews.list(userId).stream().flatMap(order -> order.tickets().stream()
				.map(t -> toMine(order, t))).toList();
	}

	public String qrSvg(long userId, long ticketId) {
		Ticket ticket = tickets.findById(ticketId)
				.orElseThrow(() -> new NotFoundException("Ticket " + ticketId + " not found"));
		if (!ticket.isOwnedBy(userId)) {
			throw new NotOwnerException("This ticket belongs to another guest");
		}
		return QrSvg.of(ticket.getCode());
	}

	/**
	 * Accepts a ticket for an event the organizer owns. {@code eventId} is the event the door is working, when
	 * the scanning app knows it; a ticket for another event is turned away without being used up.
	 */
	@Transactional
	public ScanResult scan(long organizerId, String code, Long eventId) {
		String clean = code.trim().toUpperCase();
		Ticket ticket = tickets.findByCode(clean).orElse(null);
		if (ticket == null || ticket.getStatus() == TicketStatus.VOID) {
			return log(organizerId, clean, eventId, null, new ScanResult(ScanOutcome.UNKNOWN, null, null));
		}
		Event event = events.findById(ticket.getEventId()).orElseThrow();
		if (!event.getOrganizerId().equals(organizerId)) {
			throw new NotOwnerException();
		}
		if (eventId != null && !eventId.equals(ticket.getEventId())) {
			return log(organizerId, clean, eventId, null, new ScanResult(ScanOutcome.WRONG_EVENT, null, null));
		}
		String seat = seatLabel(ticket);
		ScanResult result = tickets.markUsed(ticket.getCode(), clock.instant()) == 1
				? new ScanResult(ScanOutcome.VALID, seat, null)
				: new ScanResult(ScanOutcome.ALREADY_USED, seat, tickets.usedAt(ticket.getCode()));
		return log(organizerId, clean, eventId, ticket.getEventId(), result);
	}

	/**
	 * Writes down what happened at the door, after the ticket itself was dealt with, so the record can never change
	 * the outcome. It goes under the event the door was working when that event is the scanner's own, otherwise
	 * under the ticket's event; a code that belongs to nobody and a door nobody owns leave no trace.
	 */
	private ScanResult log(long organizerId, String code, Long doorEventId, Long ticketEventId, ScanResult result) {
		Long target = doorEventId != null && events.findById(doorEventId).filter(e -> e.isOwnedBy(organizerId)).isPresent()
				? doorEventId : ticketEventId;
		if (target != null) {
			organizer.recordScan(target, organizerId, code, result.outcome().name(), result.seat(), clock.instant());
		}
		return result;
	}

	private String seatLabel(Ticket ticket) {
		TicketOrder order = orders.findById(ticket.getOrderId()).orElseThrow();
		return seats.heldSeats(order.getHoldId()).stream().filter(s -> s.seatId() == ticket.getSeatId()).findFirst()
				.map(TicketService::label).orElse(null);
	}

	private static String label(HeldSeat seat) {
		return seat.sectionName() + " " + seat.row() + seat.number();
	}

	private static MyTicket toMine(OrderView order, TicketView t) {
		return new MyTicket(t.id(), t.code(), order.reference(), order.eventId(), t.section(), t.row(), t.number(),
				t.status());
	}

}
