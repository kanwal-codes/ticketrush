package com.ticketrush.partner.infrastructure;

import com.ticketrush.partner.domain.PartnerEvents;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

/** Ticketmaster events when a key is set; otherwise none, so development and tests need no account. */
@Configuration
class PartnerConfig {

	@Bean
	PartnerEvents partnerEvents(@Value("${ticketrush.ticketmaster.api-key:}") String apiKey,
			@Value("${ticketrush.ticketmaster.default-city:Montreal}") String defaultCity,
			@Value("${ticketrush.ticketmaster.api-url:https://app.ticketmaster.com/discovery/v2}") String url) {
		return apiKey.isBlank() ? (city, q, size) -> List.of() : new TicketmasterEvents(apiKey.strip(), defaultCity, url);
	}

}
