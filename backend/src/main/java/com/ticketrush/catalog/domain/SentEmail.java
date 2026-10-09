package com.ticketrush.catalog.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/** A message to a guest about an order, one row per order and kind. A relay sends the rows not yet sent and retries failures. */
@Entity
@Table(name = "sent_email")
public class SentEmail {

	public static final String CONFIRMATION = "CONFIRMATION";
	public static final String CANCELLATION = "CANCELLATION";
	/** Rows that failed this many times stay in the table for a person to look at and are no longer retried. */
	public static final int MAX_ATTEMPTS = 10;

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "order_id", nullable = false)
	private Long orderId;

	@Column(nullable = false)
	private String kind;

	@Column(name = "to_email", nullable = false)
	private String toEmail;

	@Column(nullable = false)
	private String subject;

	@Column(nullable = false)
	private String body;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "sent_at")
	private Instant sentAt;

	@Column(nullable = false)
	private int attempts;

	@Column(name = "last_error")
	private String lastError;

	protected SentEmail() {
	}

	public SentEmail(Long orderId, String kind, String toEmail, String subject, String body, Instant createdAt) {
		this.orderId = orderId;
		this.kind = kind;
		this.toEmail = toEmail;
		this.subject = subject;
		this.body = body;
		this.createdAt = createdAt;
	}

	public void markSent(Instant now) {
		this.sentAt = now;
		this.lastError = null;
	}

	public void markFailed(String error) {
		this.attempts++;
		this.lastError = error.length() > 500 ? error.substring(0, 500) : error;
	}

	public Long getId() {
		return id;
	}

	public String getToEmail() {
		return toEmail;
	}

	public String getSubject() {
		return subject;
	}

	public String getBody() {
		return body;
	}

}
