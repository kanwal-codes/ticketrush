package com.ticketrush.identity.application;

import com.ticketrush.identity.application.TurnstileVerifier.Verdict;
import org.springframework.stereotype.Service;

/** The gate in front of sign-up: bots need accounts, so accounts need a passed check. Off when not configured. */
@Service
public class BotCheck {

	private final TurnstileVerifier verifier;

	public BotCheck(TurnstileVerifier verifier) {
		this.verifier = verifier;
	}

	public void require(String token, String clientAddress) {
		if (!verifier.enabled()) {
			return;
		}
		if (token == null || token.isBlank()) {
			throw new BotCheckFailedException();
		}
		Verdict verdict = verifier.verify(token, clientAddress);
		if (verdict == Verdict.UNAVAILABLE) {
			throw new BotCheckUnavailableException();
		}
		if (verdict != Verdict.PASSED) {
			throw new BotCheckFailedException();
		}
	}

}
