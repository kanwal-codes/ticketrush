package com.ticketrush.catalog.domain;

import java.time.Instant;

/** Where an event is in its sale. Derived from the clock, never stored, so it cannot go stale. */
public enum SaleState {
	/** Before the waiting room opens. */
	UPCOMING,
	/** The waiting room is open but tickets are not on sale yet. */
	QUEUE_OPEN,
	ON_SALE,
	ENDED;

	public static SaleState at(Instant dropOpensAt, Instant onSaleAt, Instant startsAt, Instant now) {
		if (!now.isBefore(startsAt)) {
			return ENDED;
		}
		if (!now.isBefore(onSaleAt)) {
			return ON_SALE;
		}
		if (!now.isBefore(dropOpensAt)) {
			return QUEUE_OPEN;
		}
		return UPCOMING;
	}

}
