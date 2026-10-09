package com.ticketrush.identity.application;

import com.ticketrush.identity.domain.EmailToken;
import com.ticketrush.identity.domain.EmailTokenRepository;
import com.ticketrush.identity.domain.User;
import com.ticketrush.mail.domain.Mailer;
import com.ticketrush.mail.domain.Mailer.Mail;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

/**
 * The emails a guest's account sends: confirm the address, choose a new password. Each carries a single-use link whose
 * secret is stored only as a hash. The link is created before the request ends but the message goes out on another
 * thread, so a slow or failing provider never fails a sign-up and a reset request takes the same time whether or not
 * the address has an account.
 */
@Service
public class AccountEmails {

	private static final Logger log = LoggerFactory.getLogger(AccountEmails.class);
	private static final Duration VERIFY_TTL = Duration.ofDays(2);
	private static final Duration RESET_TTL = Duration.ofHours(1);
	private static final Duration TOO_SOON = Duration.ofSeconds(60);
	private static final Executor SENDER = Executors.newVirtualThreadPerTaskExecutor();
	private static final SecureRandom RANDOM = new SecureRandom();

	private final EmailTokenRepository tokens;
	private final Mailer mailer;
	private final Clock clock;
	private final String publicUrl;

	public AccountEmails(EmailTokenRepository tokens, Mailer mailer, Clock clock,
			@Value("${ticketrush.public-url}") String publicUrl) {
		this.tokens = tokens;
		this.mailer = mailer;
		this.clock = clock;
		this.publicUrl = publicUrl.endsWith("/") ? publicUrl.substring(0, publicUrl.length() - 1) : publicUrl;
	}

	/** New guests must confirm their address only where the app can really send them the link. */
	public boolean verificationRequired() {
		return mailer.delivers();
	}

	/** Asks the guest to confirm their address. With {@code force} off, a request right after the last one is refused. */
	@Transactional
	public void sendVerification(User user, boolean force) {
		String secret = issue(user, EmailToken.VERIFY, VERIFY_TTL, force);
		deliver(user, "Confirm your email for TicketRush",
				"Hi " + user.getDisplayName() + ",\n\nConfirm your email address to join queues and buy tickets:\n\n"
						+ publicUrl + "/verify-email?token=" + secret + "\n\nThe link works for 2 days. If you did not create "
						+ "a TicketRush account, ignore this message.\n");
	}

	/** Sends a password reset link, or quietly does nothing when one went out a minute ago. */
	@Transactional
	public void sendReset(User user) {
		String secret;
		try {
			secret = issue(user, EmailToken.RESET, RESET_TTL, false);
		}
		catch (TooSoonException soon) {
			return;
		}
		deliver(user, "Reset your TicketRush password",
				"Hi " + user.getDisplayName() + ",\n\nSomeone asked to reset the password for this account. To choose a new "
						+ "one, open:\n\n" + publicUrl + "/reset-password?token=" + secret + "\n\nThe link works for 1 hour and "
						+ "once. If this was not you, ignore this message: your password has not changed.\n");
	}

	/** The user a live link of this kind belongs to, with the link used up. Anything else is an invalid link. */
	@Transactional
	public long redeem(String secret, String kind) {
		EmailToken token = tokens.findByTokenHashAndKind(hash(secret), kind).orElseThrow(InvalidLinkException::new);
		Instant now = clock.instant();
		if (!token.isUsable(now)) {
			throw new InvalidLinkException();
		}
		token.markUsed(now);
		return token.getUserId();
	}

	@Transactional
	public void retireResets(long userId) {
		tokens.retireAll(userId, EmailToken.RESET, clock.instant());
	}

	private String issue(User user, String kind, Duration ttl, boolean force) {
		Instant now = clock.instant();
		if (!force && tokens.findFirstByUserIdAndKindOrderByCreatedAtDesc(user.getId(), kind)
				.filter(last -> last.getCreatedAt().plus(TOO_SOON).isAfter(now)).isPresent()) {
			throw new TooSoonException();
		}
		byte[] bytes = new byte[32];
		RANDOM.nextBytes(bytes);
		String secret = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
		tokens.save(new EmailToken(user.getId(), kind, hash(secret), now, now.plus(ttl)));
		return secret;
	}

	private void deliver(User user, String subject, String text) {
		Mail mail = new Mail(user.getEmail(), subject, text, null);
		SENDER.execute(() -> {
			try {
				mailer.send(mail);
			}
			catch (RuntimeException e) {
				log.warn("Account email to user {} was not sent: {}", user.getId(), e.getMessage());
			}
		});
	}

	static String hash(String secret) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(secret.getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}

}
