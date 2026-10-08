package com.ticketrush.catalog.api;

import com.ticketrush.catalog.application.EventQueryService;
import com.ticketrush.catalog.application.EventQueryService.EventDetail;
import com.ticketrush.catalog.application.EventQueryService.EventSummary;
import com.ticketrush.catalog.application.EventQueryService.PageView;
import com.ticketrush.catalog.application.EventQueryService.SeatMap;
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
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

@RestController
@RequestMapping("/api/events")
class EventController {

	private static final String HEX = "^#[0-9A-Fa-f]{6}$";

	// Short on purpose: guests need fresh availability and sale state while a drop is running.
	private static final CacheControl PUBLIC_BRIEFLY = CacheControl.maxAge(Duration.ofSeconds(5)).cachePublic();

	private final EventService events;
	private final EventQueryService queries;

	EventController(EventService events, EventQueryService queries) {
		this.events = events;
		this.queries = queries;
	}

	@GetMapping
	ResponseEntity<PageView<EventSummary>> list(@RequestParam(required = false) String city,
			@RequestParam(required = false) String q, @RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "12") int size) {
		return ResponseEntity.ok().cacheControl(PUBLIC_BRIEFLY).body(queries.list(city, q, page, size));
	}

	@GetMapping("/{id}")
	ResponseEntity<EventDetail> detail(@PathVariable long id) {
		return ResponseEntity.ok().cacheControl(PUBLIC_BRIEFLY).body(queries.detail(id));
	}

	@GetMapping("/{id}/seats")
	ResponseEntity<SeatMap> seats(@PathVariable long id, @RequestParam(required = false) Long section) {
		return ResponseEntity.ok().cacheControl(PUBLIC_BRIEFLY).body(queries.seatMap(id, section));
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	EventRef create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateEventRequest r) {
		return events.create(organizerId(jwt), command(r));
	}

	/** Replaces a draft. Only drafts can be edited. */
	@PutMapping("/{id}")
	EventRef update(@AuthenticationPrincipal Jwt jwt, @PathVariable long id, @Valid @RequestBody CreateEventRequest r) {
		return events.update(organizerId(jwt), id, command(r));
	}

	private static NewEvent command(CreateEventRequest r) {
		return new NewEvent(r.title(), r.artist(), r.description(), r.venueId(), r.startsAt(), r.doorsAt(),
				r.dropOpensAt(), r.onSaleAt(),
				new Poster(r.poster().style(), r.poster().inkOne(), r.poster().inkTwo(), r.poster().paperColor()),
				r.prices().stream().map(p -> new PriceSpec(p.sectionId(), p.priceCents())).toList(),
				Boolean.TRUE.equals(r.waitingRoom()));
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
			@NotEmpty @Size(max = 20) List<@Valid PriceRequest> prices,
			/** Send guests through a waiting room before they can hold seats. Optional, off by default. */
			Boolean waitingRoom) {
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
