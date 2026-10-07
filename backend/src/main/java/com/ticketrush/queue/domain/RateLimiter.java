package com.ticketrush.queue.domain;

import java.time.Instant;

public interface RateLimiter {

	/** Counts one use of the bucket by the guest in the current minute. */
	Outcome tryAcquire(String bucket, long userId, int limitPerMinute, Instant now);

	record Outcome(boolean allowed, long retryAfterSeconds) {
	}

}
