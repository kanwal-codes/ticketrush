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
@Table(name = "seat_hold")
public class SeatHold {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "event_id", nullable = false)
	private Long eventId;

	@Column(name = "user_id", nullable = false)
	private Long userId;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private HoldStatus status = HoldStatus.ACTIVE;

	@Column(name = "seat_count", nullable = false)
	private int seatCount;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "expires_at", nullable = false)
	private Instant expiresAt;

	protected SeatHold() {
	}

	public SeatHold(Long eventId, Long userId, int seatCount, Instant createdAt, Instant expiresAt) {
		this.eventId = eventId;
		this.userId = userId;
		this.seatCount = seatCount;
		this.createdAt = createdAt;
		this.expiresAt = expiresAt;
	}

	public boolean isOwnedBy(long userId) {
		return this.userId == userId;
	}

	/** Active and not past its expiry. A hold can be ACTIVE in the table a moment after it has run out. */
	public boolean isLive(Instant now) {
		return status == HoldStatus.ACTIVE && expiresAt.isAfter(now);
	}

	/** Pushes the expiry out, never in. Used when checkout starts so the seats stay safe while paying. */
	public void extendTo(Instant until) {
		if (until.isAfter(expiresAt)) {
			this.expiresAt = until;
		}
	}

	public void markConverted() {
		this.status = HoldStatus.CONVERTED;
	}

	public void markReleased() {
		this.status = HoldStatus.RELEASED;
	}

	public Long getId() {
		return id;
	}

	public Long getEventId() {
		return eventId;
	}

	public Long getUserId() {
		return userId;
	}

	public HoldStatus getStatus() {
		return status;
	}

	public int getSeatCount() {
		return seatCount;
	}

	public Instant getExpiresAt() {
		return expiresAt;
	}

}
