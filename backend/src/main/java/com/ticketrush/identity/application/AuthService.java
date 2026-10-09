package com.ticketrush.identity.application;

import com.ticketrush.identity.application.TokenIssuer.IssuedToken;
import com.ticketrush.identity.domain.EmailToken;
import com.ticketrush.identity.domain.Role;
import com.ticketrush.identity.domain.User;
import com.ticketrush.identity.domain.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Locale;

@Service
public class AuthService {

	private final UserRepository users;
	private final PasswordEncoder encoder;
	private final TokenIssuer tokens;
	private final Clock clock;
	private final AccountEmails emails;
	private final Duration maxSession;
	// Hash compared against when the email is unknown, so a miss takes as long as a wrong password.
	private final String timingHash;

	public AuthService(UserRepository users, PasswordEncoder encoder, TokenIssuer tokens, Clock clock,
			AccountEmails emails, @Value("${ticketrush.jwt.max-session:PT8H}") Duration maxSession) {
		this.users = users;
		this.encoder = encoder;
		this.tokens = tokens;
		this.clock = clock;
		this.emails = emails;
		this.maxSession = maxSession;
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
			User user = users.saveAndFlush(new User(normalized, encoder.encode(rawPassword), displayName.strip(), Role.GUEST,
					!emails.verificationRequired()));
			if (!user.isEmailVerified()) {
				emails.sendVerification(user, true);
			}
			return user;
		}
		catch (DataIntegrityViolationException race) {
			throw new DuplicateEmailException();
		}
	}

	/** Confirms the address the link was sent to. */
	@Transactional
	public void verifyEmail(String secret) {
		long userId = emails.redeem(secret, EmailToken.VERIFY);
		users.findById(userId).ifPresent(User::markEmailVerified);
	}

	/** Sends a new confirmation link to a signed-in guest who has not confirmed yet. Nothing to do once they have. */
	@Transactional
	public void resendVerification(long userId) {
		User user = get(userId);
		if (!user.isEmailVerified()) {
			emails.sendVerification(user, false);
		}
	}

	/** Always returns normally, so the answer never says whether an address has an account. */
	@Transactional
	public void forgotPassword(String email) {
		users.findByEmailIgnoreCase(normalize(email)).ifPresent(emails::sendReset);
	}

	/**
	 * Sets a new password from a reset link. The link proves control of the address, so the address counts as
	 * confirmed, and every other reset link for the account stops working.
	 */
	@Transactional
	public void resetPassword(String secret, String newPassword) {
		long userId = emails.redeem(secret, EmailToken.RESET);
		User user = users.findById(userId).orElseThrow(InvalidLinkException::new);
		user.changePassword(encoder.encode(newPassword), clock.instant());
		user.markEmailVerified();
		emails.retireResets(userId);
	}

	@Transactional(readOnly = true)
	public IssuedToken login(String email, String rawPassword) {
		User user = users.findByEmailIgnoreCase(normalize(email)).orElse(null);
		String hash = user != null ? user.getPasswordHash() : timingHash;
		boolean matches = encoder.matches(rawPassword, hash);
		if (user == null || !matches) {
			throw new InvalidCredentialsException();
		}
		return tokens.issue(user, clock.instant());
	}

	/**
	 * A new token for someone who still holds a valid one, so a person who is using the app is not sent back to the
	 * sign-in page every 30 minutes. It keeps the time the password was entered: past {@code maxSession} from then,
	 * it is refused and the password is needed again. The account is looked up again, so a deleted account or a
	 * changed role does not outlive its token.
	 */
	@Transactional(readOnly = true)
	public IssuedToken refresh(long userId, Instant authTime) {
		if (authTime.plus(maxSession).isBefore(clock.instant())) {
			throw new SessionExpiredException();
		}
		User user = users.findById(userId).filter(u -> !u.isDeleted()).orElseThrow(SessionExpiredException::new);
		// A sign-in from before the password changed is not renewed: whoever held it needs the new password.
		// The token records whole seconds, so compare in whole seconds or a sign-in right after the change would be refused.
		if (user.getPasswordChangedAt() != null && authTime.isBefore(user.getPasswordChangedAt().truncatedTo(ChronoUnit.SECONDS))) {
			throw new SessionExpiredException();
		}
		return tokens.issue(user, authTime);
	}

	@Transactional(readOnly = true)
	public User get(long id) {
		return users.findById(id).orElseThrow(() -> new UserNotFoundException(id));
	}

	private static String normalize(String email) {
		return email.strip().toLowerCase(Locale.ROOT);
	}

}
