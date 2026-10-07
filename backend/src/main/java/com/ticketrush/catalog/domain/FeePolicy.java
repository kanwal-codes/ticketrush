package com.ticketrush.catalog.domain;

/**
 * The service fee, in whole cents. Guests always see the all-in price (face plus fee),
 * so this is the one place that computes it.
 */
public final class FeePolicy {

	/** 7.5% of the face price. */
	private static final long FEE_BASIS_POINTS = 750;

	private FeePolicy() {
	}

	/** Fee for one ticket, rounded half up to the nearest cent. */
	public static long fee(long faceCents) {
		if (faceCents < 0) {
			throw new IllegalArgumentException("Price cannot be negative");
		}
		return (faceCents * FEE_BASIS_POINTS + 5_000) / 10_000;
	}

	public static long allIn(long faceCents) {
		return faceCents + fee(faceCents);
	}

}
