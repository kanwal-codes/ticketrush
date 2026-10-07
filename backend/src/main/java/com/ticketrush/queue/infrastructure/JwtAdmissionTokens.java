package com.ticketrush.queue.infrastructure;

import com.ticketrush.queue.domain.AdmissionTokens;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;

/**
 * Admission tokens are signed with the same key as sign-in tokens but have their own shape: scope
 * "admission", the event they are for, and the guest. That is why a sign-in token cannot pass as one.
 */
@Component
class JwtAdmissionTokens implements AdmissionTokens {

	static final String SCOPE = "admission";

	private final JwtEncoder encoder;
	private final Clock clock;

	JwtAdmissionTokens(JwtEncoder encoder, Clock clock) {
		this.encoder = encoder;
		this.clock = clock;
	}

	@Override
	public String issue(long userId, long eventId, Instant expiresAt) {
		JwtClaimsSet claims = JwtClaimsSet.builder()
				.issuedAt(clock.instant())
				.expiresAt(expiresAt)
				.subject(String.valueOf(userId))
				.claim("scope", SCOPE)
				.claim("event", eventId)
				.build();
		return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
				.getTokenValue();
	}

}
