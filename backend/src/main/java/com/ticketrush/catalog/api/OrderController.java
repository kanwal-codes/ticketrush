package com.ticketrush.catalog.api;

import com.ticketrush.catalog.application.OrderQueryService;
import com.ticketrush.catalog.application.OrderQueryService.OrderView;
import com.ticketrush.catalog.application.OrderService;
import com.ticketrush.catalog.application.OrderService.Checkout;
import com.ticketrush.catalog.application.RuleViolationException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.regex.Pattern;

/** Any signed-in guest (see SecurityConfig). */
@RestController
@RequestMapping("/api/orders")
class OrderController {

	private static final Pattern KEY = Pattern.compile("[A-Za-z0-9._:-]{8,64}");

	private final OrderService orders;
	private final OrderQueryService queries;

	OrderController(OrderService orders, OrderQueryService queries) {
		this.orders = orders;
		this.queries = queries;
	}

	/**
	 * 201 paid, 202 payment outcome not known yet, 402 declined, 409 the seats were lost and the money returned.
	 * Repeating a request with the same Idempotency-Key answers with the order's current state (200 when paid).
	 */
	@PostMapping
	ResponseEntity<OrderView> pay(@AuthenticationPrincipal Jwt jwt,
			@RequestHeader("Idempotency-Key") String idempotencyKey, @Valid @RequestBody PayRequest request) {
		if (!KEY.matcher(idempotencyKey).matches()) {
			throw new RuleViolationException("Idempotency-Key must be 8 to 64 letters, digits or . _ : -");
		}
		Checkout checkout = orders.checkout(Long.parseLong(jwt.getSubject()), idempotencyKey, request.holdId(),
				request.paymentToken());
		ResponseEntity.BodyBuilder response = ResponseEntity.status(statusFor(checkout));
		if (checkout.replay()) {
			response.header("Idempotent-Replay", "true");
		}
		return response.body(checkout.order());
	}

	@GetMapping("/{id}")
	OrderView get(@AuthenticationPrincipal Jwt jwt, @PathVariable long id) {
		return queries.get(Long.parseLong(jwt.getSubject()), id);
	}

	@GetMapping
	List<OrderView> mine(@AuthenticationPrincipal Jwt jwt) {
		return queries.list(Long.parseLong(jwt.getSubject()));
	}

	private static HttpStatus statusFor(Checkout checkout) {
		return switch (checkout.order().status()) {
			case PAID -> checkout.replay() ? HttpStatus.OK : HttpStatus.CREATED;
			case PENDING_PAYMENT -> HttpStatus.ACCEPTED;
			case FAILED -> HttpStatus.PAYMENT_REQUIRED;
			case REFUNDING, REFUNDED -> HttpStatus.CONFLICT;
		};
	}

	record PayRequest(@NotNull Long holdId, @NotBlank @Size(max = 100) String paymentToken) {
	}

}
