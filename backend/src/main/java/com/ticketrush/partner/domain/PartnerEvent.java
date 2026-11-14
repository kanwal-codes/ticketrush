package com.ticketrush.partner.domain;

import java.time.Instant;

/** An event sold elsewhere. TicketRush only shows it; the guest buys on {@code url}. */
public record PartnerEvent(String id, String source, String title, Instant startsAt, String venueName, String city,
		String category, String imageUrl, String url) {

}
