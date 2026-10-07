package com.ticketrush.catalog.domain;

public enum HoldStatus {
	ACTIVE,
	RELEASED,
	EXPIRED,
	/** The hold was paid for. Used from Phase 5. */
	CONVERTED
}
