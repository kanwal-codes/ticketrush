package com.ticketrush.queue.application;

import com.ticketrush.queue.domain.AdmissionTokens;
import com.ticketrush.queue.domain.EventFacts;
import com.ticketrush.queue.domain.EventFacts.Facts;
import com.ticketrush.queue.domain.QueueState;
import com.ticketrush.queue.domain.QueueStatus;
import com.ticketrush.queue.domain.RateLimiter;
import com.ticketrush.queue.domain.SalePhase;
import com.ticketrush.queue.domain.WaitingLine;
import io.swagger.v3.oas.annotations.media.Schema;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

/** The waiting room: a first-come, first-served line that lets guests in at a steady rate. */
@Service
public class QueueService {

	private static final int JOINS_PER_MINUTE = 20;
	private static final int STATUS_CHECKS_PER_MINUTE = 60;

	private final WaitingLine line;
	private final EventFacts events;
	private final RateLimiter limiter;
	private final AdmissionTokens tokens;
	private final Clock clock;
	private final int admitPerSecond;
	private final int maxInside;
	private final Duration admissionTtl;
	private final Duration tickInterval;
	private final MeterRegistry meters;

	public QueueService(WaitingLine line, EventFacts events, RateLimiter limiter, AdmissionTokens tokens, Clock clock,
			@Value("${ticketrush.queue.admit-per-second}") int admitPerSecond,
			@Value("${ticketrush.queue.max-admitted}") int maxInside,
			@Value("${ticketrush.queue.admission-ttl}") Duration admissionTtl,
			@Value("${ticketrush.queue.tick-interval}") Duration tickInterval, MeterRegistry meters) {
		this.line = line;
		this.events = events;
		this.limiter = limiter;
		this.tokens = tokens;
		this.clock = clock;
		this.admitPerSecond = admitPerSecond;
		this.maxInside = maxInside;
		this.admissionTtl = admissionTtl;
		this.tickInterval = tickInterval;
		this.meters = meters;
	}

	/**
	 * What a guest sees. The numbers are exact. Only the wait time is an estimate, worked out from the
	 * configured admission rate.
	 */
	public record QueueView(QueueState state, @Schema(nullable = true) Long position, long aheadOfYou, long queueLength,
			long estimatedWaitSeconds, @Schema(nullable = true) String admissionToken,
			@Schema(nullable = true) Instant admittedUntil, SalePhase saleState, Instant serverTime) {
	}

	/** Joins the line. Safe to repeat: a guest who is already waiting keeps their place. */
	public QueueView join(long userId, long eventId) {
		Instant now = clock.instant();
		limit("join", userId, JOINS_PER_MINUTE, now);
		Facts facts = facts(eventId, now);
		if (!facts.waitingRoom()) {
			throw new WaitingRoomClosedException("This event has no waiting room");
		}
		if (facts.phase() == SalePhase.NOT_YET) {
			throw new WaitingRoomClosedException("The waiting room opens at " + facts.opensAt());
		}
		if (facts.phase() == SalePhase.ENDED) {
			throw new WaitingRoomClosedException("This event has already started");
		}
		line.join(eventId, userId, now);
		meters.counter("ticketrush.queue.joins").increment();
		return view(userId, eventId, facts, now);
	}

	public QueueView status(long userId, long eventId) {
		Instant now = clock.instant();
		limit("status", userId, STATUS_CHECKS_PER_MINUTE, now);
		return statusWithoutLimit(userId, eventId, now);
	}

	/** Used by the live stream, which is the intended way to watch your place, so it is not rate limited. */
	public QueueView streamStatus(long userId, long eventId) {
		return statusWithoutLimit(userId, eventId, clock.instant());
	}

	/** What the organizer sees of their event's line: people waiting and people inside. */
	public WaitingLine.Depth depth(long organizerId, long eventId) {
		Long owner = events.organizerOf(eventId).orElseThrow(() -> new EventNotFoundException(eventId));
		if (owner != organizerId) {
			throw new NotYourEventException();
		}
		return line.depth(eventId, clock.instant());
	}

	public void leave(long userId, long eventId) {
		line.leave(eventId, userId);
	}

	/**
	 * One admission round, run by the scheduler. Admits the next guests for every event that is on sale.
	 * Returns how many were let in.
	 */
	public int admitDue() {
		Instant now = clock.instant();
		int total = 0;
		for (long eventId : line.eventsWithWaiting()) {
			Facts facts = events.find(eventId, now).orElse(null);
			if (facts == null || facts.phase() == SalePhase.ENDED) {
				line.forgetIfEmpty(eventId);
				continue;
			}
			if (facts.phase() != SalePhase.ON_SALE || !line.claimTick(eventId, tickInterval)) {
				continue;
			}
			int admitted = line.admit(eventId, perTick(), maxInside, now, now.plus(admissionTtl)).size();
			meters.counter("ticketrush.queue.admitted").increment(admitted);
			total += admitted;
			line.forgetIfEmpty(eventId);
		}
		return total;
	}

	private QueueView statusWithoutLimit(long userId, long eventId, Instant now) {
		return view(userId, eventId, facts(eventId, now), now);
	}

	private QueueView view(long userId, long eventId, Facts facts, Instant now) {
		QueueStatus standing = line.standing(eventId, userId, now);
		boolean waiting = standing.state() == QueueState.WAITING;
		boolean admitted = standing.state() == QueueState.ADMITTED;
		long wait = waiting ? (long) Math.ceil(standing.aheadOfYou() / (double) admitPerSecond) : 0;
		String token = admitted ? tokens.issue(userId, eventId, standing.admittedUntil()) : null;
		return new QueueView(standing.state(), waiting ? standing.aheadOfYou() + 1 : null, standing.aheadOfYou(),
				standing.queueLength(), wait, token, standing.admittedUntil(), facts.phase(), now);
	}

	private Facts facts(long eventId, Instant now) {
		return events.find(eventId, now).orElseThrow(() -> new EventNotFoundException(eventId));
	}

	private void limit(String bucket, long userId, int perMinute, Instant now) {
		RateLimiter.Outcome outcome = limiter.tryAcquire(bucket, userId, perMinute, now);
		if (!outcome.allowed()) {
			throw new TooManyRequestsException(outcome.retryAfterSeconds());
		}
	}

	/** How many guests one tick lets in: the per-second rate scaled to the tick length. */
	private int perTick() {
		double seconds = tickInterval.isZero() ? 1.0 : tickInterval.toMillis() / 1000.0;
		return Math.max(1, (int) Math.round(admitPerSecond * seconds));
	}

}
