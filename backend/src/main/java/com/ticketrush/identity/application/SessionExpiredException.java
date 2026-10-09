package com.ticketrush.identity.application;

/** A token cannot be renewed: the sign-in is too old, or the account is gone. Becomes a 401. */
public class SessionExpiredException extends RuntimeException {

	public SessionExpiredException() {
		super("Your session has ended. Please sign in again.");
	}

}
