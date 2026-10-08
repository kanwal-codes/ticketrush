package com.ticketrush.devtools;

import com.ticketrush.catalog.infrastructure.MockPaymentGateway;
import com.ticketrush.identity.application.TokenIssuer;
import com.ticketrush.identity.domain.Role;
import com.ticketrush.identity.domain.User;
import com.ticketrush.identity.domain.UserRepository;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Helpers for the load tests, present only with the "loadtest" profile and organizer only. Registering
 * thousands of guests through the real endpoint would spend the CPU the test is trying to measure on password
 * hashing, so guests are created in bulk with tokens issued directly.
 */
@RestController
@Profile("loadtest")
@RequestMapping("/dev/load")
class LoadTestController {

	private static final int MAX_GUESTS = 5000;

	private final UserRepository users;
	private final TokenIssuer tokens;
	private final PasswordEncoder encoder;
	private final MockPaymentGateway gateway;

	LoadTestController(UserRepository users, TokenIssuer tokens, PasswordEncoder encoder, MockPaymentGateway gateway) {
		this.users = users;
		this.tokens = tokens;
		this.encoder = encoder;
		this.gateway = gateway;
	}

	record LoadGuest(long id, String token) {
	}

	/** What the payment provider actually did, to compare with what the database says happened. */
	record PaymentStats(int charges, long chargedCents, int refunds) {
	}

	@PostMapping("/guests")
	List<LoadGuest> guests(@RequestParam int count) {
		if (count < 1 || count > MAX_GUESTS) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "count must be 1 to " + MAX_GUESTS);
		}
		// Nobody can sign in as these guests: the password is random and thrown away.
		String hash = encoder.encode(UUID.randomUUID().toString());
		List<User> batch = new ArrayList<>(count);
		for (int i = 0; i < count; i++) {
			batch.add(new User("load-" + UUID.randomUUID() + "@example.org", hash, "Load guest " + i, Role.GUEST));
		}
		return users.saveAll(batch).stream().map(u -> new LoadGuest(u.getId(), tokens.issue(u).value())).toList();
	}

	@GetMapping("/payments")
	PaymentStats payments() {
		var charges = gateway.successfulCharges();
		return new PaymentStats(charges.size(), charges.values().stream().mapToLong(Long::longValue).sum(),
				gateway.refundedKeys().size());
	}

}
