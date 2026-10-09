package com.ticketrush.catalog.application;

/** The event is past the point where it can be changed. Becomes a 409 problem response. */
public class NotEditableException extends RuntimeException {

	public NotEditableException(String message) {
		super(message);
	}

}
