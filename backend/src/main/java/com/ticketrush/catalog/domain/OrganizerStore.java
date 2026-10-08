package com.ticketrush.catalog.domain;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Port for what an organizer's console reads: their events, how the seats stand, the money, the door. One place for
 * the SQL, so every number comes from the same definitions of sold and held (held counts only live holds).
 */
public interface OrganizerStore {

	List<EventRow> eventsOf(long organizerId);

	List<TierRow> tiers(long eventId, Instant now);

	/** Paid orders only. */
	Revenue revenue(long eventId);

	Map<String, Long> ordersByStatus(long eventId);

	Door door(long eventId);

	void recordScan(long eventId, long scannerId, String code, String outcome, String seat, Instant at);

	List<ScanRow> recentScans(long eventId, int limit);

	record EventRow(long id, String title, EventStatus status, Instant startsAt, String venueName, String city,
			int capacity, int sold, long grossCents) {
	}

	record TierRow(long sectionId, String name, @Schema(nullable = true) Integer priceCents, int total, int sold,
			int held, int available) {
	}

	record Revenue(long paidOrders, long subtotalCents, long feeCents, long totalCents) {
	}

	/** Tickets issued (not void) and how many of them have been accepted at a door. */
	record Door(long issued, long checkedIn) {
	}

	record ScanRow(String code, String outcome, @Schema(nullable = true) String seat, Instant at) {
	}

}
