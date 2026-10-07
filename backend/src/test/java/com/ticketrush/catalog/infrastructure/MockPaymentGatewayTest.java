package com.ticketrush.catalog.infrastructure;

import com.ticketrush.catalog.domain.PaymentGateway.ChargeRequest;
import com.ticketrush.catalog.domain.PaymentGateway.ChargeResult;
import com.ticketrush.catalog.domain.PaymentGateway.Outcome;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;

class MockPaymentGatewayTest {

	private final MockPaymentGateway gateway = new MockPaymentGateway(Duration.ofMillis(300), Duration.ofMillis(700));

	private static ChargeRequest charge(String key, String token) {
		return new ChargeRequest(key, 20_640, "CAD", token, "test");
	}

	@Test
	void theSameKeyChargesOnceAndAnswersTheSameWay() {
		ChargeResult first = gateway.charge(charge("order-1", "tok_visa"));
		ChargeResult again = gateway.charge(charge("order-1", "tok_visa"));

		assertThat(first.outcome()).isEqualTo(Outcome.SUCCEEDED);
		assertThat(again).isEqualTo(first);
		assertThat(gateway.successfulCharges()).containsOnlyKeys("order-1").containsEntry("order-1", 20_640L);
	}

	@Test
	void differentKeysAreDifferentCharges() {
		gateway.charge(charge("order-1", "tok_visa"));
		gateway.charge(charge("order-2", "tok_visa"));
		assertThat(gateway.successfulCharges()).hasSize(2);
	}

	@Test
	void declinesGiveAReasonAndMoveNoMoney() {
		assertThat(gateway.charge(charge("a", "tok_declined")).declineReason()).isEqualTo("card_declined");
		assertThat(gateway.charge(charge("b", "tok_insufficient_funds")).declineReason())
				.isEqualTo("insufficient_funds");
		assertThat(gateway.charge(charge("c", "tok_made_up")).declineReason()).isEqualTo("invalid_payment_token");
		assertThat(gateway.successfulCharges()).isEmpty();
	}

	@Test
	void aProviderOutageIsUnknownAndLeavesNoRecord() {
		assertThat(gateway.charge(charge("order-1", "tok_error")).outcome()).isEqualTo(Outcome.UNKNOWN);
		assertThat(gateway.lookup("order-1").outcome()).isEqualTo(Outcome.UNKNOWN);
		assertThat(gateway.successfulCharges()).isEmpty();
		// The same key can still be paid for later, once the provider is back.
		assertThat(gateway.charge(charge("order-1", "tok_visa")).outcome()).isEqualTo(Outcome.SUCCEEDED);
	}

	@Test
	void aSlowChargeLooksUnknownToACallerWhoGivesUpButStillHappens() throws Exception {
		ChargeResult seen = gateway.charge(charge("order-1", "tok_slow"));
		assertThat(seen.outcome()).isEqualTo(Outcome.UNKNOWN);
		assertThat(gateway.lookup("order-1").outcome()).isEqualTo(Outcome.UNKNOWN);

		Thread.sleep(800);

		ChargeResult later = gateway.lookup("order-1");
		assertThat(later.outcome()).isEqualTo(Outcome.SUCCEEDED);
		assertThat(gateway.successfulCharges()).containsOnlyKeys("order-1");
		// A retry with the same key gets the original result, not a second charge.
		assertThat(gateway.charge(charge("order-1", "tok_slow"))).isEqualTo(later);
		assertThat(gateway.successfulCharges()).hasSize(1);
	}

	@Test
	void twentyThreadsUsingOneKeyCauseOneChargeAndShareOneResult() throws Exception {
		List<Callable<ChargeResult>> tasks = new ArrayList<>();
		for (int i = 0; i < 20; i++) {
			tasks.add(() -> gateway.charge(charge("order-1", "tok_visa")));
		}
		Set<String> refs = new HashSet<>();
		try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
			for (Future<ChargeResult> f : pool.invokeAll(tasks)) {
				refs.add(f.get().paymentRef());
			}
		}
		assertThat(refs).hasSize(1);
		assertThat(gateway.successfulCharges()).hasSize(1);
	}

	@Test
	void refundsAreIdempotentAndCanBeMadeToFail() {
		gateway.failNextRefunds(1);
		assertThat(gateway.refund("ch_1", 20_640, "refund-order-1").succeeded()).isFalse();
		assertThat(gateway.refundedKeys()).isEmpty();

		assertThat(gateway.refund("ch_1", 20_640, "refund-order-1").succeeded()).isTrue();
		assertThat(gateway.refund("ch_1", 20_640, "refund-order-1").succeeded()).isTrue();
		assertThat(gateway.refundedKeys()).containsExactly("refund-order-1");
	}

	@Test
	void chargesCanBeMadeToFailForAWhile() {
		gateway.failNextCharges(2);
		assertThat(gateway.charge(charge("order-1", "tok_visa")).outcome()).isEqualTo(Outcome.UNKNOWN);
		assertThat(gateway.charge(charge("order-1", "tok_visa")).outcome()).isEqualTo(Outcome.UNKNOWN);
		assertThat(gateway.charge(charge("order-1", "tok_visa")).outcome()).isEqualTo(Outcome.SUCCEEDED);
	}

	@Test
	void aHookRunsInTheMiddleOfASuccessfulCharge() {
		boolean[] ran = { false };
		gateway.onCharge(() -> ran[0] = true);
		gateway.charge(charge("order-1", "tok_visa"));
		assertThat(ran[0]).isTrue();
	}

}
