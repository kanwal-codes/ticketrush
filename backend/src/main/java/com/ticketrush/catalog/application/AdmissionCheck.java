package com.ticketrush.catalog.application;

/**
 * Port: proof that a guest was let in through the waiting room. Defined here so the catalog does not depend on
 * the queue module; the queue module provides the implementation.
 */
public interface AdmissionCheck {

	/** Throws {@link AdmissionRequiredException} unless the token proves this guest may shop for this event. */
	void require(long userId, long eventId, String admissionToken);

}
