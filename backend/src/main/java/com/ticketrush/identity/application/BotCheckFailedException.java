package com.ticketrush.identity.application;

/** The sign-up bot check was missing or not passed. Becomes a 400. */
public class BotCheckFailedException extends RuntimeException {

	public BotCheckFailedException() {
		super("Please complete the check and try again.");
	}

}
