package com.ticketrush.catalog.api;

import com.ticketrush.catalog.application.OrganizerService;
import com.ticketrush.catalog.application.OrganizerService.SalesSummary;
import com.ticketrush.catalog.application.VenueService;
import com.ticketrush.catalog.application.VenueService.VenueView;
import com.ticketrush.catalog.domain.OrganizerStore.EventRow;
import com.ticketrush.catalog.domain.OrganizerStore.ScanRow;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * What an organizer reads about their own work. These live under /api/organizer, not /api/events, because every GET
 * under /api/events is public (see SecurityConfig); here every route needs the organizer role.
 */
@RestController
@RequestMapping("/api/organizer")
class OrganizerController {

	private final OrganizerService organizer;
	private final VenueService venues;

	OrganizerController(OrganizerService organizer, VenueService venues) {
		this.organizer = organizer;
		this.venues = venues;
	}

	@GetMapping("/events")
	List<EventRow> events(@AuthenticationPrincipal Jwt jwt) {
		return organizer.events(id(jwt));
	}

	@GetMapping("/events/{id}/summary")
	SalesSummary summary(@AuthenticationPrincipal Jwt jwt, @PathVariable long id) {
		return organizer.summary(id(jwt), id);
	}

	@GetMapping("/events/{id}/scans")
	List<ScanRow> scans(@AuthenticationPrincipal Jwt jwt, @PathVariable long id,
			@RequestParam(defaultValue = "20") int limit) {
		return organizer.scans(id(jwt), id, limit);
	}

	@GetMapping("/venues")
	List<VenueView> venues(@AuthenticationPrincipal Jwt jwt) {
		return venues.ownedBy(id(jwt));
	}

	private static long id(Jwt jwt) {
		return Long.parseLong(jwt.getSubject());
	}

}
