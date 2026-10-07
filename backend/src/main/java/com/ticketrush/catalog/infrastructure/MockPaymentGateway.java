package com.ticketrush.catalog.infrastructure;

import com.ticketrush.catalog.domain.PaymentGateway;
import com.ticketrush.catalog.domain.TicketCodes;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * A stand-in for a card processor, behaving like a real one where it matters: a repeated idempotency key never
 * charges twice, and a slow charge keeps going after the caller gives up. Payment tokens pick the behaviour:
 * <ul>
 * <li>{@code tok_visa}: succeeds</li>
 * <li>{@code tok_declined}, {@code tok_insufficient_funds}: declined</li>
 * <li>{@code tok_error}: the provider is down, outcome unknown, nothing recorded</li>
 * <li>{@code tok_slow}: succeeds after a delay, so a short timeout sees "unknown" while the charge still happens</li>
 * </ul>
 * Public, with counters, so tests can check how many charges and refunds really happened.
 */
@Component
public class MockPaymentGateway implements PaymentGateway {

	private static final Executor ASYNC = Executors.newVirtualThreadPerTaskExecutor();

	private final Duration timeout;
	private final Duration slowDelay;
	private final Map<String, CompletableFuture<ChargeResult>> charges = new ConcurrentHashMap<>();
	private final Map<String, Long> successfulCharges = new ConcurrentHashMap<>();
	private final Set<String> refundedKeys = ConcurrentHashMap.newKeySet();
	private final AtomicInteger chargeFailures = new AtomicInteger();
	private final AtomicInteger refundFailures = new AtomicInteger();
	private volatile Runnable duringCharge;

	public MockPaymentGateway(@Value("${ticketrush.payments.timeout}") Duration timeout,
			@Value("${ticketrush.payments.mock-slow-delay}") Duration slowDelay) {
		this.timeout = timeout;
		this.slowDelay = slowDelay;
	}

	@Override
	public ChargeResult charge(ChargeRequest request) {
		if (chargeFailures.getAndUpdate(n -> Math.max(0, n - 1)) > 0 || "tok_error".equals(request.paymentToken())) {
			return ChargeResult.unknown();
		}
		// One future per key: a repeat, even a simultaneous one, waits for and shares the first attempt's result.
		CompletableFuture<ChargeResult> attempt = charges.computeIfAbsent(request.idempotencyKey(),
				key -> CompletableFuture.supplyAsync(() -> process(request), ASYNC));
		try {
			return attempt.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
		}
		catch (TimeoutException | ExecutionException e) {
			return ChargeResult.unknown();
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			return ChargeResult.unknown();
		}
	}

	@Override
	public ChargeResult lookup(String idempotencyKey) {
		CompletableFuture<ChargeResult> attempt = charges.get(idempotencyKey);
		if (attempt == null || !attempt.isDone() || attempt.isCompletedExceptionally()) {
			return ChargeResult.unknown();
		}
		return attempt.join();
	}

	@Override
	public RefundResult refund(String paymentRef, long amountCents, String idempotencyKey) {
		if (refundFailures.getAndUpdate(n -> Math.max(0, n - 1)) > 0) {
			return new RefundResult(false);
		}
		refundedKeys.add(idempotencyKey);
		return new RefundResult(true);
	}

	private ChargeResult process(ChargeRequest request) {
		switch (request.paymentToken()) {
			case "tok_visa":
				return succeed(request);
			case "tok_slow":
				sleep(slowDelay);
				return succeed(request);
			case "tok_declined":
				return ChargeResult.declined("card_declined");
			case "tok_insufficient_funds":
				return ChargeResult.declined("insufficient_funds");
			default:
				return ChargeResult.declined("invalid_payment_token");
		}
	}

	private ChargeResult succeed(ChargeRequest request) {
		Runnable hook = duringCharge;
		if (hook != null) {
			hook.run();
		}
		successfulCharges.put(request.idempotencyKey(), request.amountCents());
		return ChargeResult.succeeded("ch_" + TicketCodes.ticketCode());
	}

	private static void sleep(Duration duration) {
		try {
			Thread.sleep(duration);
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
		}
	}

	/** Charges that really happened: idempotency key to amount in cents. */
	public Map<String, Long> successfulCharges() {
		return new HashMap<>(successfulCharges);
	}

	/** Idempotency keys that have been refunded. */
	public Set<String> refundedKeys() {
		return Set.copyOf(refundedKeys);
	}

	/** The next n charge calls report an unknown outcome and record nothing, as if the provider were down. */
	public void failNextCharges(int n) {
		chargeFailures.set(n);
	}

	/** The next n refund calls fail. */
	public void failNextRefunds(int n) {
		refundFailures.set(n);
	}

	/** Runs in the middle of every successful charge. Lets a test make time pass while money is in flight. */
	public void onCharge(Runnable hook) {
		this.duringCharge = hook;
	}

	public void clearHooks() {
		this.duringCharge = null;
		this.chargeFailures.set(0);
		this.refundFailures.set(0);
	}

}
