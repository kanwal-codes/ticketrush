package com.ticketrush.partner.api;

import com.ticketrush.partner.domain.PartnerEvent;
import com.ticketrush.partner.domain.PartnerEvents;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.List;

/** Events from other ticket sellers, for the "also on" section of the home page. Public, read-only. */
@RestController
@RequestMapping("/api/partner-events")
@Validated
class PartnerEventController {

	private final PartnerEvents partner;

	PartnerEventController(PartnerEvents partner) {
		this.partner = partner;
	}

	@GetMapping
	ResponseEntity<List<PartnerEvent>> list(@RequestParam(required = false) String city, @RequestParam(required = false) String q,
			@RequestParam(defaultValue = "12") @Min(1) @Max(24) int size) {
		return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic())
				.body(partner.search(city, q, size));
	}

}
