package com.ticketrush.catalog.api;

import com.ticketrush.catalog.application.VenueService;
import com.ticketrush.catalog.application.VenueService.SectionSpec;
import com.ticketrush.catalog.application.VenueService.VenueView;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Organizer-only (see SecurityConfig). */
@RestController
@RequestMapping("/api/venues")
class VenueController {

	private final VenueService venues;

	VenueController(VenueService venues) {
		this.venues = venues;
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	VenueView create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateVenueRequest request) {
		List<SectionSpec> specs = request.sections().stream()
				.map(s -> new SectionSpec(s.name(), s.rows(), s.seatsPerRow())).toList();
		return venues.create(Long.parseLong(jwt.getSubject()), request.name(), request.city(), specs);
	}

	@GetMapping("/{id}")
	VenueView get(@PathVariable long id) {
		return venues.get(id);
	}

	record CreateVenueRequest(
			@NotBlank @Size(max = 120) String name,
			@NotBlank @Size(max = 80) String city,
			@NotEmpty @Size(max = 20) List<@Valid SectionRequest> sections) {
	}

	record SectionRequest(
			@NotBlank @Size(max = 60) String name,
			@Min(1) @Max(200) int rows,
			@Min(1) @Max(200) int seatsPerRow) {
	}

}
