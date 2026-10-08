package com.ticketrush.queue.application;

public class NotYourEventException extends RuntimeException {

	public NotYourEventException() {
		super("This event belongs to another organizer");
	}

}
