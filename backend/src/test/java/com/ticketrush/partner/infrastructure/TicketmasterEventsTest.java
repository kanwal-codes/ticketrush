package com.ticketrush.partner.infrastructure;

import com.ticketrush.partner.domain.PartnerEvent;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class TicketmasterEventsTest {

	private static final String BODY = """
			{"_embedded":{"events":[{"id":"e1","name":"Habs vs Bruins","url":"https://tm.test/e1","unknownField":1,
			 "dates":{"start":{"dateTime":"2027-01-06T00:00:00Z"}},
			 "images":[{"url":"https://img.test/small.jpg","ratio":"16_9","width":200},
			           {"url":"https://img.test/mid.jpg","ratio":"16_9","width":640},
			           {"url":"https://img.test/big.jpg","ratio":"16_9","width":1024},
			           {"url":"https://img.test/tall.jpg","ratio":"3_2","width":900}],
			 "classifications":[{"segment":{"name":"Sports"}}],
			 "_embedded":{"venues":[{"name":"Bell Centre","city":{"name":"Montreal"}}]}},
			 {"id":"e2","name":"Bare","url":"https://tm.test/e2","dates":{"start":{"dateTime":"2027-02-01T20:00:00Z"}}},
			 {"id":"e3","name":"Date to be announced","url":"https://tm.test/e3"}]}}""";

	private final RestClient.Builder builder = RestClient.builder().baseUrl("https://tm.test");
	private final MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
	private final TicketmasterEvents events = new TicketmasterEvents(builder.build(), "k3y", "Montreal");

	@Test
	void mapsEventsToleratesMissingFieldsAndSkipsUndatedOnes() {
		server.expect(requestTo(containsString("apikey=k3y"))).andExpect(requestTo(containsString("city=Montreal")))
				.andExpect(requestTo(containsString("keyword=habs")))
				.andRespond(withSuccess(BODY, MediaType.APPLICATION_JSON));

		List<PartnerEvent> found = events.search(" ", "habs", 12);

		assertThat(found).hasSize(2);
		assertThat(found.get(0)).isEqualTo(new PartnerEvent("e1", "Ticketmaster", "Habs vs Bruins", Instant.parse("2027-01-06T00:00:00Z"),
				"Bell Centre", "Montreal", "Sports", "https://img.test/mid.jpg", "https://tm.test/e1"));
		assertThat(found.get(1)).extracting(PartnerEvent::venueName, PartnerEvent::city, PartnerEvent::category, PartnerEvent::imageUrl)
				.containsExactly("", "", "Event", "");
	}

	@Test
	void answersAreCachedAndFailuresShowNothing() {
		server.expect(requestTo(containsString("city=Toronto"))).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));

		assertThat(events.search("Toronto", null, 5)).isEmpty();
		assertThat(events.search("Toronto", null, 5)).isEmpty(); // second call must not reach the server again
		server.verify();
	}

}
