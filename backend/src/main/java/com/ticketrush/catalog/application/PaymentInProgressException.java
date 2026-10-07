package com.ticketrush.catalog.application;

/** The hold is being paid for, so its seats cannot be swapped or given back right now. */
public class PaymentInProgressException extends RuntimeException {

	public PaymentInProgressException() {
		super("A payment for these seats is already under way. Wait for it to finish.");
	}

}
