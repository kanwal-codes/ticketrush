package com.ticketrush.identity.application;

import com.ticketrush.identity.domain.User;

import java.time.Instant;

/** Port: how an access token is produced. The JWT details live in infrastructure. */
public interface TokenIssuer {

	/** {@code authTime} is when the password was last entered; a refreshed token keeps the original. */
	IssuedToken issue(User user, Instant authTime);

	record IssuedToken(String value, long expiresInSeconds) {
	}

}
