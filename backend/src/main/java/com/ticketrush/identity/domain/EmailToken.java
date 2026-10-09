package com.ticketrush.identity.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/** A single-use link sent by email: to confirm an address or to choose a new password. Only a hash is stored. */
@Entity
@Table(name = "email_token")
public class EmailToken {

	public static final String VERIFY = "VERIFY";
	public static final String RESET = "RESET";

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "user_id", nullable = false)
	private Long userId;

	@Column(nullable = false)
	private String kind;

	@Column(name = "token_hash", nullable = false)
	private String tokenHash;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "expires_at", nullable = false)
	private Instant expiresAt;

	@Column(name = "used_at")
	private Instant usedAt;

	protected EmailToken() {
	}

	public EmailToken(Long userId, String kind, String tokenHash, Instant createdAt, Instant expiresAt) {
		this.userId = userId;
		this.kind = kind;
		this.tokenHash = tokenHash;
		this.createdAt = createdAt;
		this.expiresAt = expiresAt;
	}

	public boolean isUsable(Instant now) {
		return usedAt == null && expiresAt.isAfter(now);
	}

	public void markUsed(Instant now) {
		this.usedAt = now;
	}

	public Long getUserId() {
		return userId;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

}
