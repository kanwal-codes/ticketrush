package com.ticketrush.catalog.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/** Something that must happen because a transaction committed. Written in that same transaction. */
@Entity
@Table(name = "outbox_event")
public class OutboxEvent {

	public static final String ORDER_PAID = "OrderPaid";

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false)
	private String type;

	@Column(name = "aggregate_id", nullable = false)
	private Long aggregateId;

	@Column(nullable = false)
	private String payload;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "published_at")
	private Instant publishedAt;

	@Column(nullable = false)
	private int attempts;

	@Column(name = "last_error")
	private String lastError;

	protected OutboxEvent() {
	}

	public OutboxEvent(String type, Long aggregateId, String payload, Instant createdAt) {
		this.type = type;
		this.aggregateId = aggregateId;
		this.payload = payload;
		this.createdAt = createdAt;
	}

	public void markPublished(Instant now) {
		this.publishedAt = now;
		this.lastError = null;
	}

	public void markFailed(String error) {
		this.attempts++;
		this.lastError = error.length() > 500 ? error.substring(0, 500) : error;
	}

	public Long getId() {
		return id;
	}

	public String getType() {
		return type;
	}

	public Long getAggregateId() {
		return aggregateId;
	}

	public String getPayload() {
		return payload;
	}

	public int getAttempts() {
		return attempts;
	}

	public String getLastError() {
		return lastError;
	}

	public Instant getPublishedAt() {
		return publishedAt;
	}

}
