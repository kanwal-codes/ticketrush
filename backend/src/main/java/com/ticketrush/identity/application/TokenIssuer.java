package com.ticketrush.identity.application;

import com.ticketrush.identity.domain.User;

/** Port: how an access token is produced. The JWT details live in infrastructure. */
public interface TokenIssuer {

	IssuedToken issue(User user);

	record IssuedToken(String value, long expiresInSeconds) {
	}

}
