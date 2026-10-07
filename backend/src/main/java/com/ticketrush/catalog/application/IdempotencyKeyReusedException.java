package com.ticketrush.catalog.application;

/** The same Idempotency-Key was sent with a different request. That is a client bug, not a retry. */
public class IdempotencyKeyReusedException extends RuntimeException {

	public IdempotencyKeyReusedException() {
		super("This Idempotency-Key was already used for a different request. Use a new key for a new payment.");
	}

}
