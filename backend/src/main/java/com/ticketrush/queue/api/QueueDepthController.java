package com.ticketrush.queue.api;

import com.ticketrush.queue.application.QueueService;
import com.ticketrush.queue.domain.WaitingLine.Depth;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** The organizer's view of the line for their own event (see SecurityConfig: organizers only). */
@RestController
@RequestMapping("/api/organizer/events/{eventId}/queue")
class QueueDepthController {

	private final QueueService queue;

	QueueDepthController(QueueService queue) {
		this.queue = queue;
	}

	@GetMapping
	Depth depth(@AuthenticationPrincipal Jwt jwt, @PathVariable long eventId) {
		return queue.depth(Long.parseLong(jwt.getSubject()), eventId);
	}

}
