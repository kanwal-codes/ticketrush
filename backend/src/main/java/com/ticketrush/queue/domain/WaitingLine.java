package com.ticketrush.queue.domain;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Set;

/** The line itself. Redis in production; the adapter keeps every operation atomic. */
public interface WaitingLine {

	/** Puts the guest at the back, unless they are already waiting (keeps their place) or admitted. */
	void join(long eventId, long userId, Instant now);

	QueueStatus standing(long eventId, long userId, Instant now);

	void leave(long eventId, long userId);

	/**
	 * Lets in up to maxToAdmit guests from the front, never more than maxInside in total, and drops admissions
	 * that have expired. One indivisible step. Returns the guests admitted, front first.
	 */
	List<Long> admit(long eventId, int maxToAdmit, int maxInside, Instant now, Instant admissionExpiry);

	/** Events that have, or recently had, guests waiting. */
	Set<Long> eventsWithWaiting();

	/** Stops tracking the event when nobody is waiting. */
	void forgetIfEmpty(long eventId);

	/** Several app instances share one admission tick per interval. A zero interval always says yes. */
	boolean claimTick(long eventId, Duration interval);

}
