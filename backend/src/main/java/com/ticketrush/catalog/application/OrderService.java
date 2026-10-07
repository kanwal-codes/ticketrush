package com.ticketrush.catalog.application;

import com.ticketrush.catalog.application.OrderQueryService.OrderView;
import com.ticketrush.catalog.domain.EventPrice;
import com.ticketrush.catalog.domain.EventPriceRepository;
import com.ticketrush.catalog.domain.FeePolicy;
import com.ticketrush.catalog.domain.HoldStatus;
import com.ticketrush.catalog.domain.IdempotencyRecord;
import com.ticketrush.catalog.domain.IdempotencyRecordRepository;
import com.ticketrush.catalog.domain.OutboxEvent;
import com.ticketrush.catalog.domain.OutboxEventRepository;
import com.ticketrush.catalog.domain.OrderStatus;
import com.ticketrush.catalog.domain.PaymentGateway;
import com.ticketrush.catalog.domain.PaymentGateway.ChargeRequest;
import com.ticketrush.catalog.domain.PaymentGateway.ChargeResult;
import com.ticketrush.catalog.domain.PaymentGateway.RefundResult;
import com.ticketrush.catalog.domain.SeatHold;
import com.ticketrush.catalog.domain.SeatHoldRepository;
import com.ticketrush.catalog.domain.SeatStore;
import com.ticketrush.catalog.domain.SeatStore.HeldSeat;
import com.ticketrush.catalog.domain.Ticket;
import com.ticketrush.catalog.domain.TicketCodes;
import com.ticketrush.catalog.domain.TicketOrder;
import com.ticketrush.catalog.domain.TicketOrderRepository;
import com.ticketrush.catalog.domain.TicketRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Paying for a hold. The rule that shapes everything here: money never moves inside a database transaction.
 * A checkout is three short steps around one call to the payment provider:
 * <ol>
 * <li><b>Reserve</b> (transaction): remember the Idempotency-Key, check the hold, create the order as pending and
 * push the seats' hold time out so nobody can take them while the guest is paying.</li>
 * <li><b>Charge</b> (no transaction): ask the provider, with a key derived from the order so a repeat can never
 * charge twice.</li>
 * <li><b>Settle</b> (transaction, order row locked): record what happened. Paid: seats sold, tickets made, a
 * note left in the outbox. Declined: the order fails and the hold stays. Unknown: nothing changes yet.</li>
 * </ol>
 */
@Service
public class OrderService {

	private final TicketOrderRepository orders;
	private final IdempotencyRecordRepository idempotency;
	private final SeatHoldRepository holds;
	private final TicketRepository tickets;
	private final OutboxEventRepository outbox;
	private final EventPriceRepository prices;
	private final SeatStore seats;
	private final PaymentGateway gateway;
	private final OrderQueryService views;
	private final TransactionTemplate tx;
	private final Clock clock;
	private final Duration checkoutWindow;

	public OrderService(TicketOrderRepository orders, IdempotencyRecordRepository idempotency,
			SeatHoldRepository holds, TicketRepository tickets, OutboxEventRepository outbox,
			EventPriceRepository prices, SeatStore seats, PaymentGateway gateway, OrderQueryService views,
			TransactionTemplate tx, Clock clock, @Value("${ticketrush.payments.checkout-window}") Duration checkoutWindow) {
		this.orders = orders;
		this.idempotency = idempotency;
		this.holds = holds;
		this.tickets = tickets;
		this.outbox = outbox;
		this.prices = prices;
		this.seats = seats;
		this.gateway = gateway;
		this.views = views;
		this.tx = tx;
		this.clock = clock;
		this.checkoutWindow = checkoutWindow;
	}

	/** What the guest gets back, and whether this answer repeats an earlier request with the same key. */
	public record Checkout(OrderView order, boolean replay) {
	}

	private record Reserved(long orderId, boolean replay) {
	}

	/**
	 * Pays for the guest's hold. Safe to repeat with the same key: the answer is the order's current state and no
	 * second charge is made. A new key is a new payment attempt, allowed only if no earlier attempt is live.
	 */
	public Checkout checkout(long userId, String idempotencyKey, long holdId, String paymentToken) {
		String fingerprint = fingerprint(holdId, paymentToken);
		Reserved reserved;
		try {
			reserved = tx.execute(status -> reserve(userId, idempotencyKey, fingerprint, holdId));
		}
		catch (DataIntegrityViolationException conflict) {
			// The transaction rolled back. Either the same key was committed by a twin request a moment ago, or
			// another order is already paying for this hold. Look again in a fresh transaction to tell which.
			reserved = afterConflict(userId, idempotencyKey, fingerprint);
		}

		long orderId = reserved.orderId();
		TicketOrder order = tx.execute(status -> orders.findById(orderId).orElseThrow());
		if (order.isPending()) {
			ChargeResult result = gateway.charge(new ChargeRequest(order.providerKey(), order.getTotalCents(),
					order.getCurrency(), paymentToken, "TicketRush order " + order.getPublicRef()));
			applyResult(orderId, result);
		}
		OrderView view = tx.execute(status -> views.view(orders.findById(orderId).orElseThrow()));
		return new Checkout(view, reserved.replay());
	}

	/**
	 * Records what the provider said about an order. Safe to call from anywhere, any number of times: the order
	 * row is locked and only a pending order changes.
	 */
	public void applyResult(long orderId, ChargeResult result) {
		boolean refundNeeded = Boolean.TRUE.equals(tx.execute(status -> settle(orderId, result)));
		if (refundNeeded) {
			completeRefund(orderId);
		}
	}

	/** Sends the money back for an order in REFUNDING. Safe to repeat: the provider refunds once per key. */
	public void completeRefund(long orderId) {
		TicketOrder order = tx.execute(status -> orders.findById(orderId).orElseThrow());
		if (order.getStatus() != OrderStatus.REFUNDING) {
			return;
		}
		RefundResult refund = gateway.refund(order.getPaymentRef(), order.getTotalCents(), "refund-" + order.providerKey());
		if (refund.succeeded()) {
			tx.executeWithoutResult(status -> orders.findByIdForUpdate(orderId)
					.filter(o -> o.getStatus() == OrderStatus.REFUNDING).ifPresent(TicketOrder::markRefunded));
		}
	}

	private Reserved reserve(long userId, String key, String fingerprint, long holdId) {
		Instant now = clock.instant();
		Optional<IdempotencyRecord> seen = idempotency.findByUserIdAndIdemKey(userId, key);
		if (seen.isPresent()) {
			return replay(seen.get(), fingerprint);
		}
		// Written first. A twin request with the same key waits here for this transaction to finish, so two
		// identical requests can never both get past this line.
		IdempotencyRecord record = idempotency.saveAndFlush(new IdempotencyRecord(userId, key, fingerprint, now));

		SeatHold hold = holds.findById(holdId)
				.orElseThrow(() -> new NotFoundException("Hold " + holdId + " not found"));
		if (!hold.isOwnedBy(userId)) {
			throw new NotOwnerException("This hold belongs to another guest");
		}
		if (hold.getStatus() == HoldStatus.CONVERTED) {
			throw new HoldNotLiveException("These seats have already been paid for.");
		}
		if (!hold.isLive(now) || seats.lockHeldSeats(holdId).size() != hold.getSeatCount()) {
			throw new HoldNotLiveException("Your hold has expired. Pick your seats again.");
		}

		long subtotal = 0;
		long fees = 0;
		Map<Long, Integer> faceBySection = faceBySection(hold.getEventId());
		for (HeldSeat seat : seats.heldSeats(holdId)) {
			int face = faceBySection.get(seat.sectionId());
			subtotal += face;
			fees += FeePolicy.fee(face);
		}
		// The unique index on live orders per hold rejects this insert if another attempt is already in flight.
		TicketOrder order = orders.saveAndFlush(new TicketOrder(TicketCodes.orderReference(), hold.getEventId(),
				userId, holdId, subtotal, fees, now));

		Instant until = now.plus(checkoutWindow);
		seats.extendHold(holdId, until);
		hold.extendTo(until);
		record.attachOrder(order.getId());
		return new Reserved(order.getId(), false);
	}

	private Reserved replay(IdempotencyRecord record, String fingerprint) {
		if (!record.getRequestHash().equals(fingerprint)) {
			throw new IdempotencyKeyReusedException();
		}
		if (record.getOrderId() == null) {
			throw new PaymentInProgressException();
		}
		return new Reserved(record.getOrderId(), true);
	}

	private Reserved afterConflict(long userId, String key, String fingerprint) {
		Optional<IdempotencyRecord> seen = tx.execute(status -> idempotency.findByUserIdAndIdemKey(userId, key));
		if (seen.isPresent()) {
			return replay(seen.get(), fingerprint);
		}
		throw new PaymentInProgressException();
	}

	/** Returns true when the guest was charged but cannot be given the seats, so a refund is due. */
	private boolean settle(long orderId, ChargeResult result) {
		TicketOrder order = orders.findByIdForUpdate(orderId).orElseThrow();
		if (!order.isPending()) {
			return false;
		}
		switch (result.outcome()) {
			case DECLINED:
				order.markFailed(result.declineReason());
				return false;
			case SUCCEEDED:
				return fulfil(order, result.paymentRef());
			default:
				// Unknown: the guest may or may not have been charged. Leave it pending to be looked up.
				return false;
		}
	}

	private boolean fulfil(TicketOrder order, String paymentRef) {
		SeatHold hold = holds.findById(order.getHoldId()).orElseThrow();
		// Only seats still held under this hold can be sold. Anything else means someone took them in the meantime.
		if (seats.lockHeldSeats(hold.getId()).size() != hold.getSeatCount()) {
			order.markRefunding(paymentRef, "The seats were taken before the payment finished. You have been refunded.");
			return true;
		}
		seats.sellHeldSeats(hold.getId());
		hold.markConverted();

		Instant now = clock.instant();
		Map<Long, Integer> faceBySection = faceBySection(order.getEventId());
		for (HeldSeat seat : seats.heldSeats(hold.getId())) {
			int face = faceBySection.get(seat.sectionId());
			tickets.save(new Ticket(order.getId(), order.getEventId(), order.getUserId(), seat.seatId(),
					TicketCodes.ticketCode(), face, (int) FeePolicy.fee(face), now));
		}
		order.markPaid(paymentRef, now);
		outbox.save(new OutboxEvent(OutboxEvent.ORDER_PAID, order.getId(),
				"{\"orderId\":" + order.getId() + ",\"eventId\":" + order.getEventId() + ",\"userId\":"
						+ order.getUserId() + "}", now));
		return false;
	}

	private Map<Long, Integer> faceBySection(long eventId) {
		return prices.findByEventId(eventId).stream()
				.collect(Collectors.toMap(EventPrice::getSectionId, EventPrice::getPriceCents));
	}

	/** Identifies what a request asks for, so the same key cannot quietly be reused for something else. */
	private static String fingerprint(long holdId, String paymentToken) {
		try {
			byte[] digest = MessageDigest.getInstance("SHA-256")
					.digest((holdId + "|" + paymentToken).getBytes(StandardCharsets.UTF_8));
			return HexFormat.of().formatHex(digest);
		}
		catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}

}
