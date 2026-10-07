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

@Entity
@Table(name = "ticket")
public class Ticket {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "order_id", nullable = false)
	private Long orderId;

	@Column(name = "event_id", nullable = false)
	private Long eventId;

	@Column(name = "user_id", nullable = false)
	private Long userId;

	@Column(name = "seat_id", nullable = false)
	private Long seatId;

	@Column(nullable = false)
	private String code;

	@Column(name = "face_cents", nullable = false)
	private int faceCents;

	@Column(name = "fee_cents", nullable = false)
	private int feeCents;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private TicketStatus status = TicketStatus.ISSUED;

	@Column(name = "used_at")
	private Instant usedAt;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	protected Ticket() {
	}

	public Ticket(Long orderId, Long eventId, Long userId, Long seatId, String code, int faceCents, int feeCents,
			Instant createdAt) {
		this.orderId = orderId;
		this.eventId = eventId;
		this.userId = userId;
		this.seatId = seatId;
		this.code = code;
		this.faceCents = faceCents;
		this.feeCents = feeCents;
		this.createdAt = createdAt;
	}

	public boolean isOwnedBy(long userId) {
		return this.userId == userId;
	}

	public Long getId() {
		return id;
	}

	public Long getOrderId() {
		return orderId;
	}

	public Long getEventId() {
		return eventId;
	}

	public Long getUserId() {
		return userId;
	}

	public Long getSeatId() {
		return seatId;
	}

	public String getCode() {
		return code;
	}

	public int getFaceCents() {
		return faceCents;
	}

	public int getFeeCents() {
		return feeCents;
	}

	public TicketStatus getStatus() {
		return status;
	}

	public Instant getUsedAt() {
		return usedAt;
	}

}
