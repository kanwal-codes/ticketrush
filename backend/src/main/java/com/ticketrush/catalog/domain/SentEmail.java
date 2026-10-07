package com.ticketrush.catalog.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/** A message "sent" to a guest. A table stands in for a mail provider; one row per order and kind. */
@Entity
@Table(name = "sent_email")
public class SentEmail {

	public static final String CONFIRMATION = "CONFIRMATION";

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

}
