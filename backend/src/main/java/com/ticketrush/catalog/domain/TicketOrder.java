package com.ticketrush.catalog.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/** One attempt to pay for a hold. All money is whole cents. */
@Entity
@Table(name = "ticket_order")
public class TicketOrder {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "public_ref", nullable = false)
	private String publicRef;

	@Column(name = "event_id", nullable = false)
	private Long eventId;

	@Column(name = "user_id", nullable = false)
	private Long userId;

	@Column(name = "hold_id", nullable = false)
	private Long holdId;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private OrderStatus status = OrderStatus.PENDING_PAYMENT;

	@Column(name = "subtotal_cents", nullable = false)
	private long subtotalCents;

	@Column(name = "fee_cents", nullable = false)
	private long feeCents;

	@Column(name = "total_cents", nullable = false)
	private long totalCents;

	@Column(nullable = false)
	private String currency = "CAD";

	@Column(name = "payment_ref")
	private String paymentRef;

	@Column(name = "failure_reason")
	private String failureReason;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "paid_at")
	private Instant paidAt;

	protected TicketOrder() {
	}

	public TicketOrder(String publicRef, Long eventId, Long userId, Long holdId, long subtotalCents, long feeCents,
			Instant createdAt) {
		this.publicRef = publicRef;
		this.eventId = eventId;
		this.userId = userId;
		this.holdId = holdId;
		this.subtotalCents = subtotalCents;
		this.feeCents = feeCents;
		this.totalCents = subtotalCents + feeCents;
		this.createdAt = createdAt;
	}

	public boolean isOwnedBy(long userId) {
		return this.userId == userId;
	}

	public boolean isPending() {
		return status == OrderStatus.PENDING_PAYMENT;
	}

	/** The stable key the payment provider uses to recognise a repeat of this order's charge. */
	public String providerKey() {
		return "order-" + id;
	}

	public void markPaid(String paymentRef, Instant now) {
		this.status = OrderStatus.PAID;
		this.paymentRef = paymentRef;
		this.paidAt = now;
		this.failureReason = null;
	}

	public void markFailed(String reason) {
		this.status = OrderStatus.FAILED;
		this.failureReason = reason;
	}

	/** Charged, but the seats are gone. The money has to go back. */
	public void markRefunding(String paymentRef, String reason) {
		this.status = OrderStatus.REFUNDING;
		this.paymentRef = paymentRef;
		this.failureReason = reason;
	}

	public void markRefunded() {
		this.status = OrderStatus.REFUNDED;
	}

	public Long getId() {
		return id;
	}

	public String getPublicRef() {
		return publicRef;
	}

	public Long getEventId() {
		return eventId;
	}

	public Long getUserId() {
		return userId;
	}

	public Long getHoldId() {
		return holdId;
	}

	public OrderStatus getStatus() {
		return status;
	}

	public long getSubtotalCents() {
		return subtotalCents;
	}

	public long getFeeCents() {
		return feeCents;
	}

	public long getTotalCents() {
		return totalCents;
	}

	public String getCurrency() {
		return currency;
	}

	public String getPaymentRef() {
		return paymentRef;
	}

	public String getFailureReason() {
		return failureReason;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public Instant getPaidAt() {
		return paidAt;
	}

}
