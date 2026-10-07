package com.ticketrush.queue.api;

import com.ticketrush.queue.application.QueueService;
import com.ticketrush.queue.application.QueueService.QueueView;
import com.ticketrush.queue.domain.QueueState;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Duration;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Live waiting-room updates over Server-Sent Events. Each open stream gets the guest's current status once per
 * push interval, and the stream closes as soon as the guest is admitted. State lives in Redis, not in the
 * connection, so a dropped stream loses nothing: reconnecting shows the same place in line.
 */
@Component
class QueueStreamer {

	private static final Logger log = LoggerFactory.getLogger(QueueStreamer.class);

	private record Subscriber(long userId, long eventId, SseEmitter emitter) {
	}

	private final Set<Subscriber> subscribers = ConcurrentHashMap.newKeySet();
	private final QueueService queue;

	QueueStreamer(QueueService queue) {
		this.queue = queue;
	}

	/** Opens a stream and sends the current status straight away. Unknown events fail before streaming starts. */
	SseEmitter open(long userId, long eventId) {
		QueueView first = queue.streamStatus(userId, eventId);
		SseEmitter emitter = new SseEmitter(Duration.ofMinutes(30).toMillis());
		Subscriber subscriber = new Subscriber(userId, eventId, emitter);
		emitter.onCompletion(() -> subscribers.remove(subscriber));
		emitter.onTimeout(emitter::complete);
		emitter.onError(error -> subscribers.remove(subscriber));
		subscribers.add(subscriber);
		send(subscriber, first);
		return emitter;
	}

	@Scheduled(fixedDelayString = "${ticketrush.queue.push-interval}",
			initialDelayString = "${ticketrush.queue.push-interval}")
	void push() {
		for (Subscriber subscriber : subscribers) {
			try {
				send(subscriber, queue.streamStatus(subscriber.userId(), subscriber.eventId()));
			}
			catch (RuntimeException e) {
				// For example the event ended or was cancelled. Closing makes the client ask again.
				log.debug("Closing stream for guest {}: {}", subscriber.userId(), e.getMessage());
				subscribers.remove(subscriber);
				subscriber.emitter().complete();
			}
		}
	}

	int openStreams() {
		return subscribers.size();
	}

	private void send(Subscriber subscriber, QueueView view) {
		try {
			subscriber.emitter().send(SseEmitter.event().name("status").data(view, MediaType.APPLICATION_JSON));
			if (view.state() == QueueState.ADMITTED) {
				subscriber.emitter().complete();
			}
		}
		catch (IOException | IllegalStateException e) {
			// The client went away.
			subscribers.remove(subscriber);
			subscriber.emitter().complete();
		}
	}

}
