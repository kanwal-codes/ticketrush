package com.ticketrush.identity.infrastructure;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.util.Set;

/**
 * Limits sign-in and sign-up attempts per client address, so a password cannot be guessed at full speed and sign-ups
 * cannot be spammed. A fixed one-minute window, one INCR per request. If Redis is unavailable it lets the request
 * through rather than locking everyone out (the password check is still the gate).
 */
@Component
class AuthRateLimitFilter extends OncePerRequestFilter {

	private static final Logger log = LoggerFactory.getLogger(AuthRateLimitFilter.class);
	private static final Set<String> PATHS = Set.of("/api/auth/login", "/api/auth/register");

	private final StringRedisTemplate redis;
	private final Clock clock;
	private final int perMinute;

	AuthRateLimitFilter(StringRedisTemplate redis, Clock clock,
			@Value("${ticketrush.auth.rate-limit-per-minute:20}") int perMinute) {
		this.redis = redis;
		this.clock = clock;
		this.perMinute = perMinute;
	}

	@Override
	protected boolean shouldNotFilter(HttpServletRequest request) {
		return perMinute <= 0 || !"POST".equals(request.getMethod()) || !PATHS.contains(request.getRequestURI());
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		long second = clock.instant().getEpochSecond();
		long retryAfter = 60 - (second % 60);
		if (tooMany(request, second)) {
			response.setStatus(429);
			response.setHeader("Retry-After", String.valueOf(retryAfter));
			response.setContentType("application/problem+json");
			response.getWriter().write("{\"type\":\"about:blank\",\"title\":\"Slow down\",\"status\":429,"
					+ "\"detail\":\"Too many attempts. Try again in " + retryAfter + " seconds.\"}");
			return;
		}
		chain.doFilter(request, response);
	}

	private boolean tooMany(HttpServletRequest request, long second) {
		try {
			String key = "ratelimit:auth:" + request.getRequestURI() + ":" + request.getRemoteAddr() + ":" + (second / 60);
			Long count = redis.opsForValue().increment(key);
			if (count != null && count == 1) {
				redis.expire(key, Duration.ofSeconds(70));
			}
			return count != null && count > perMinute;
		}
		catch (RuntimeException e) {
			log.warn("Rate limit check skipped: {}", e.getMessage());
			return false;
		}
	}

}
