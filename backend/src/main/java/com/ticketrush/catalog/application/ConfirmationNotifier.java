package com.ticketrush.catalog.application;

import com.ticketrush.catalog.domain.OrderPaidEvent;
import com.ticketrush.catalog.domain.SentEmail;
import com.ticketrush.catalog.domain.SentEmailRepository;
import com.ticketrush.catalog.domain.TicketOrder;
import com.ticketrush.catalog.domain.TicketOrderRepository;
import com.ticketrush.catalog.domain.TicketRepository;
import com.ticketrush.identity.domain.User;
import com.ticketrush.identity.domain.UserRepository;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.util.Locale;

/** Writes the confirmation message for a paid order, once, however many times the event arrives. */
@Component
class ConfirmationNotifier {

	private final TicketOrderRepository orders;
	private final TicketRepository tickets;
	private final UserRepository users;
	private final SentEmailRepository emails;
	private final Clock clock;

	ConfirmationNotifier(TicketOrderRepository orders, TicketRepository tickets, UserRepository users,
			SentEmailRepository emails, Clock clock) {
		this.orders = orders;
		this.tickets = tickets;
		this.users = users;
		this.emails = emails;
		this.clock = clock;
	}

	@EventListener
	void on(OrderPaidEvent event) {
		if (emails.existsByOrderIdAndKind(event.orderId(), SentEmail.CONFIRMATION)) {
			return;
		}
		TicketOrder order = orders.findById(event.orderId()).orElseThrow();
		User user = users.findById(event.userId()).orElseThrow();
		int count = tickets.findByOrderIdOrderById(order.getId()).size();
		String body = "Hi %s, your order %s is confirmed: %d ticket%s, %s in total. Your tickets are in your account."
				.formatted(user.getDisplayName(), order.getPublicRef(), count, count == 1 ? "" : "s",
						String.format(Locale.CANADA, "$%,.2f", order.getTotalCents() / 100.0));
		emails.save(new SentEmail(order.getId(), SentEmail.CONFIRMATION, user.getEmail(),
				"Your tickets, order " + order.getPublicRef(), body, clock.instant()));
	}

}
