package com.ticketrush.catalog.api;

import com.ticketrush.catalog.application.TicketService;
import com.ticketrush.catalog.application.TicketService.MyTicket;
import com.ticketrush.catalog.application.TicketService.ScanResult;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Guests read their own tickets; organizers scan them (see SecurityConfig). */
@RestController
@RequestMapping("/api/tickets")
class TicketController {

	private final TicketService tickets;

	TicketController(TicketService tickets) {
		this.tickets = tickets;
	}

	@GetMapping
	List<MyTicket> mine(@AuthenticationPrincipal Jwt jwt) {
		return tickets.mine(Long.parseLong(jwt.getSubject()));
	}

	@GetMapping(value = "/{id}/qr.svg", produces = "image/svg+xml")
	ResponseEntity<String> qr(@AuthenticationPrincipal Jwt jwt, @PathVariable long id) {
		// The code is a secret that gets a person in, so no shared cache should keep the picture.
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
				.body(tickets.qrSvg(Long.parseLong(jwt.getSubject()), id));
	}

	/** Always 200 with the outcome in the body, so a scanning app has one shape to read. */
	@PostMapping("/scan")
	ScanResult scan(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ScanRequest request) {
		return tickets.scan(Long.parseLong(jwt.getSubject()), request.code(), request.eventId());
	}

	record ScanRequest(@NotBlank @Size(max = 64) String code, Long eventId) {
	}

}
