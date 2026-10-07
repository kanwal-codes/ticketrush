package com.ticketrush.catalog.domain;

import java.security.SecureRandom;

/** Random identifiers for tickets and orders. Unguessable, because the ticket code is the proof at the door. */
public final class TicketCodes {

	private static final SecureRandom RANDOM = new SecureRandom();
	/** Crockford base32: no I, L, O or U, so a code read aloud or typed is hard to get wrong. */
	private static final char[] BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ".toCharArray();

	private TicketCodes() {
	}

	/** 128 random bits as 26 characters. */
	public static String ticketCode() {
		return random(26);
	}

	/** Short reference a guest can read out, like TR-8F2K41. */
	public static String orderReference() {
		return "TR-" + random(6);
	}

	private static String random(int length) {
		StringBuilder code = new StringBuilder(length);
		for (int i = 0; i < length; i++) {
			code.append(BASE32[RANDOM.nextInt(BASE32.length)]);
		}
		return code.toString();
	}

}
