package com.ticketrush;

import com.ticketrush.mail.domain.Mailer;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

/** Stands in for the email provider: remembers what was sent, and can be told to fail. */
public class RecordingMailer implements Mailer {

	private final List<Mail> sent = new CopyOnWriteArrayList<>();
	private final AtomicInteger failures = new AtomicInteger();
	private volatile boolean delivers = false;

	@Override
	public boolean delivers() {
		return delivers;
	}

	@Override
	public void send(Mail mail) {
		if (failures.getAndUpdate(n -> Math.max(0, n - 1)) > 0) {
			throw new DeliveryException("provider is down", null);
		}
		sent.add(mail);
	}

	public List<Mail> sent() {
		return List.copyOf(sent);
	}

	public List<Mail> sentTo(String address) {
		return sent.stream().filter(m -> m.to().equalsIgnoreCase(address)).toList();
	}

	/** Pretend to be a real provider, so new guests are asked to confirm their address. */
	public void delivers(boolean delivers) {
		this.delivers = delivers;
	}

	public void failNext(int n) {
		failures.set(n);
	}

	public void reset() {
		sent.clear();
		failures.set(0);
		delivers = false;
	}

	/** The first link in a message, which is how a guest uses it. */
	public static String linkIn(Mail mail) {
		java.util.regex.Matcher m = java.util.regex.Pattern.compile("https?://\\S+").matcher(mail.text());
		if (!m.find()) {
			throw new AssertionError("No link in: " + mail.text());
		}
		return m.group();
	}

	public static String tokenIn(Mail mail) {
		String link = linkIn(mail);
		return link.substring(link.indexOf("token=") + "token=".length());
	}

}
