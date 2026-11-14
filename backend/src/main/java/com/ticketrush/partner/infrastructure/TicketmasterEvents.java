package com.ticketrush.partner.infrastructure;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.ticketrush.partner.domain.PartnerEvent;
import com.ticketrush.partner.domain.PartnerEvents;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;

/**
 * Ticketmaster's Discovery API. Answers are kept for a while: the same few searches come from every visitor, and
 * the free key is limited to 5,000 calls a day. A failure is logged and shown as "no events", never as an error.
 */
class TicketmasterEvents implements PartnerEvents {

	private static final Logger log = LoggerFactory.getLogger(TicketmasterEvents.class);
	private static final Duration TIMEOUT = Duration.ofSeconds(4);

	private final RestClient client;
	private final String apiKey;
	private final String defaultCity;
	private final Cache<String, List<PartnerEvent>> cache = Caffeine.newBuilder().expireAfterWrite(Duration.ofMinutes(10))
			.maximumSize(500).build();

	TicketmasterEvents(String apiKey, String defaultCity, String url) {
		this(client(url), apiKey, defaultCity);
	}

	private static RestClient client(String url) {
		JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(TIMEOUT).build());
		factory.setReadTimeout(TIMEOUT);
		return RestClient.builder().baseUrl(url).requestFactory(factory).build();
	}

	TicketmasterEvents(RestClient client, String apiKey, String defaultCity) {
		this.client = client;
		this.apiKey = apiKey;
		this.defaultCity = defaultCity;
	}

	@Override
	public List<PartnerEvent> search(String city, String q, int size) {
		String where = city == null || city.isBlank() ? defaultCity : city.strip();
		String what = q == null ? "" : q.strip();
		return cache.get(where + "|" + what + "|" + size, key -> fetch(where, what, size));
	}

	private List<PartnerEvent> fetch(String city, String q, int size) {
		try {
			Response response = client.get().uri(b -> {
				b.path("/events.json").queryParam("apikey", apiKey).queryParam("city", city).queryParam("size", size)
						.queryParam("sort", "date,asc");
				if (!q.isEmpty()) {
					b.queryParam("keyword", q);
				}
				return b.build();
			}).retrieve().body(Response.class);
			if (response == null || response.embedded() == null || response.embedded().events() == null) {
				return List.of();
			}
			return response.embedded().events().stream().filter(e -> e.name() != null && e.url() != null && when(e) != null)
					.map(TicketmasterEvents::map).toList();
		}
		catch (RuntimeException e) {
			// The message can contain the request URL, which carries the key, so only the type is logged.
			log.warn("Ticketmaster search failed: {}", e.getClass().getSimpleName());
			return List.of();
		}
	}

	/** Events whose date is still to be announced have none, and are left out. */
	private static Instant when(Event e) {
		return e.dates() == null || e.dates().start() == null || e.dates().start().dateTime() == null ? null
				: Instant.parse(e.dates().start().dateTime());
	}

	static PartnerEvent map(Event e) {
		Venue venue = e.embedded() == null || e.embedded().venues() == null || e.embedded().venues().isEmpty() ? null
				: e.embedded().venues().get(0);
		String category = e.classifications() == null || e.classifications().isEmpty()
				|| e.classifications().get(0).segment() == null || e.classifications().get(0).segment().name() == null ? "Event"
				: e.classifications().get(0).segment().name();
		String image = e.images() == null ? "" : e.images().stream().filter(i -> "16_9".equals(i.ratio()) && i.width() >= 640)
				.min(Comparator.comparingInt(Image::width)).map(Image::url).orElse("");
		return new PartnerEvent(e.id(), "Ticketmaster", e.name(), when(e), venue == null || venue.name() == null ? "" : venue.name(),
				venue == null || venue.city() == null || venue.city().name() == null ? "" : venue.city().name(), category, image, e.url());
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record Response(@com.fasterxml.jackson.annotation.JsonProperty("_embedded") Events embedded) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record Events(List<Event> events) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record Event(String id, String name, String url, Dates dates, List<Image> images, List<Classification> classifications,
			@com.fasterxml.jackson.annotation.JsonProperty("_embedded") EventLinks embedded) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record Dates(Start start) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record Start(String dateTime) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record Image(String url, String ratio, int width) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record Classification(Segment segment) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record Segment(String name) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record EventLinks(List<Venue> venues) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record Venue(String name, City city) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record City(String name) {
	}

}
