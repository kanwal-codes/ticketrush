package com.ticketrush.queue.application;

/** The guest cannot join right now: not open yet, already over, or this event has no waiting room. */
public class WaitingRoomClosedException extends RuntimeException {

	public WaitingRoomClosedException(String message) {
		super(message);
	}

}
