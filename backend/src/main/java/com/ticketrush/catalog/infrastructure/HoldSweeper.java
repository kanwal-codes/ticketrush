package com.ticketrush.catalog.infrastructure;

import com.ticketrush.catalog.application.HoldService;
import com.ticketrush.catalog.domain.SeatStore.ExpiryResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Tidies up after holds that ran out. Purely housekeeping: seats with an expired hold are already
 * claimable and show as available without it. Safe to run on several instances at once.
 */
@Component
class HoldSweeper {

	private static final Logger log = LoggerFactory.getLogger(HoldSweeper.class);

	private final HoldService holds;

	HoldSweeper(HoldService holds) {
		this.holds = holds;
	}

	@Scheduled(fixedDelayString = "${ticketrush.holds.sweep-interval}",
			initialDelayString = "${ticketrush.holds.sweep-interval}")
	void sweep() {
		ExpiryResult result = holds.expireDue();
		if (result.holdsExpired() > 0 || result.seatsFreed() > 0) {
			log.info("Expired {} holds and freed {} seats", result.holdsExpired(), result.seatsFreed());
		}
	}

}
