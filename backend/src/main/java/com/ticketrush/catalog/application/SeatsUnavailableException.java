package com.ticketrush.catalog.application;

import java.util.List;

/** At least one requested seat is held by someone else or sold. Nothing was held. */
public class SeatsUnavailableException extends RuntimeException {

	private final List<Long> seatIds;

	public SeatsUnavailableException(List<Long> seatIds) {
		super(seatIds.size() == 1 ? "That seat was just taken" : "Some of those seats were just taken");
		this.seatIds = List.copyOf(seatIds);
	}

	public List<Long> getSeatIds() {
		return seatIds;
	}

}
