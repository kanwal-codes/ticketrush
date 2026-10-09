package com.ticketrush.identity.domain;

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
@Table(name = "app_user")
public class User {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false)
	private String email;

	@Column(name = "password_hash", nullable = false)
	private String passwordHash;

	@Column(name = "display_name", nullable = false)
	private String displayName;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private Role role;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt = Instant.now();

	@Column(name = "email_verified", nullable = false)
	private boolean emailVerified = true;

	/** When the password last changed. A sign-in older than this can no longer be renewed. */
	@Column(name = "password_changed_at")
	private Instant passwordChangedAt;

	@Column(name = "deleted_at")
	private Instant deletedAt;

	protected User() {
	}

	public User(String email, String passwordHash, String displayName, Role role) {
		this.email = email;
		this.passwordHash = passwordHash;
		this.displayName = displayName;
		this.role = role;
	}

	/** A new guest account whose address may still need confirming. */
	public User(String email, String passwordHash, String displayName, Role role, boolean emailVerified) {
		this(email, passwordHash, displayName, role);
		this.emailVerified = emailVerified;
	}

	/** What closing an account leaves: no name, no address, no way in. The row stays so orders keep their records. */
	public void anonymize(String unusablePasswordHash, Instant now) {
		this.email = "deleted-" + id + "@deleted.invalid";
		this.displayName = "Deleted account";
		this.passwordHash = unusablePasswordHash;
		this.emailVerified = false;
		this.deletedAt = now;
	}

	public boolean isDeleted() {
		return deletedAt != null;
	}

	public void markEmailVerified() {
		this.emailVerified = true;
	}

	public void changePassword(String newHash, Instant now) {
		this.passwordHash = newHash;
		this.passwordChangedAt = now;
	}

	public boolean isEmailVerified() {
		return emailVerified;
	}

	public Instant getPasswordChangedAt() {
		return passwordChangedAt;
	}

	public Long getId() {
		return id;
	}

	public String getEmail() {
		return email;
	}

	public String getPasswordHash() {
		return passwordHash;
	}

	public String getDisplayName() {
		return displayName;
	}

	public Role getRole() {
		return role;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

}
