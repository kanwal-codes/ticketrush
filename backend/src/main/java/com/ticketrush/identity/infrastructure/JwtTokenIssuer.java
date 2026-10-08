package com.ticketrush.identity.infrastructure;

import com.ticketrush.identity.application.TokenIssuer;
import com.ticketrush.identity.domain.User;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;

@Component
class JwtTokenIssuer implements TokenIssuer {

	private final JwtEncoder encoder;
	private final JwtProperties properties;

	JwtTokenIssuer(JwtEncoder encoder, JwtProperties properties) {
		this.encoder = encoder;
		this.properties = properties;
	}

	@Override
	public IssuedToken issue(User user, Instant authTime) {
		Instant now = Instant.now();
		JwtClaimsSet claims = JwtClaimsSet.builder()
				.issuer(properties.issuer())
				.issuedAt(now)
				.expiresAt(now.plus(properties.ttl()))
				.subject(String.valueOf(user.getId()))
				.claim("email", user.getEmail())
				.claim("roles", List.of(user.getRole().name()))
				.claim("auth_time", authTime.getEpochSecond())
				.build();
		String token = encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
				.getTokenValue();
		return new IssuedToken(token, properties.ttl().toSeconds());
	}

}
