package com.ticketrush.catalog.api;

import com.ticketrush.catalog.application.EventService;
import com.ticketrush.catalog.application.EventService.EventRef;
import com.ticketrush.catalog.application.EventService.NewEvent;
import com.ticketrush.catalog.application.EventService.Poster;
import com.ticketrush.catalog.application.EventService.PriceSpec;
import com.ticketrush.catalog.domain.PosterStyle;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;

@RestController
@RequestMapping("/api/events")
class EventController {

	private static final String HEX = "^#[0-9A-Fa-f]{6}$";

	private final EventService events;

	EventController(EventService events) {
		this.events = events;
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	EventRef create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateEventRequest r) {
		NewEvent cmd = new NewEvent(r.title(), r.artist(), r.description(), r.venueId(), r.startsAt(), r.doorsAt(),
				r.dropOpensAt(), r.onSaleAt(),
				new Poster(r.poster().style(), r.poster().inkOne(), r.poster().inkTwo(), r.poster().paperColor()),
				r.prices().stream().map(p -> new PriceSpec(p.sectionId(), p.priceCents())).toList());
		return events.create(organizerId(jwt), cmd);
	}

	@PostMapping("/{id}/publish")
	EventRef publish(@AuthenticationPrincipal Jwt jwt, @PathVariable long id) {
		return events.publish(organizerId(jwt), id);
	}

	@PostMapping("/{id}/cancel")
	EventRef cancel(@AuthenticationPrincipal Jwt jwt, @PathVariable long id) {
		return events.cancel(organizerId(jwt), id);
	}

	private static long organizerId(Jwt jwt) {
		return Long.parseLong(jwt.getSubject());
	}

	record CreateEventRequest(
			@NotBlank @Size(max = 160) String title,
			@NotBlank @Size(max = 120) String artist,
			@Size(max = 4000) String description,
			@NotNull Long venueId,
			@NotNull Instant startsAt,
			@NotNull Instant doorsAt,
			@NotNull Instant dropOpensAt,
			@NotNull Instant onSaleAt,
			@NotNull @Valid PosterRequest poster,
			@NotEmpty @Size(max = 20) List<@Valid PriceRequest> prices) {
	}

	record PosterRequest(
			@NotNull PosterStyle style,
			@NotNull @Pattern(regexp = HEX) String inkOne,
			@NotNull @Pattern(regexp = HEX) String inkTwo,
			@NotNull @Pattern(regexp = HEX) String paperColor) {
	}

	record PriceRequest(@NotNull Long sectionId, @Min(1) @Max(5_000_000) int priceCents) {
	}

}
