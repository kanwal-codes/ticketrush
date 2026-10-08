package com.ticketrush.catalog.api;

import com.ticketrush.catalog.application.OutboxRelay;
import io.micrometer.core.instrument.MeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The numbers the dashboard and the load tests rely on actually move when the things they count happen. */
class MetricsIntegrationTest extends OrderTestSupport {

	@Autowired
	private MeterRegistry meters;

	@Autowired
	private OutboxRelay relay;

	private double count(String name, String tagKey, String tagValue) {
		var counter = tagKey == null ? meters.find(name).counter() : meters.find(name).tag(tagKey, tagValue).counter();
		return counter == null ? 0 : counter.count();
	}

	@Test
	void holdsAreCountedByResult() throws Exception {
		setUpEvent();
		List<Guest> guests = createGuests(2);
		double held = count("ticketrush.holds", "result", "held");
		double taken = count("ticketrush.holds", "result", "seats_taken");
		double rejected = count("ticketrush.holds", "result", "rejected");

		hold(guests.get(0).token(), seats.get(0), seats.get(1)).andExpect(status().isCreated());
		hold(guests.get(1).token(), seats.get(1), seats.get(2)).andExpect(status().isConflict());
		hold(guests.get(1).token(), seats.get(0), seats.get(0)).andExpect(status().isBadRequest());

		assertThat(count("ticketrush.holds", "result", "held")).isEqualTo(held + 1);
		assertThat(count("ticketrush.holds", "result", "seats_taken")).isEqualTo(taken + 1);
		assertThat(count("ticketrush.holds", "result", "rejected")).isEqualTo(rejected + 1);
	}

	@Test
	void ordersAreCountedByOutcomeAndRepeatsAreNotCountedTwice() throws Exception {
		setUpEvent();
		List<Guest> guests = createGuests(2);
		double paid = count("ticketrush.orders", "outcome", "paid");
		double failed = count("ticketrush.orders", "outcome", "failed");
		long charges = meters.get("ticketrush.charge").timer().count();
		long holdId = holdTwo(guests.get(0), 0);
		String key = newKey();

		pay(guests.get(0), key, holdId, "tok_visa").andExpect(status().isCreated());
		pay(guests.get(0), key, holdId, "tok_visa").andExpect(status().isOk());
		pay(guests.get(1), newKey(), holdTwo(guests.get(1), 2), "tok_declined").andExpect(status().isPaymentRequired());

		assertThat(count("ticketrush.orders", "outcome", "paid")).isEqualTo(paid + 1);
		assertThat(count("ticketrush.orders", "outcome", "failed")).isEqualTo(failed + 1);
		assertThat(meters.get("ticketrush.charge").timer().count()).isEqualTo(charges + 2);
	}

	@Test
	void deliveredOutboxRowsAreCountedAndTheBacklogIsAGauge() throws Exception {
		setUpEvent();
		buyTwo(createGuests(1).get(0), 0);
		assertThat(meters.get("ticketrush.outbox.pending").gauge().value()).isGreaterThanOrEqualTo(1);
		double delivered = count("ticketrush.outbox.delivered", null, null);

		// Other tests leave rows behind and one run delivers a batch, so run until it is empty.
		for (int i = 0; i < 20 && relay.relay() > 0; i++) {
			// keep going
		}

		assertThat(count("ticketrush.outbox.delivered", null, null)).isGreaterThan(delivered);
		assertThat(meters.get("ticketrush.outbox.pending").gauge().value()).isZero();
	}

}
