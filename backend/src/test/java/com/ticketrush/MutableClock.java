package com.ticketrush;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

/** Real time plus an offset the test can move, to check expiry without waiting ten minutes. */
public class MutableClock extends Clock {

	private volatile Duration offset = Duration.ZERO;

	public void advance(Duration by) {
		offset = offset.plus(by);
	}

	public void reset() {
		offset = Duration.ZERO;
	}

	@Override
	public Instant instant() {
		return Instant.now().plus(offset);
	}

	@Override
	public ZoneId getZone() {
		return ZoneOffset.UTC;
	}

	@Override
	public Clock withZone(ZoneId zone) {
		return this;
	}

}
