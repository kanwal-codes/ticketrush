package com.ticketrush.queue.infrastructure;

import com.ticketrush.catalog.domain.OrderPaidEvent;
import com.ticketrush.queue.domain.WaitingLine;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/** Once a guest has paid they no longer need their place inside, so it goes to the next guest in line. */
@Component
class AdmissionReleaseListener {

	private final WaitingLine line;

	AdmissionReleaseListener(WaitingLine line) {
		this.line = line;
	}

	@EventListener
	void on(OrderPaidEvent event) {
		line.leave(event.eventId(), event.userId());
	}

}
