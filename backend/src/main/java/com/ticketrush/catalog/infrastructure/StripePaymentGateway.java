package com.ticketrush.catalog.infrastructure;

import com.ticketrush.catalog.domain.PaymentGateway;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Takes payments through Stripe, in test mode only: a key that is not a test key stops the app from starting, because
 * live money needs a review this app has not had (see the decision record). The browser gives us a PaymentMethod id
 * made by Stripe's own card form, so card numbers never reach this server.
 * <p>
 * A charge is a PaymentIntent confirmed at once, sent with the order's idempotency key as Stripe's {@code Idempotency-Key}
 * and written into its metadata, which is how {@link #lookup} finds it again later. A card that needs extra
 * authentication is cancelled and reported as declined, since this app has no way to complete one. Anything unclear
 * (a timeout, a server error, a request still in use) is UNKNOWN, which the order reconciler resolves.
 */
@Component
@Primary
@ConditionalOnExpression("!'${ticketrush.payments.stripe-secret-key:}'.isBlank()")
public class StripePaymentGateway implements PaymentGateway {

	private static final Logger log = LoggerFactory.getLogger(StripePaymentGateway.class);

	private final RestClient client;

	@Autowired
	StripePaymentGateway(@Value("${ticketrush.payments.stripe-secret-key}") String secretKey,
			@Value("${ticketrush.payments.timeout}") Duration timeout,
			@Value("${ticketrush.payments.stripe-api-url:https://api.stripe.com}") String url) {
		this(secretKey, RestClient.builder().baseUrl(url).requestFactory(factory(timeout)).build());
	}

	StripePaymentGateway(String secretKey, RestClient client) {
		String key = secretKey.strip();
		if (!key.startsWith("sk_test_") && !key.startsWith("rk_test_")) {
			throw new IllegalStateException("Only Stripe test keys (sk_test_...) are accepted: this app is not ready to take live payments");
		}
		this.client = client.mutate().defaultHeader("Authorization", "Bearer " + key).build();
	}

	private static JdkClientHttpRequestFactory factory(Duration timeout) {
		JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(timeout).build());
		factory.setReadTimeout(timeout);
		return factory;
	}

	@Override
	public ChargeResult charge(ChargeRequest request) {
		MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
		form.add("amount", String.valueOf(request.amountCents()));
		form.add("currency", request.currency().toLowerCase(Locale.ROOT));
		form.add("payment_method", request.paymentToken());
		form.add("confirm", "true");
		form.add("automatic_payment_methods[enabled]", "true");
		form.add("automatic_payment_methods[allow_redirects]", "never");
		form.add("description", request.description());
		form.add("metadata[idem]", request.idempotencyKey());
		try {
			Answer answer = post("/v1/payment_intents", form, request.idempotencyKey());
			if (answer.error() != null) {
				return fromError(answer);
			}
			return fromIntent(answer.body());
		}
		catch (RuntimeException e) {
			log.warn("Stripe charge {} has no answer: {}", request.idempotencyKey(), e.getMessage());
			return ChargeResult.unknown();
		}
	}

	@Override
	@SuppressWarnings("unchecked")
	public ChargeResult lookup(String idempotencyKey) {
		try {
			Map<String, Object> found = client.get()
					.uri("/v1/payment_intents/search?query={q}", "metadata['idem']:'" + idempotencyKey + "'")
					.retrieve().body(Map.class);
			List<Map<String, Object>> data = found == null ? List.of() : (List<Map<String, Object>>) found.get("data");
			if (data == null || data.isEmpty()) {
				return ChargeResult.unknown();
			}
			return fromIntent(data.get(0));
		}
		catch (RuntimeException e) {
			log.warn("Stripe lookup of {} failed: {}", idempotencyKey, e.getMessage());
			return ChargeResult.unknown();
		}
	}

	@Override
	public RefundResult refund(String paymentRef, long amountCents, String idempotencyKey) {
		MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
		form.add("payment_intent", paymentRef);
		form.add("amount", String.valueOf(amountCents));
		try {
			Answer answer = post("/v1/refunds", form, idempotencyKey);
			if (answer.error() != null) {
				return new RefundResult("charge_already_refunded".equals(answer.error().get("code")));
			}
			Object status = answer.body().get("status");
			return new RefundResult("succeeded".equals(status) || "pending".equals(status));
		}
		catch (RuntimeException e) {
			log.warn("Stripe refund {} has no answer: {}", idempotencyKey, e.getMessage());
			return new RefundResult(false);
		}
	}

	/** What Stripe answered: the object, or its {@code error} when it refused. Anything else throws. */
	private record Answer(Map<String, Object> body, Map<String, Object> error) {
	}

	@SuppressWarnings("unchecked")
	private Answer post(String path, MultiValueMap<String, String> form, String idempotencyKey) {
		return client.post().uri(path).contentType(MediaType.APPLICATION_FORM_URLENCODED)
				.header("Idempotency-Key", idempotencyKey).body(form)
				.exchange((request, response) -> {
					Map<String, Object> body = response.bodyTo(Map.class);
					int status = response.getStatusCode().value();
					if (status >= 200 && status < 300 && body != null) {
						return new Answer(body, null);
					}
					// 4xx with an error object is Stripe's answer (declined, bad input). The rest is no answer.
					if (status >= 400 && status < 500 && status != 409 && status != 429 && body != null && body.get("error") instanceof Map<?, ?> error) {
						return new Answer(body, (Map<String, Object>) error);
					}
					throw new IllegalStateException("Stripe answered " + status);
				});
	}

	private ChargeResult fromError(Answer answer) {
		Object code = answer.error().get("code");
		Object declineCode = answer.error().get("decline_code");
		if ("card_error".equals(answer.error().get("type"))) {
			return ChargeResult.declined(declineCode != null && "insufficient_funds".equals(declineCode) ? "insufficient_funds"
					: code != null ? code.toString() : "card_declined");
		}
		// Anything else is a request Stripe cannot act on: a payment method that does not exist, a malformed one.
		return ChargeResult.declined("invalid_payment_token");
	}

	@SuppressWarnings("unchecked")
	private ChargeResult fromIntent(Map<String, Object> intent) {
		Object status = intent.get("status");
		String id = String.valueOf(intent.get("id"));
		if ("succeeded".equals(status)) {
			return ChargeResult.succeeded(id);
		}
		if ("requires_action".equals(status)) {
			cancel(id);
			return ChargeResult.declined("authentication_required");
		}
		if ("canceled".equals(status) || "requires_payment_method".equals(status)) {
			Object last = intent.get("last_payment_error");
			Object code = last instanceof Map<?, ?> m ? ((Map<String, Object>) m).get("code") : null;
			return ChargeResult.declined(code != null ? code.toString() : "card_declined");
		}
		return ChargeResult.unknown();
	}

	private void cancel(String intentId) {
		try {
			client.post().uri("/v1/payment_intents/" + intentId + "/cancel").retrieve().toBodilessEntity();
		}
		catch (RuntimeException e) {
			log.warn("Could not cancel Stripe payment {}: {}", intentId, e.getMessage());
		}
	}

}
