package com.ticketrush.mail.domain;

/** Port: sends one plain-text email. A failure is an exception, so callers can retry or give up. */
public interface Mailer {

	/**
	 * Whether messages really reach people. False for the development stand-in that only logs them; the app then
	 * does not ask guests to confirm their address, since nobody could receive the link.
	 */
	boolean delivers();

	/** The key lets a retry of the same message be recognised by the provider instead of sending it twice. */
	void send(Mail mail);

	record Mail(String to, String subject, String text, String key) {
	}

	class DeliveryException extends RuntimeException {

		public DeliveryException(String message, Throwable cause) {
			super(message, cause);
		}

	}

}
