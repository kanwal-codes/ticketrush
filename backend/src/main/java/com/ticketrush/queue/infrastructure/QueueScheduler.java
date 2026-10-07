package com.ticketrush.queue.infrastructure;

import com.ticketrush.queue.application.QueueService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Runs an admission round on a steady beat. */
@Component
class QueueScheduler {

	private static final Logger log = LoggerFactory.getLogger(QueueScheduler.class);

	private final QueueService queue;

	QueueScheduler(QueueService queue) {
		this.queue = queue;
	}

	@Scheduled(fixedDelayString = "${ticketrush.queue.scheduler-delay}",
			initialDelayString = "${ticketrush.queue.scheduler-delay}")
	void admit() {
		int admitted = queue.admitDue();
		if (admitted > 0) {
			log.debug("Admitted {} guests", admitted);
		}
	}

}
