package com.ticketrush.identity.infrastructure;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.nio.charset.StandardCharsets;
import java.time.Duration;

/**
 * {@code ttl} is how long one token lasts; {@code maxSession} is how long a sign-in can be kept alive by refreshing
 * before the password has to be entered again.
 */
@ConfigurationProperties("ticketrush.jwt")
record JwtProperties(String secret, Duration ttl, String issuer, Duration maxSession) {

	JwtProperties {
		// HS256 needs at least 256 bits of key. Fail at startup instead of signing weak tokens.
		if (secret == null || secret.getBytes(StandardCharsets.UTF_8).length < 32) {
			throw new IllegalStateException("ticketrush.jwt.secret (env JWT_SECRET) must be at least 32 bytes");
		}
		if (maxSession == null) {
			maxSession = Duration.ofHours(8);
		}
	}

}
