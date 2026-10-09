package com.ticketrush.catalog.application;

import com.ticketrush.catalog.application.OrderQueryService.OrderView;
import com.ticketrush.catalog.domain.EventRepository;
import com.ticketrush.catalog.domain.OrderStatus;
import com.ticketrush.catalog.domain.SentEmail;
import com.ticketrush.catalog.domain.SentEmailRepository;
import com.ticketrush.catalog.domain.TicketOrderRepository;
import com.ticketrush.catalog.domain.TicketRepository;
import com.ticketrush.identity.domain.EmailTokenRepository;
import com.ticketrush.identity.domain.Role;
import com.ticketrush.identity.domain.User;
import com.ticketrush.identity.domain.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * What a guest can ask of their own data: a copy of it, and closing the account. Closing keeps the order and ticket records
 * (the organizer's sales and the money have to add up) but removes everything that says who the guest was.
 */
@Service
public class AccountDataService {

	private static final Set<OrderStatus> UNSETTLED = Set.of(OrderStatus.PENDING_PAYMENT, OrderStatus.REFUNDING);

	private final UserRepository users;
	private final TicketOrderRepository orders;
	private final TicketRepository tickets;
	private final SentEmailRepository emails;
	private final EmailTokenRepository emailTokens;
	private final EventRepository events;
	private final OrderQueryService orderViews;
	private final PasswordEncoder encoder;
	private final Clock clock;

	public AccountDataService(UserRepository users, TicketOrderRepository orders, TicketRepository tickets,
			SentEmailRepository emails, EmailTokenRepository emailTokens, EventRepository events,
			OrderQueryService orderViews, PasswordEncoder encoder, Clock clock) {
		this.users = users;
		this.orders = orders;
		this.tickets = tickets;
		this.emails = emails;
		this.emailTokens = emailTokens;
		this.events = events;
		this.orderViews = orderViews;
		this.encoder = encoder;
		this.clock = clock;
	}

	public record Account(long id, String email, String displayName, String role, boolean emailVerified, Instant createdAt) {
	}

	public record ExportedOrder(String eventTitle, OrderView order) {
	}

	public record ExportedEmail(String subject, String kind, Instant sentAt) {
	}

	/** Everything the app keeps about the guest, in one document. */
	public record Export(Instant exportedAt, Account account, List<ExportedOrder> orders, List<ExportedEmail> emails) {
	}

	@Transactional(readOnly = true)
	public Export export(long userId) {
		User user = users.findById(userId).orElseThrow(() -> new NotFoundException("Account not found"));
		List<OrderView> views = orderViews.list(userId);
		Map<Long, String> titles = events.findAllById(views.stream().map(OrderView::eventId).distinct().toList()).stream()
				.collect(Collectors.toMap(e -> e.getId(), e -> e.getTitle(), (a, b) -> a));
		List<ExportedOrder> exportedOrders = views.stream()
				.map(o -> new ExportedOrder(titles.getOrDefault(o.eventId(), ""), o)).toList();
		List<ExportedEmail> sent = emails.findByOrderIdInOrderById(views.stream().map(OrderView::id).toList()).stream()
				.map(e -> new ExportedEmail(e.getSubject(), e.getKind(), e.getSentAt())).toList();
		return new Export(clock.instant(), new Account(user.getId(), user.getEmail(), user.getDisplayName(),
				user.getRole().name(), user.isEmailVerified(), user.getCreatedAt()), exportedOrders, sent);
	}

	/**
	 * Closes the account after checking the password. Refused while it would strand something: an organizer owns events,
	 * a guest may hold tickets for an event that has not happened, and a payment or refund may still be settling.
	 */
	@Transactional
	public void close(long userId, String password) {
		User user = users.findById(userId).filter(u -> !u.isDeleted()).orElseThrow(() -> new NotFoundException("Account not found"));
		if (!encoder.matches(password, user.getPasswordHash())) {
			throw new RuleViolationException("That password is not right.");
		}
		if (user.getRole() == Role.ORGANIZER) {
			throw new AccountNotClosableException("An organizer account owns events and sales records, so it cannot be closed here. Contact support to close it.");
		}
		Instant now = clock.instant();
		if (tickets.hasUpcoming(userId, now)) {
			throw new AccountNotClosableException("You still have tickets for an event that has not happened yet. Use them, or ask for a refund, then close the account.");
		}
		if (orders.existsByUserIdAndStatusIn(userId, UNSETTLED)) {
			throw new AccountNotClosableException("A payment or refund is still being settled. Try again in a few minutes.");
		}
		List<Long> orderIds = orders.findByUserIdOrderByIdDesc(userId).stream().map(o -> o.getId()).toList();
		if (!orderIds.isEmpty()) {
			emails.scrub(orderIds, now);
		}
		emailTokens.deleteByUserId(userId);
		user.anonymize(encoder.encode(UUID.randomUUID().toString()), now);
	}

}
