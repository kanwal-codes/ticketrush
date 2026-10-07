package com.ticketrush.queue.domain;

import java.time.Instant;

/** Where one guest stands. aheadOfYou counts only guests still waiting. admittedUntil is set when admitted. */
public record QueueStatus(QueueState state, long aheadOfYou, long queueLength, Instant admittedUntil) {
}
