package com.ticketrush.catalog.application;

/** The event has a waiting room and the guest did not come through it, or their admission has ended. */
public class AdmissionRequiredException extends RuntimeException {

	public AdmissionRequiredException() {
		super("This event has a waiting room. Join the queue and wait to be let in.");
	}

}
