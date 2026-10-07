package com.ticketrush.queue;

import com.ticketrush.catalog.domain.OrderPaidEvent;
import com.ticketrush.queue.application.QueueService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AdmissionReleaseIntegrationTest extends QueueTestSupport {

	@Autowired
	private QueueService queue;

	@Autowired
	private ApplicationEventPublisher events;

	@Test
	void payingFreesTheGuestsPlaceInsideTheWaitingRoom() throws Exception {
		int eventId = onSaleQueueEvent();
		Guest guest = createGuests(1).get(0);
		join(guest, eventId).andExpect(status().isOk());
		queue.admitDue();
		assertThat(field(queueStatus(guest, eventId), "$.state")).isEqualTo("ADMITTED");

		events.publishEvent(new OrderPaidEvent(1, eventId, guest.id()));
		events.publishEvent(new OrderPaidEvent(1, eventId, guest.id()));

		assertThat(field(queueStatus(guest, eventId), "$.state")).isEqualTo("NOT_IN_QUEUE");
	}

}
