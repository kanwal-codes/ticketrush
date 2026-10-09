package com.ticketrush.catalog.infrastructure;

import com.ticketrush.catalog.domain.PaymentGateway.ChargeRequest;
import com.ticketrush.catalog.domain.PaymentGateway.ChargeResult;
import com.ticketrush.catalog.domain.PaymentGateway.Outcome;
import org.junit.jupiter.api.Test;
import org.springframework.boot.convert.ApplicationConversionService;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.client.RequestMatcher;
import org.springframework.test.web.client.ResponseActions;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/** What the Stripe adapter sends, and how it reads each answer. Stripe itself is replaced by a recorded server. */
class StripePaymentGatewayTest {

	private static final String API = "https://stripe.test";

	private MockRestServiceServer server;

	private StripePaymentGateway gateway() {
		RestClient.Builder builder = RestClient.builder().baseUrl(API);
		server = MockRestServiceServer.bindTo(builder).build();
		return new StripePaymentGateway("sk_test_abc", builder.build());
	}

	private static final ChargeRequest REQUEST = new ChargeRequest("order-7", 20640, "CAD", "pm_card_visa", "TicketRush order TR-1");

	/** A fresh expectation: a recorded server cannot take new ones once a request has been made. */
	private ResponseActions next(RequestMatcher matcher) {
		server.reset();
		return server.expect(matcher);
	}

	private static MediaType json() {
		return MediaType.APPLICATION_JSON;
	}

	@Test
	void onlyTestKeysAreAccepted() {
		RestClient client = RestClient.builder().baseUrl(API).build();
		assertThatThrownBy(() -> new StripePaymentGateway("sk_live_abc", client)).isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("test keys");
		assertThatThrownBy(() -> new StripePaymentGateway("pk_test_abc", client)).isInstanceOf(IllegalStateException.class);
		new StripePaymentGateway("rk_test_abc", client);
	}

	@Test
	void aConfirmedPaymentIntentIsSentWithTheOrdersKeyAndSucceeds() {
		StripePaymentGateway stripe = gateway();
		next(requestTo(API + "/v1/payment_intents")).andExpect(method(HttpMethod.POST))
				.andExpect(header("Authorization", "Bearer sk_test_abc")).andExpect(header("Idempotency-Key", "order-7"))
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_FORM_URLENCODED))
				.andExpect(content().string(containsString("amount=20640")))
				.andExpect(content().string(containsString("currency=cad")))
				.andExpect(content().string(containsString("payment_method=pm_card_visa")))
				.andExpect(content().string(containsString("confirm=true")))
				.andExpect(content().string(containsString("allow_redirects%5D=never")))
				.andExpect(content().string(containsString("metadata%5Bidem%5D=order-7")))
				.andRespond(withSuccess("{\"id\":\"pi_1\",\"status\":\"succeeded\"}", json()));

		assertThat(stripe.charge(REQUEST)).isEqualTo(ChargeResult.succeeded("pi_1"));
		server.verify();
	}

	@Test
	void aDeclinedCardIsFinalAndKeepsStripesReason() {
		StripePaymentGateway stripe = gateway();
		next(requestTo(API + "/v1/payment_intents")).andRespond(withStatus(HttpStatus.PAYMENT_REQUIRED).contentType(json())
				.body("{\"error\":{\"type\":\"card_error\",\"code\":\"card_declined\",\"decline_code\":\"generic_decline\"}}"));
		assertThat(stripe.charge(REQUEST)).isEqualTo(ChargeResult.declined("card_declined"));

		next(requestTo(API + "/v1/payment_intents")).andRespond(withStatus(HttpStatus.PAYMENT_REQUIRED).contentType(json())
				.body("{\"error\":{\"type\":\"card_error\",\"code\":\"card_declined\",\"decline_code\":\"insufficient_funds\"}}"));
		assertThat(stripe.charge(REQUEST)).isEqualTo(ChargeResult.declined("insufficient_funds"));

		next(requestTo(API + "/v1/payment_intents")).andRespond(withStatus(HttpStatus.PAYMENT_REQUIRED).contentType(json())
				.body("{\"error\":{\"type\":\"card_error\"}}"));
		assertThat(stripe.charge(REQUEST)).isEqualTo(ChargeResult.declined("card_declined"));
	}

	@Test
	void aPaymentMethodStripeCannotUseIsAnUnreadableCard() {
		StripePaymentGateway stripe = gateway();
		next(requestTo(API + "/v1/payment_intents")).andRespond(withStatus(HttpStatus.BAD_REQUEST).contentType(json())
				.body("{\"error\":{\"type\":\"invalid_request_error\",\"code\":\"resource_missing\"}}"));
		assertThat(stripe.charge(REQUEST)).isEqualTo(ChargeResult.declined("invalid_payment_token"));
	}

	@Test
	void aCardThatNeedsExtraAuthenticationIsCancelledAndDeclined() {
		StripePaymentGateway stripe = gateway();
		next(requestTo(API + "/v1/payment_intents")).andRespond(withSuccess("{\"id\":\"pi_2\",\"status\":\"requires_action\"}", json()));
		server.expect(requestTo(API + "/v1/payment_intents/pi_2/cancel")).andExpect(method(HttpMethod.POST))
				.andRespond(withSuccess("{}", json()));
		assertThat(stripe.charge(REQUEST)).isEqualTo(ChargeResult.declined("authentication_required"));
		server.verify();
	}

	@Test
	void aFailedCancelDoesNotChangeTheAnswer() {
		StripePaymentGateway stripe = gateway();
		next(requestTo(API + "/v1/payment_intents")).andRespond(withSuccess("{\"id\":\"pi_2\",\"status\":\"requires_action\"}", json()));
		server.expect(requestTo(API + "/v1/payment_intents/pi_2/cancel")).andRespond(withStatus(HttpStatus.BAD_GATEWAY));
		assertThat(stripe.charge(REQUEST).declineReason()).isEqualTo("authentication_required");
	}

	@Test
	void anythingUnclearIsUnknownSoTheReconcilerResolvesIt() {
		StripePaymentGateway stripe = gateway();
		next(requestTo(API + "/v1/payment_intents")).andRespond(withSuccess("{\"id\":\"pi_3\",\"status\":\"processing\"}", json()));
		assertThat(stripe.charge(REQUEST).outcome()).isEqualTo(Outcome.UNKNOWN);

		for (HttpStatus status : new HttpStatus[] { HttpStatus.BAD_GATEWAY, HttpStatus.CONFLICT, HttpStatus.TOO_MANY_REQUESTS }) {
			next(requestTo(API + "/v1/payment_intents")).andRespond(withStatus(status).contentType(json()).body("{\"error\":{\"type\":\"api_error\"}}"));
			assertThat(stripe.charge(REQUEST).outcome()).as(status.toString()).isEqualTo(Outcome.UNKNOWN);
		}
		next(requestTo(API + "/v1/payment_intents")).andRespond(withStatus(HttpStatus.OK).contentType(MediaType.TEXT_HTML).body("<html>"));
		assertThat(stripe.charge(REQUEST).outcome()).isEqualTo(Outcome.UNKNOWN);
	}

	@Test
	void lookingUpAnEarlierChargeFindsItByTheOrdersKey() {
		StripePaymentGateway stripe = gateway();
		next(requestTo(API + "/v1/payment_intents/search?query=metadata%5B%27idem%27%5D%3A%27order-7%27")).andExpect(method(HttpMethod.GET))
				.andExpect(header("Authorization", "Bearer sk_test_abc"))
				.andRespond(withSuccess("{\"data\":[{\"id\":\"pi_9\",\"status\":\"succeeded\"}]}", json()));
		assertThat(stripe.lookup("order-7")).isEqualTo(ChargeResult.succeeded("pi_9"));

		next(requestTo(API + "/v1/payment_intents/search?query=metadata%5B%27idem%27%5D%3A%27order-8%27"))
				.andRespond(withSuccess("{\"data\":[{\"id\":\"pi_10\",\"status\":\"requires_payment_method\",\"last_payment_error\":{\"code\":\"card_declined\"}}]}", json()));
		assertThat(stripe.lookup("order-8")).isEqualTo(ChargeResult.declined("card_declined"));

		next(requestTo(API + "/v1/payment_intents/search?query=metadata%5B%27idem%27%5D%3A%27order-9%27")).andRespond(withSuccess("{\"data\":[]}", json()));
		assertThat(stripe.lookup("order-9").outcome()).isEqualTo(Outcome.UNKNOWN);

		next(requestTo(API + "/v1/payment_intents/search?query=metadata%5B%27idem%27%5D%3A%27order-10%27")).andRespond(withStatus(HttpStatus.BAD_GATEWAY));
		assertThat(stripe.lookup("order-10").outcome()).isEqualTo(Outcome.UNKNOWN);

		next(requestTo(API + "/v1/payment_intents/search?query=metadata%5B%27idem%27%5D%3A%27order-11%27"))
				.andRespond(withSuccess("{\"data\":[{\"id\":\"pi_11\",\"status\":\"canceled\"}]}", json()));
		assertThat(stripe.lookup("order-11")).isEqualTo(ChargeResult.declined("card_declined"));
	}

	@Test
	void aRefundIsSentOncePerKeyAndSucceedsWhenStripeAcceptsIt() {
		StripePaymentGateway stripe = gateway();
		next(requestTo(API + "/v1/refunds")).andExpect(method(HttpMethod.POST)).andExpect(header("Idempotency-Key", "refund-order-7"))
				.andExpect(content().string(containsString("payment_intent=pi_1"))).andExpect(content().string(containsString("amount=20640")))
				.andRespond(withSuccess("{\"id\":\"re_1\",\"status\":\"succeeded\"}", json()));
		assertThat(stripe.refund("pi_1", 20640, "refund-order-7").succeeded()).isTrue();

		next(requestTo(API + "/v1/refunds")).andRespond(withSuccess("{\"status\":\"pending\"}", json()));
		assertThat(stripe.refund("pi_1", 20640, "k2").succeeded()).isTrue();

		next(requestTo(API + "/v1/refunds")).andRespond(withSuccess("{\"status\":\"failed\"}", json()));
		assertThat(stripe.refund("pi_1", 20640, "k3").succeeded()).isFalse();
	}

	@Test
	void anAlreadyRefundedChargeCountsAsRefundedAndOtherFailuresAreRetried() {
		StripePaymentGateway stripe = gateway();
		next(requestTo(API + "/v1/refunds")).andRespond(withStatus(HttpStatus.BAD_REQUEST).contentType(json())
				.body("{\"error\":{\"type\":\"invalid_request_error\",\"code\":\"charge_already_refunded\"}}"));
		assertThat(stripe.refund("pi_1", 20640, "k").succeeded()).isTrue();

		next(requestTo(API + "/v1/refunds")).andRespond(withStatus(HttpStatus.BAD_REQUEST).contentType(json())
				.body("{\"error\":{\"type\":\"invalid_request_error\",\"code\":\"resource_missing\"}}"));
		assertThat(stripe.refund("pi_x", 20640, "k").succeeded()).isFalse();

		next(requestTo(API + "/v1/refunds")).andRespond(withStatus(HttpStatus.BAD_GATEWAY));
		assertThat(stripe.refund("pi_1", 20640, "k").succeeded()).isFalse();
	}

	private final ApplicationContextRunner context = new ApplicationContextRunner().withUserConfiguration(StripePaymentGateway.class)
			.withInitializer(c -> c.getBeanFactory().setConversionService(ApplicationConversionService.getSharedInstance()))
			.withPropertyValues("ticketrush.payments.timeout=PT2S");

	@Test
	void isOnlyUsedWhenAKeyIsConfigured() {
		context.run(c -> assertThat(c).doesNotHaveBean(StripePaymentGateway.class));
		context.withPropertyValues("ticketrush.payments.stripe-secret-key=").run(c -> assertThat(c).doesNotHaveBean(StripePaymentGateway.class));
		context.withPropertyValues("ticketrush.payments.stripe-secret-key=sk_test_abc").run(c -> assertThat(c).hasSingleBean(StripePaymentGateway.class));
	}

	@Test
	void theAppDoesNotStartWithALiveKey() {
		context.withPropertyValues("ticketrush.payments.stripe-secret-key=sk_live_abc").run(c -> assertThat(c.getStartupFailure()).hasRootCauseMessage("Only Stripe test keys (sk_test_...) are accepted: this app is not ready to take live payments"));
	}

}
