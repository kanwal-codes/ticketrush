package com.ticketrush.queue.application;

public class EventNotFoundException extends RuntimeException {

	public EventNotFoundException(long eventId) {
		super("Event " + eventId + " not found");
	}

}
