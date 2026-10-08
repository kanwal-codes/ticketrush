package com.ticketrush.catalog.application;

import com.ticketrush.catalog.domain.EventPrice;
import com.ticketrush.catalog.domain.EventPriceRepository;
import com.ticketrush.catalog.domain.FeePolicy;
import com.ticketrush.catalog.domain.OrderStatus;
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

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/** How orders look to the guest who made them. */
@Service
@Transactional(readOnly = true)
public class OrderQueryService {

	private final TicketOrderRepository orders;
	private final TicketRepository tickets;
	private final EventPriceRepository prices;
	private final SeatStore seats;

	public OrderQueryService(TicketOrderRepository orders, TicketRepository tickets, EventPriceRepository prices,
			SeatStore seats) {
		this.orders = orders;
		this.tickets = tickets;
		this.prices = prices;
		this.seats = seats;
	}

	public record OrderSeat(long seatId, String section, String row, int number, long faceCents, long feeCents) {
	}

	public record TicketView(long id, String code, String section, String row, int number, TicketStatus status) {
	}

	/** Money in cents. Ticket codes appear only once the order is paid. */
	public record OrderView(long id, String reference, long eventId, OrderStatus status, long subtotalCents,
			long feeCents, long totalCents, String currency, @Schema(nullable = true) String failureReason,
			Instant createdAt, @Schema(nullable = true) Instant paidAt, List<OrderSeat> seats,
			List<TicketView> tickets) {
	}

	public OrderView view(TicketOrder order) {
		Map<Long, Integer> faceBySection = prices.findByEventId(order.getEventId()).stream()
				.collect(Collectors.toMap(EventPrice::getSectionId, EventPrice::getPriceCents));
		List<HeldSeat> held = seats.heldSeats(order.getHoldId());
		List<OrderSeat> seatViews = held.stream().map(s -> {
			int face = faceBySection.get(s.sectionId());
			return new OrderSeat(s.seatId(), s.sectionName(), s.row(), s.number(), face, FeePolicy.fee(face));
		}).toList();

		// An order has tickets once paid, and keeps them (void) if the event is cancelled and it is refunded. The seats
		// are read from the tickets themselves, because a cancelled event's seats are no longer held under the order.
		List<Ticket> issued = tickets.findByOrderIdOrderById(order.getId());
		List<TicketView> ticketViews = List.of();
		if (!issued.isEmpty()) {
			Map<Long, HeldSeat> seatById = seats.ticketSeats(order.getId()).stream()
					.collect(Collectors.toMap(HeldSeat::seatId, Function.identity()));
			ticketViews = issued.stream().map(t -> ticketView(t, seatById.get(t.getSeatId()))).toList();
		}
		return new OrderView(order.getId(), order.getPublicRef(), order.getEventId(), order.getStatus(),
				order.getSubtotalCents(), order.getFeeCents(), order.getTotalCents(), order.getCurrency(),
				order.getFailureReason(), order.getCreatedAt(), order.getPaidAt(), seatViews, ticketViews);
	}

	public OrderView get(long userId, long orderId) {
		TicketOrder order = orders.findById(orderId)
				.orElseThrow(() -> new NotFoundException("Order " + orderId + " not found"));
		if (!order.isOwnedBy(userId)) {
			throw new NotOwnerException("This order belongs to another guest");
		}
		return view(order);
	}

	public List<OrderView> list(long userId) {
		return orders.findByUserIdOrderByIdDesc(userId).stream().map(this::view).toList();
	}

	private static TicketView ticketView(Ticket ticket, HeldSeat seat) {
		return new TicketView(ticket.getId(), ticket.getCode(), seat.sectionName(), seat.row(), seat.number(),
				ticket.getStatus());
	}

}
