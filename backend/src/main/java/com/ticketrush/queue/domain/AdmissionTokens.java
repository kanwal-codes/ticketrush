package com.ticketrush.queue.domain;

import java.time.Instant;

/** Proof of admission that the hold endpoint can check without asking the queue. */
public interface AdmissionTokens {

	String issue(long userId, long eventId, Instant expiresAt);

}
