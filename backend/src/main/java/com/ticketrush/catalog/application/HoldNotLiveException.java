package com.ticketrush.catalog.application;

/** The hold cannot be paid for: it ran out, or it was already paid for. */
public class HoldNotLiveException extends RuntimeException {

	public HoldNotLiveException(String message) {
		super(message);
	}

}
