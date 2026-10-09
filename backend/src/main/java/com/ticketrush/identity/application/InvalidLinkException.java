package com.ticketrush.identity.application;

public class InvalidLinkException extends RuntimeException {

	public InvalidLinkException() {
		super("This link has expired or was already used. Ask for a new one.");
	}

}
