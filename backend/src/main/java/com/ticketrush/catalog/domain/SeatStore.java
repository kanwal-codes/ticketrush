package com.ticketrush.catalog.domain;

import java.util.List;

/**
 * Port for the seat-level data, which is too big to load as entities (thousands of rows per event).
 * The SQL lives in infrastructure.
 */
public interface SeatStore {

	/** Adds seats 1..seatCount to one row of a section. */
	void generateRow(long sectionId, String rowLabel, int seatCount);

	/** Creates an AVAILABLE inventory row for every seat of the venue. Returns how many were created. */
	int createEventInventory(long eventId, long venueId);

	List<SectionSize> sectionSizes(long venueId);

	List<SectionAvailability> availabilityBySection(long eventId);

	/** Seats in section, row, number order. Pass null to include every section. */
	List<SeatView> seatMap(long eventId, Long sectionId);

	record SectionSize(long sectionId, String name, int seats) {
	}

	record SectionAvailability(long sectionId, int total, int available) {
	}

	record SeatView(long seatId, long sectionId, String sectionName, String row, int number, String status) {
	}

}
