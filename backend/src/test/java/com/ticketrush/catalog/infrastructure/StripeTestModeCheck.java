package com.ticketrush.catalog.infrastructure;

import com.ticketrush.catalog.domain.PaymentGateway.ChargeRequest;
import com.ticketrush.catalog.domain.PaymentGateway.ChargeResult;
import com.ticketrush.catalog.domain.PaymentGateway.Outcome;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

/**
 * The Stripe adapter against Stripe's real test API, with Stripe's own test PaymentMethods. Not part of the normal build (it
 * needs a key and the internet): run it with {@code STRIPE_TEST_KEY=sk_test_... ./mvnw test -Dtest=StripeTestModeCheck}.
 * It only ever creates test-mode objects; no real money can move with a test key, and the adapter refuses any other.
 */
@EnabledIfEnvironmentVariable(named = "STRIPE_TEST_KEY", matches = "sk_test_.+")
class StripeTestModeCheck {

	private final StripePaymentGateway stripe = new StripePaymentGateway(System.getenv("STRIPE_TEST_KEY"), client());

	private static RestClient client() {
		JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());
		factory.setReadTimeout(Duration.ofSeconds(20));
		return RestClient.builder().baseUrl("https://api.stripe.com").requestFactory(factory).build();
	}

	private static ChargeRequest charge(String key, String paymentMethod) {
		return new ChargeRequest(key, 20640, "CAD", paymentMethod, "TicketRush check");
	}

	@Test
	void aGoodCardSucceedsRepeatsWithoutChargingAgainIsFoundLaterAndIsRefundedOnce() {
		String key = "check-" + UUID.randomUUID();
		ChargeResult first = stripe.charge(charge(key, "pm_card_visa"));
		assertThat(first.outcome()).isEqualTo(Outcome.SUCCEEDED);
		assertThat(first.paymentRef()).startsWith("pi_");

		// The same key again is the same payment, not a second one.
		assertThat(stripe.charge(charge(key, "pm_card_visa"))).isEqualTo(first);

		// Stripe's search is a little behind, so give it time, as the reconciler does.
		await().atMost(Duration.ofSeconds(90)).pollInterval(Duration.ofSeconds(3))
				.untilAsserted(() -> assertThat(stripe.lookup(key)).isEqualTo(first));

		assertThat(stripe.refund(first.paymentRef(), 20640, "refund-" + key).succeeded()).isTrue();
		assertThat(stripe.refund(first.paymentRef(), 20640, "refund-" + key).succeeded()).isTrue();
		// A different refund key for money already returned counts as done, not as an error to retry forever.
		assertThat(stripe.refund(first.paymentRef(), 20640, "refund-again-" + key).succeeded()).isTrue();
	}

	@Test
	void aDeclinedCardIsDeclinedWithStripesReason() {
		ChargeResult result = stripe.charge(charge("check-" + UUID.randomUUID(), "pm_card_chargeDeclined"));
		assertThat(result.outcome()).isEqualTo(Outcome.DECLINED);
		assertThat(result.declineReason()).isEqualTo("card_declined");
	}

	@Test
	void aCardWithNoFundsSaysSo() {
		ChargeResult result = stripe.charge(charge("check-" + UUID.randomUUID(), "pm_card_chargeDeclinedInsufficientFunds"));
		assertThat(result.outcome()).isEqualTo(Outcome.DECLINED);
		assertThat(result.declineReason()).isEqualTo("insufficient_funds");
	}

	@Test
	void aCardThatNeedsExtraAuthenticationIsDeclinedAndNotLeftOpen() {
		ChargeResult result = stripe.charge(charge("check-" + UUID.randomUUID(), "pm_card_threeDSecureRequired"));
		assertThat(result.outcome()).isEqualTo(Outcome.DECLINED);
		assertThat(result.declineReason()).isEqualTo("authentication_required");
	}

	@Test
	void aPaymentMethodThatDoesNotExistIsAnUnreadableCard() {
		ChargeResult result = stripe.charge(charge("check-" + UUID.randomUUID(), "pm_does_not_exist"));
		assertThat(result.outcome()).isEqualTo(Outcome.DECLINED);
		assertThat(result.declineReason()).isEqualTo("invalid_payment_token");
	}

	@Test
	void aChargeNobodyMadeIsUnknown() {
		assertThat(stripe.lookup("check-never-made-" + UUID.randomUUID()).outcome()).isEqualTo(Outcome.UNKNOWN);
	}

}
