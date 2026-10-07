package com.ticketrush.identity.application;

import com.ticketrush.identity.application.TokenIssuer.IssuedToken;
import com.ticketrush.identity.domain.Role;
import com.ticketrush.identity.domain.User;
import com.ticketrush.identity.domain.UserRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;

@Service
public class AuthService {

	private final UserRepository users;
	private final PasswordEncoder encoder;
	private final TokenIssuer tokens;
	// Hash compared against when the email is unknown, so a miss takes as long as a wrong password.
	private final String timingHash;

	public AuthService(UserRepository users, PasswordEncoder encoder, TokenIssuer tokens) {
		this.users = users;
		this.encoder = encoder;
		this.tokens = tokens;
		this.timingHash = encoder.encode("timing-equalizer");
	}

	@Transactional
	public User register(String email, String rawPassword, String displayName) {
		String normalized = normalize(email);
		if (users.findByEmailIgnoreCase(normalized).isPresent()) {
			throw new DuplicateEmailException();
		}
		try {
			// Flush now so a concurrent duplicate surfaces here, as the unique index is the real guard.
			return users.saveAndFlush(new User(normalized, encoder.encode(rawPassword), displayName.strip(), Role.GUEST));
		}
		catch (DataIntegrityViolationException race) {
			throw new DuplicateEmailException();
		}
	}

	@Transactional(readOnly = true)
	public IssuedToken login(String email, String rawPassword) {
		User user = users.findByEmailIgnoreCase(normalize(email)).orElse(null);
		String hash = user != null ? user.getPasswordHash() : timingHash;
		boolean matches = encoder.matches(rawPassword, hash);
		if (user == null || !matches) {
			throw new InvalidCredentialsException();
		}
		return tokens.issue(user);
	}

	@Transactional(readOnly = true)
	public User get(long id) {
		return users.findById(id).orElseThrow(() -> new UserNotFoundException(id));
	}

	private static String normalize(String email) {
		return email.strip().toLowerCase(Locale.ROOT);
	}

}
