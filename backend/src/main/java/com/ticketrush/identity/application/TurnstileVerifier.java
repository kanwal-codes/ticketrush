package com.ticketrush.identity.application;

/** Port: asks a bot-check provider whether a token from the guest's browser is genuine. */
public interface TurnstileVerifier {

	/** False means no secret is configured, so no check is made (development and tests). */
	boolean enabled();

	Verdict verify(String token, String clientAddress);

	enum Verdict {
		PASSED, FAILED, UNAVAILABLE
	}

}
