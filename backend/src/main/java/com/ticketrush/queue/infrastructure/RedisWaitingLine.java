package com.ticketrush.queue.infrastructure;

import com.ticketrush.queue.domain.QueueState;
import com.ticketrush.queue.domain.QueueStatus;
import com.ticketrush.queue.domain.WaitingLine;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * The waiting line in Redis, per event:
 * <ul>
 * <li>{@code queue:{e}:waiting}: sorted set of guests, scored by arrival number, so rank is place in line</li>
 * <li>{@code queue:{e}:admitted}: sorted set of guests let in, scored by when their admission ends</li>
 * <li>{@code queue:{e}:seq}: the arrival counter</li>
 * <li>{@code queue:{e}:tick}: lets several app instances share one admission round per interval</li>
 * <li>{@code queue:active}: events that have guests waiting</li>
 * </ul>
 */
@Component
class RedisWaitingLine implements WaitingLine {

	private static final String ACTIVE = "queue:active";

	/**
	 * Removes expired admissions, works out how many more fit inside, takes that many from the front of the
	 * line and adds them to the admitted set. Redis runs a script as one step, so nobody can be taken from the
	 * line without also being admitted, and two instances running it together cannot admit the same guest.
	 */
	private static final DefaultRedisScript<List> ADMIT = new DefaultRedisScript<>("""
			redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', ARGV[1])
			local inside = redis.call('ZCARD', KEYS[2])
			local n = math.min(tonumber(ARGV[3]), tonumber(ARGV[4]) - inside)
			local admitted = {}
			if n > 0 then
			  local popped = redis.call('ZPOPMIN', KEYS[1], n)
			  for i = 1, #popped, 2 do
			    redis.call('ZADD', KEYS[2], ARGV[2], popped[i])
			    admitted[#admitted + 1] = popped[i]
			  end
			end
			return admitted
			""", List.class);

	private final StringRedisTemplate redis;

	RedisWaitingLine(StringRedisTemplate redis) {
		this.redis = redis;
	}

	@Override
	public void join(long eventId, long userId, Instant now) {
		String user = String.valueOf(userId);
		Double admittedUntil = redis.opsForZSet().score(admitted(eventId), user);
		if (admittedUntil != null && admittedUntil > now.toEpochMilli()) {
			return;
		}
		Long arrival = redis.opsForValue().increment(seq(eventId));
		// Only adds if absent, so joining twice or refreshing keeps the original place.
		redis.opsForZSet().addIfAbsent(waiting(eventId), user, arrival);
		redis.opsForSet().add(ACTIVE, String.valueOf(eventId));
	}

	@Override
	public QueueStatus standing(long eventId, long userId, Instant now) {
		String user = String.valueOf(userId);
		long length = size(waiting(eventId));
		Double admittedUntil = redis.opsForZSet().score(admitted(eventId), user);
		if (admittedUntil != null && admittedUntil > now.toEpochMilli()) {
			return new QueueStatus(QueueState.ADMITTED, 0, length, Instant.ofEpochMilli(admittedUntil.longValue()));
		}
		Long rank = redis.opsForZSet().rank(waiting(eventId), user);
		if (rank != null) {
			return new QueueStatus(QueueState.WAITING, rank, length, null);
		}
		return new QueueStatus(QueueState.NOT_IN_QUEUE, 0, length, null);
	}

	@Override
	public void leave(long eventId, long userId) {
		String user = String.valueOf(userId);
		redis.opsForZSet().remove(waiting(eventId), user);
		redis.opsForZSet().remove(admitted(eventId), user);
	}

	@Override
	@SuppressWarnings("unchecked")
	public List<Long> admit(long eventId, int maxToAdmit, int maxInside, Instant now, Instant admissionExpiry) {
		List<Object> admitted = redis.execute(ADMIT, List.of(waiting(eventId), admitted(eventId)),
				String.valueOf(now.toEpochMilli()), String.valueOf(admissionExpiry.toEpochMilli()),
				String.valueOf(maxToAdmit), String.valueOf(maxInside));
		return admitted == null ? List.of() : admitted.stream().map(o -> Long.parseLong(o.toString())).toList();
	}

	@Override
	public Set<Long> eventsWithWaiting() {
		Set<String> members = redis.opsForSet().members(ACTIVE);
		return members == null ? Set.of() : members.stream().map(Long::parseLong).collect(Collectors.toSet());
	}

	@Override
	public void forgetIfEmpty(long eventId) {
		if (size(waiting(eventId)) == 0) {
			redis.opsForSet().remove(ACTIVE, String.valueOf(eventId));
		}
	}

	@Override
	public Depth depth(long eventId, Instant now) {
		Long inside = redis.opsForZSet().count(admitted(eventId), now.toEpochMilli(), Double.POSITIVE_INFINITY);
		return new Depth(size(waiting(eventId)), inside == null ? 0 : inside);
	}

	@Override
	public boolean claimTick(long eventId, Duration interval) {
		if (interval.isZero()) {
			return true;
		}
		// Slightly shorter than the interval, so a tick that starts a touch early is not skipped.
		Duration hold = interval.multipliedBy(9).dividedBy(10);
		return Boolean.TRUE.equals(redis.opsForValue().setIfAbsent(tick(eventId), "1", hold));
	}

	private long size(String key) {
		Long size = redis.opsForZSet().size(key);
		return size == null ? 0 : size;
	}

	private static String waiting(long eventId) {
		return "queue:" + eventId + ":waiting";
	}

	private static String admitted(long eventId) {
		return "queue:" + eventId + ":admitted";
	}

	private static String seq(long eventId) {
		return "queue:" + eventId + ":seq";
	}

	private static String tick(long eventId) {
		return "queue:" + eventId + ":tick";
	}

}
