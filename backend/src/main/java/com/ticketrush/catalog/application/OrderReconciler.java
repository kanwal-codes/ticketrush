package com.ticketrush.catalog.application;

import com.ticketrush.catalog.domain.OrderStatus;
import com.ticketrush.catalog.domain.PaymentGateway;
import com.ticketrush.catalog.domain.PaymentGateway.ChargeResult;
import com.ticketrush.catalog.domain.PaymentGateway.Outcome;
import com.ticketrush.catalog.domain.TicketOrder;
import com.ticketrush.catalog.domain.TicketOrderRepository;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

/**
 * Finishes what a request could not. Pending orders are looked up at the provider and settled once it has an
 * answer; a provider with no record yet is left alone, because failing an order whose charge is still in flight
 * would take money without giving tickets. Orders stuck in REFUNDING get their refund retried.
 */
@Service
public class OrderReconciler {

	private final TicketOrderRepository orders;
	private final OrderService service;
	private final PaymentGateway gateway;
	private final Clock clock;
	private final Duration after;
	private final MeterRegistry meters;

	public OrderReconciler(TicketOrderRepository orders, OrderService service, PaymentGateway gateway, Clock clock,
			@Value("${ticketrush.payments.reconcile-after}") Duration after, MeterRegistry meters) {
		this.orders = orders;
		this.service = service;
		this.gateway = gateway;
		this.clock = clock;
		this.after = after;
		this.meters = meters;
	}

	/** Returns how many orders were moved forward. */
	public int reconcile() {
		Instant now = clock.instant();
		int moved = 0;
		for (TicketOrder order : orders.findByStatusAndCreatedAtBefore(OrderStatus.PENDING_PAYMENT, now.minus(after))) {
			ChargeResult result = gateway.lookup(order.providerKey());
			if (result.outcome() != Outcome.UNKNOWN) {
				service.applyResult(order.getId(), result);
				moved++;
			}
		}
		for (TicketOrder order : orders.findByStatusAndCreatedAtBefore(OrderStatus.REFUNDING, now)) {
			service.completeRefund(order.getId());
			moved++;
		}
		meters.counter("ticketrush.reconciler.moved").increment(moved);
		return moved;
	}

}
