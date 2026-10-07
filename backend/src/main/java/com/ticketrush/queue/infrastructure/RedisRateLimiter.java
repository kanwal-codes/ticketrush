package com.ticketrush.queue.infrastructure;

import com.ticketrush.queue.domain.RateLimiter;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;

/** A fixed one-minute window per guest and bucket. Simple and cheap: one INCR per request. */
@Component
class RedisRateLimiter implements RateLimiter {

	private final StringRedisTemplate redis;

	RedisRateLimiter(StringRedisTemplate redis) {
		this.redis = redis;
	}

	@Override
	public Outcome tryAcquire(String bucket, long userId, int limitPerMinute, Instant now) {
		long second = now.getEpochSecond();
		String key = "ratelimit:" + bucket + ":" + userId + ":" + (second / 60);
		Long count = redis.opsForValue().increment(key);
		if (count != null && count == 1) {
			redis.expire(key, Duration.ofSeconds(70));
		}
		boolean allowed = count != null && count <= limitPerMinute;
		return new Outcome(allowed, 60 - (second % 60));
	}

}
