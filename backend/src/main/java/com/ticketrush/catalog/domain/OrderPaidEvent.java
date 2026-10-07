package com.ticketrush.catalog.domain;

/** Published after a payment has been recorded. Listeners must cope with seeing it more than once. */
public record OrderPaidEvent(long orderId, long eventId, long userId) {
}
