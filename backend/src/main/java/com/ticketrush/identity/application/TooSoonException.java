package com.ticketrush.identity.application;

public class TooSoonException extends RuntimeException {

	public TooSoonException() {
		super("An email was sent a moment ago. Give it a minute, check your spam folder, then ask again.");
	}

}
