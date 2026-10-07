package com.ticketrush.catalog.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/** A guest's Idempotency-Key, what request it was first used for, and the order that request created. */
@Entity
@Table(name = "idempotency_key")
public class IdempotencyRecord {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "user_id", nullable = false)
	private Long userId;

	@Column(name = "idem_key", nullable = false)
	private String idemKey;

	@Column(name = "request_hash", nullable = false)
	private String requestHash;

	@Column(name = "order_id")
	private Long orderId;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	protected IdempotencyRecord() {
	}

	public IdempotencyRecord(Long userId, String idemKey, String requestHash, Instant createdAt) {
		this.userId = userId;
		this.idemKey = idemKey;
		this.requestHash = requestHash;
		this.createdAt = createdAt;
	}

	public void attachOrder(Long orderId) {
		this.orderId = orderId;
	}

	public String getRequestHash() {
		return requestHash;
	}

	public Long getOrderId() {
		return orderId;
	}

}
