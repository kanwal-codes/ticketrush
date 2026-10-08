package com.ticketrush.catalog.domain;

import java.time.Instant;
import java.util.List;

/**
 * Port for the seat-level data, which is too big to load as entities (thousands of rows per event).
 * The SQL lives in infrastructure.
 *
 * A seat whose hold has run out counts as available everywhere here, so nothing depends on the
 * background sweeper having run.
 */
public interface SeatStore {

	/** Adds seats 1..seatCount to one row of a section. */
	void generateRow(long sectionId, String rowLabel, int seatCount);

	/** Creates an AVAILABLE inventory row for every seat of the venue. Returns how many were created. */
	int createEventInventory(long eventId, long venueId);

	List<SectionSize> sectionSizes(long venueId);

	List<SectionAvailability> availabilityBySection(long eventId, Instant now);

	/** Seats in section, row, number order. Pass null to include every section. */
	List<SeatView> seatMap(long eventId, Long sectionId, Instant now);

	/** Serializes one guest's hold requests for one event until the transaction ends. */
	void lockUserEvent(long userId, long eventId);

	/**
	 * Tries to hold all the given seats at once. Never waits for a seat another request is working on: it
	 * skips it. Returns the ids actually claimed, so fewer than requested means some seats were not free and
	 * the caller must roll back.
	 */
	List<Long> claim(long eventId, long holdId, List<Long> seatIds, Instant now, Instant until);

	/** Seat ids from the list that exist in this event. Used to explain a failed claim. */
	List<Long> seatsInEvent(long eventId, List<Long> seatIds);

	/**
	 * Which of these seats this guest could not claim right now (sold, or held by someone else's live hold). Seats
	 * the guest already holds count as available, because a new hold replaces their old one. A plain read that
	 * takes no locks: it can be stale a moment later, so it may only be used to turn a request away early, never
	 * to promise a seat.
	 */
	List<Long> unavailable(long eventId, List<Long> seatIds, Instant now, long userId);

	/** Moves the hold time of the hold's seats out to at least this moment. Returns how many seats. */
	int extendHold(long holdId, Instant until);

	/** The seats still held under this hold, locked until the transaction ends. */
	List<Long> lockHeldSeats(long holdId);

	/** Marks the hold's held seats as sold. Returns how many. */
	int sellHeldSeats(long holdId);

	/** Frees the seats still held under this hold. Returns how many. */
	int releaseHold(long holdId);

	/** Puts the seats of an order's tickets back on the shelf (SOLD to AVAILABLE). Returns how many. */
	int freeSoldSeatsOf(long orderId);

	List<HeldSeat> heldSeats(long holdId);

	/** Housekeeping: frees seats whose hold ran out and marks those holds EXPIRED. */
	ExpiryResult expireDue(Instant now);

	record SectionSize(long sectionId, String name, int seats) {
	}

	record SectionAvailability(long sectionId, int total, int available) {
	}

	record SeatView(long seatId, long sectionId, String sectionName, String row, int number, String status) {
	}

	record HeldSeat(long seatId, long sectionId, String sectionName, String row, int number) {
	}

	record ExpiryResult(int seatsFreed, int holdsExpired) {
	}

}
