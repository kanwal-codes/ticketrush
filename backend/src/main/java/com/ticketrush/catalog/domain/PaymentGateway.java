package com.ticketrush.catalog.domain;

/**
 * Port to whoever takes the money. Guests never send card details to us, only a token the provider gave them.
 * Every call is safe to repeat with the same idempotency key: the provider answers with what it did the first
 * time instead of charging again.
 */
public interface PaymentGateway {

	/** Takes the payment, or says it could not tell within the timeout (UNKNOWN). */
	ChargeResult charge(ChargeRequest request);

	/** Asks what happened to an earlier charge without causing one. UNKNOWN means the provider has no record. */
	ChargeResult lookup(String idempotencyKey);

	/** Returns money. Repeating a refund with the same key returns it only once. */
	RefundResult refund(String paymentRef, long amountCents, String idempotencyKey);

	record ChargeRequest(String idempotencyKey, long amountCents, String currency, String paymentToken,
			String description) {
	}

	/**
	 * SUCCEEDED and DECLINED are final. UNKNOWN is not a failure and not a success: the guest may or may not have
	 * been charged, and it has to be looked up later.
	 */
	enum Outcome {
		SUCCEEDED, DECLINED, UNKNOWN
	}

	record ChargeResult(Outcome outcome, String paymentRef, String declineReason) {

		public static ChargeResult succeeded(String paymentRef) {
			return new ChargeResult(Outcome.SUCCEEDED, paymentRef, null);
		}

		public static ChargeResult declined(String reason) {
			return new ChargeResult(Outcome.DECLINED, null, reason);
		}

		public static ChargeResult unknown() {
			return new ChargeResult(Outcome.UNKNOWN, null, null);
		}

	}

	record RefundResult(boolean succeeded) {
	}

}
