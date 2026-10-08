package com.ticketrush.identity.application;

import com.ticketrush.identity.domain.Role;
import com.ticketrush.identity.domain.User;
import com.ticketrush.identity.domain.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Creates the first organizer on a fresh database, in any profile, because registration only ever makes guests.
 * Configured with TICKETRUSH_BOOTSTRAP_ORGANIZER_EMAIL and TICKETRUSH_BOOTSTRAP_ORGANIZER_PASSWORD; does nothing when
 * they are blank. It never changes an account that exists, so a restart cannot reset a password.
 */
@Component
class OrganizerBootstrap implements ApplicationRunner {

	static final int MIN_PASSWORD = 12;
	private static final Logger log = LoggerFactory.getLogger(OrganizerBootstrap.class);

	private final UserRepository users;
	private final PasswordEncoder encoder;
	private final String email;
	private final String password;

	OrganizerBootstrap(UserRepository users, PasswordEncoder encoder,
			@Value("${ticketrush.bootstrap.organizer-email:}") String email,
			@Value("${ticketrush.bootstrap.organizer-password:}") String password) {
		this.users = users;
		this.encoder = encoder;
		this.email = email.strip();
		this.password = password;
	}

	@Override
	public void run(ApplicationArguments args) {
		if (email.isEmpty() && password.isEmpty()) {
			return;
		}
		if (email.isEmpty() || !email.contains("@")) {
			throw new IllegalStateException("TICKETRUSH_BOOTSTRAP_ORGANIZER_EMAIL must be an email address");
		}
		if (password.length() < MIN_PASSWORD) {
			throw new IllegalStateException(
					"TICKETRUSH_BOOTSTRAP_ORGANIZER_PASSWORD must be at least " + MIN_PASSWORD + " characters");
		}
		if (users.findByEmailIgnoreCase(email).isPresent()) {
			log.info("Bootstrap organizer already exists");
			return;
		}
		users.save(new User(email, encoder.encode(password), "Organizer", Role.ORGANIZER));
		log.info("Created the bootstrap organizer {}", email);
	}

}
