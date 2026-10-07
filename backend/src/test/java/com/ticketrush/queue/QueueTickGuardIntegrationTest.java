package com.ticketrush.queue;

import com.ticketrush.queue.application.QueueService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Turns the shared-tick guard on (one second), so it needs its own Spring context and its own Redis. */
@TestPropertySource(properties = "ticketrush.queue.tick-interval=PT1S")
class QueueTickGuardIntegrationTest extends QueueTestSupport {

	@Autowired
	private QueueService queue;

	private long admitted(List<Guest> guests, int eventId) throws Exception {
		long count = 0;
		for (Guest guest : guests) {
			if ("ADMITTED".equals(field(queueStatus(guest, eventId), "$.state"))) {
				count++;
			}
		}
		return count;
	}

	@Test
	void instancesShareOneAdmissionRoundPerInterval() throws Exception {
		int eventId = onSaleQueueEvent();
		List<Guest> guests = createGuests(30);
		for (Guest guest : guests) {
			join(guest, eventId).andExpect(status().isOk());
		}

		// Three instances all fire in the same second: only one round happens.
		queue.admitDue();
		queue.admitDue();
		queue.admitDue();
		assertThat(admitted(guests, eventId)).isEqualTo(10);

		// A second later the next round goes ahead, up to the cap of 15.
		Thread.sleep(1_100);
		queue.admitDue();
		assertThat(admitted(guests, eventId)).isEqualTo(15);
	}

}
