package com.ticketrush.queue;

import com.jayway.jsonpath.JsonPath;
import com.ticketrush.queue.application.QueueService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.TestPropertySource;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A real HTTP client against a real port, because streaming cannot be checked through MockMvc. This class pushes
 * every 200 ms, so it gets its own Spring context.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = "ticketrush.queue.push-interval=PT0.2S")
class QueueStreamIntegrationTest extends QueueTestSupport {

	@LocalServerPort
	private int port;

	@Autowired
	private QueueService queue;

	/** Opens a stream in the background and hands back each "status" event's JSON as it arrives. */
	private BlockingQueue<String> openStream(Guest guest, int eventId) throws Exception {
		BlockingQueue<String> events = new LinkedBlockingQueue<>();
		HttpRequest request = HttpRequest.newBuilder(
				URI.create("http://localhost:" + port + "/api/events/" + eventId + "/queue/stream"))
				.header("Authorization", bearer(guest.token())).header("Accept", "text/event-stream").GET().build();
		HttpResponse<java.util.stream.Stream<String>> response = HttpClient.newHttpClient().send(request,
				HttpResponse.BodyHandlers.ofLines());
		assertThat(response.statusCode()).isEqualTo(200);
		assertThat(response.headers().firstValue("Content-Type").orElse("")).startsWith("text/event-stream");
		Thread.ofVirtual().start(() -> response.body().forEach(line -> {
			if (line.startsWith("data:")) {
				events.add(line.substring(5).trim());
			}
		}));
		return events;
	}

	private String next(BlockingQueue<String> events) throws Exception {
		String event = events.poll(10, TimeUnit.SECONDS);
		assertThat(event).as("an event within 10 seconds").isNotNull();
		return event;
	}

	@Test
	void theStreamSendsYourPlaceAtOnceAndKeepsItCurrent() throws Exception {
		int eventId = onSaleQueueEvent();
		List<Guest> guests = createGuests(3);
		for (Guest guest : guests) {
			join(guest, eventId).andExpect(status().isOk());
		}

		BlockingQueue<String> events = openStream(guests.get(2), eventId);
		String first = next(events);
		assertThat(JsonPath.<String>read(first, "$.state")).isEqualTo("WAITING");
		assertThat(JsonPath.<Integer>read(first, "$.position")).isEqualTo(3);

		// A guest ahead leaves. The next pushed update shows the new place without the client asking.
		leave(guests.get(0), eventId).andExpect(status().isNoContent());
		String update;
		do {
			update = next(events);
		}
		while (JsonPath.<Integer>read(update, "$.position") != 2);
		assertThat(JsonPath.<Integer>read(update, "$.queueLength")).isEqualTo(2);
	}

	@Test
	void whenYouAreLetInTheStreamDeliversYourTokenAndEnds() throws Exception {
		int eventId = onSaleQueueEvent();
		Guest guest = createGuests(1).get(0);
		join(guest, eventId).andExpect(status().isOk());
		BlockingQueue<String> events = openStream(guest, eventId);
		assertThat(JsonPath.<String>read(next(events), "$.state")).isEqualTo("WAITING");

		queue.admitDue();

		String admitted;
		do {
			admitted = next(events);
		}
		while (!"ADMITTED".equals(JsonPath.<String>read(admitted, "$.state")));
		assertThat(JsonPath.<String>read(admitted, "$.admissionToken")).isNotBlank();
		assertThat(JsonPath.<String>read(admitted, "$.admittedUntil")).isNotBlank();
	}

	@Test
	void anUnknownEventOrAMissingSignInIsRefusedBeforeStreaming() throws Exception {
		Guest guest = createGuests(1).get(0);
		HttpClient client = HttpClient.newHttpClient();
		HttpResponse<String> unknown = client.send(HttpRequest.newBuilder(
				URI.create("http://localhost:" + port + "/api/events/999999/queue/stream"))
				.header("Authorization", bearer(guest.token())).GET().build(), HttpResponse.BodyHandlers.ofString());
		assertThat(unknown.statusCode()).isEqualTo(404);
		HttpResponse<String> anonymous = client.send(HttpRequest.newBuilder(
				URI.create("http://localhost:" + port + "/api/events/1/queue/stream")).GET().build(),
				HttpResponse.BodyHandlers.ofString());
		assertThat(anonymous.statusCode()).isEqualTo(401);
	}

}
