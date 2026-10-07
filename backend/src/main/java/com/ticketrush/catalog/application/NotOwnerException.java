package com.ticketrush.catalog.application;

/** Someone tried to change something that belongs to another user. */
public class NotOwnerException extends RuntimeException {

	public NotOwnerException() {
		this("This event belongs to another organizer");
	}

	public NotOwnerException(String message) {
		super(message);
	}

}
