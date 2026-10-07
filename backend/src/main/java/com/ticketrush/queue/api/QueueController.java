package com.ticketrush.queue.api;

import com.ticketrush.queue.application.QueueService;
import com.ticketrush.queue.application.QueueService.QueueView;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Any signed-in guest (see SecurityConfig). */
@RestController
@RequestMapping("/api/events/{eventId}/queue")
class QueueController {

	private final QueueService queue;

	QueueController(QueueService queue) {
		this.queue = queue;
	}

	@PostMapping
	QueueView join(@AuthenticationPrincipal Jwt jwt, @PathVariable long eventId) {
		return queue.join(userId(jwt), eventId);
	}

	@GetMapping
	QueueView status(@AuthenticationPrincipal Jwt jwt, @PathVariable long eventId) {
		return queue.status(userId(jwt), eventId);
	}

	@DeleteMapping
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void leave(@AuthenticationPrincipal Jwt jwt, @PathVariable long eventId) {
		queue.leave(userId(jwt), eventId);
	}

	static long userId(Jwt jwt) {
		return Long.parseLong(jwt.getSubject());
	}

}
