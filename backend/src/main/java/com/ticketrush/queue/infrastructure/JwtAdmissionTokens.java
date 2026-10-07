package com.ticketrush.queue.infrastructure;

import com.ticketrush.catalog.application.AdmissionCheck;
import com.ticketrush.catalog.application.AdmissionRequiredException;
import com.ticketrush.queue.domain.AdmissionTokens;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
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
class JwtAdmissionTokens implements AdmissionTokens, AdmissionCheck {

	static final String SCOPE = "admission";

	private final JwtEncoder encoder;
	private final JwtDecoder decoder;
	private final Clock clock;

	JwtAdmissionTokens(JwtEncoder encoder, JwtDecoder decoder, Clock clock) {
		this.encoder = encoder;
		this.decoder = decoder;
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

	/**
	 * Valid only if it is signed by us, is an admission token (not a sign-in token), names this guest and this
	 * event, and has not ended. Expiry is checked against our clock as well as the decoder's, so a token that
	 * ended a moment ago is refused despite the decoder's small tolerance.
	 */
	@Override
	public void require(long userId, long eventId, String admissionToken) {
		if (admissionToken == null || admissionToken.isBlank()) {
			throw new AdmissionRequiredException();
		}
		Jwt jwt;
		try {
			jwt = decoder.decode(admissionToken.strip());
		}
		catch (JwtException e) {
			throw new AdmissionRequiredException();
		}
		boolean valid = SCOPE.equals(jwt.getClaimAsString("scope"))
				&& String.valueOf(userId).equals(jwt.getSubject())
				&& String.valueOf(eventId).equals(String.valueOf(jwt.getClaims().get("event")))
				&& jwt.getExpiresAt() != null && jwt.getExpiresAt().isAfter(clock.instant());
		if (!valid) {
			throw new AdmissionRequiredException();
		}
	}

}
