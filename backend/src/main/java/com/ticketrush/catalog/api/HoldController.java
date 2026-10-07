package com.ticketrush.catalog.api;

import com.ticketrush.catalog.application.HoldService;
import com.ticketrush.catalog.application.HoldService.HoldView;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Any signed-in guest (see SecurityConfig). */
@RestController
@RequestMapping("/api")
class HoldController {

	private final HoldService holds;

	HoldController(HoldService holds) {
		this.holds = holds;
	}

	@PostMapping("/events/{eventId}/holds")
	@ResponseStatus(HttpStatus.CREATED)
	HoldView hold(@AuthenticationPrincipal Jwt jwt, @PathVariable long eventId, @Valid @RequestBody HoldRequest r,
			@RequestHeader(value = "X-Admission-Token", required = false) String admissionToken) {
		return holds.hold(userId(jwt), eventId, r.seatIds(), admissionToken);
	}

	@GetMapping("/events/{eventId}/holds/me")
	HoldView mine(@AuthenticationPrincipal Jwt jwt, @PathVariable long eventId) {
		return holds.current(userId(jwt), eventId);
	}

	@DeleteMapping("/holds/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void release(@AuthenticationPrincipal Jwt jwt, @PathVariable long id) {
		holds.release(userId(jwt), id);
	}

	private static long userId(Jwt jwt) {
		return Long.parseLong(jwt.getSubject());
	}

	record HoldRequest(@NotEmpty @Size(max = 50) List<@NotNull Long> seatIds) {
	}

}
