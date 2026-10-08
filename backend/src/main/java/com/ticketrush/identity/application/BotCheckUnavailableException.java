package com.ticketrush.identity.application;

/** The check could not be run (its provider did not answer). Sign-up fails closed. Becomes a 503. */
public class BotCheckUnavailableException extends RuntimeException {

	public BotCheckUnavailableException() {
		super("We could not run the security check right now. Please try again in a moment.");
	}

}
