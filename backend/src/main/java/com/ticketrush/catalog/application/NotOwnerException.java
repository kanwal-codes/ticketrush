package com.ticketrush.catalog.application;

/** An organizer tried to change an event that belongs to someone else. */
public class NotOwnerException extends RuntimeException {

	public NotOwnerException() {
		super("This event belongs to another organizer");
	}

}
