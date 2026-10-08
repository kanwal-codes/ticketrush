import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * Opens many live waiting-room streams at once (server-sent events) and measures what a guest would feel:
 * does the stream open, how long until the first update, and are updates steady. While they are open it reads
 * the app's own numbers (threads, heap, CPU). k6 cannot hold server-sent streams well, hence this program.
 *
 *   java loadtest/StreamLoad.java [streams=2000] [seconds=30]       (needs loadtest/prepare.sh first)
 */
public class StreamLoad {

	static final String BASE = System.getenv().getOrDefault("BASE_URL", "http://localhost:8080");
	static final String MGMT = System.getenv().getOrDefault("MGMT_URL", "http://localhost:8081");
	static final HttpClient HTTP = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1)
			.connectTimeout(Duration.ofSeconds(30)).build();

	public static void main(String[] args) throws Exception {
		int streams = args.length > 0 ? Integer.parseInt(args[0]) : 2000;
		int seconds = args.length > 1 ? Integer.parseInt(args[1]) : 30;
		String password = System.getenv().getOrDefault("ORGANIZER_PASSWORD", System.getenv("DEMO_ORGANIZER_PASSWORD"));

		String organizer = extract(post("/api/auth/login", null,
				"{\"email\":\"organizer@ticketrush.dev\",\"password\":\"" + password + "\"}"), "\"accessToken\":\"([^\"]+)\"");
		long eventId = createQueueEvent(organizer);
		List<String> tokens = new ArrayList<>();
		Matcher m = Pattern.compile("\"token\":\"([^\"]+)\"").matcher(Files.readString(Path.of("loadtest/results/guests.json")));
		while (m.find() && tokens.size() < streams) tokens.add(m.group(1));
		if (tokens.size() < streams) throw new IllegalStateException("Only " + tokens.size() + " guests prepared");
		System.out.println("Event " + eventId + " has a waiting room that is not open for sale yet. Joining with " + streams + " guests...");

		// Everyone joins the line first (a few at a time, the way a page load would).
		Semaphore joinLimit = new Semaphore(100);
		try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
			for (String t : tokens) pool.submit(() -> {
				joinLimit.acquire();
				try { post("/api/events/" + eventId + "/queue", t, null); } finally { joinLimit.release(); }
				return null;
			});
		}

		// Then every guest opens the live stream and listens.
		ConcurrentLinkedQueue<Long> firstEventMs = new ConcurrentLinkedQueue<>();
		ConcurrentLinkedQueue<Long> gapsMs = new ConcurrentLinkedQueue<>();
		ConcurrentLinkedQueue<Integer> eventsPerStream = new ConcurrentLinkedQueue<>();
		AtomicInteger opened = new AtomicInteger(), failed = new AtomicInteger();
		CountDownLatch finished = new CountDownLatch(streams);
		Instant deadline = Instant.now().plusSeconds(seconds + 5);
		Semaphore openLimit = new Semaphore(200);

		try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
			for (String t : tokens) pool.submit(() -> {
				try { listen(eventId, t, deadline, openLimit, firstEventMs, gapsMs, eventsPerStream, opened, failed); }
				finally { finished.countDown(); }
				return null;
			});
			Thread.sleep(Duration.ofSeconds(Math.min(seconds, 20) / 2 + 5));
			String during = appNumbers();
			finished.await();
			report(streams, seconds, opened.get(), failed.get(), firstEventMs, gapsMs, eventsPerStream, during);
		}
	}

	static void listen(long eventId, String token, Instant deadline, Semaphore openLimit, ConcurrentLinkedQueue<Long> first,
			ConcurrentLinkedQueue<Long> gaps, ConcurrentLinkedQueue<Integer> perStream, AtomicInteger opened, AtomicInteger failed) {
		HttpRequest request = HttpRequest.newBuilder(URI.create(BASE + "/api/events/" + eventId + "/queue/stream"))
				.header("Authorization", "Bearer " + token).header("Accept", "text/event-stream").build();
		long asked = System.nanoTime();
		HttpResponse<Stream<String>> response;
		try {
			openLimit.acquire();
			try { response = HTTP.send(request, HttpResponse.BodyHandlers.ofLines()); } finally { openLimit.release(); }
		} catch (Exception e) { failed.incrementAndGet(); return; }
		if (response.statusCode() != 200) { failed.incrementAndGet(); response.body().close(); return; }
		opened.incrementAndGet();
		int events = 0;
		long last = 0;
		try (Stream<String> lines = response.body()) {
			for (var it = lines.iterator(); it.hasNext() && Instant.now().isBefore(deadline); ) {
				if (!it.next().startsWith("data:")) continue;
				long now = System.nanoTime();
				if (events == 0) first.add((now - asked) / 1_000_000); else gaps.add((now - last) / 1_000_000);
				last = now;
				events++;
			}
		} catch (RuntimeException e) { /* stream closed under us: counts as what it received */ }
		perStream.add(events);
	}

	static long createQueueEvent(String organizer) throws Exception {
		String venue = post("/api/venues", organizer,
				"{\"name\":\"Stream Hall\",\"city\":\"Loadville\",\"sections\":[{\"name\":\"Main\",\"rows\":5,\"seatsPerRow\":10}]}");
		String venueId = extract(venue, "\"id\":(\\d+)");
		String sectionId = extract(venue, "\"sections\":\\[\\{\"id\":(\\d+)");
		Instant now = Instant.now();
		String event = post("/api/events", organizer, """
				{"title":"Stream","artist":"k6","description":"Created by the stream test.","venueId":%s,
				 "startsAt":"%s","doorsAt":"%s","dropOpensAt":"%s","onSaleAt":"%s",
				 "poster":{"style":"ORBIT","inkOne":"#2B2FD9","inkTwo":"#FF5A36","paperColor":"#FFD9C4"},
				 "prices":[{"sectionId":%s,"priceCents":9600}],"waitingRoom":true}"""
				.formatted(venueId, now.plus(Duration.ofDays(30)), now.plus(Duration.ofDays(30)).minus(Duration.ofHours(1)),
						now.minus(Duration.ofMinutes(1)), now.plus(Duration.ofMinutes(30)), sectionId));
		long id = Long.parseLong(extract(event, "\"id\":(\\d+)"));
		post("/api/events/" + id + "/publish", organizer, null);
		return id;
	}

	static String post(String path, String token, String body) throws Exception {
		HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(BASE + path)).header("Content-Type", "application/json")
				.POST(body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
		if (token != null) b.header("Authorization", "Bearer " + token);
		HttpResponse<String> r = HTTP.send(b.build(), HttpResponse.BodyHandlers.ofString());
		if (r.statusCode() >= 300) throw new IllegalStateException(path + " -> " + r.statusCode() + " " + r.body());
		return r.body();
	}

	static String extract(String text, String regex) {
		Matcher m = Pattern.compile(regex).matcher(text);
		if (!m.find()) throw new IllegalStateException("No match for " + regex + " in " + text);
		return m.group(1);
	}

	/** The app's own view while the streams are open: threads, heap, CPU and database connections in use. */
	static String appNumbers() {
		try {
			String text = HTTP.send(HttpRequest.newBuilder(URI.create(MGMT + "/actuator/prometheus")).build(),
					HttpResponse.BodyHandlers.ofString()).body();
			double heap = 0;
			for (String line : text.split("\n")) {
				if (line.startsWith("jvm_memory_used_bytes{") && line.contains("area=\"heap\"")) heap += Double.parseDouble(line.substring(line.lastIndexOf(' ') + 1));
			}
			return String.format("threads=%.0f  heap=%.0f MB  cpu=%.0f%% of the container  db connections in use=%.0f",
					value(text, "jvm_threads_live_threads"), heap / 1048576, value(text, "process_cpu_usage") * 100,
					value(text, "hikaricp_connections_active"));
		} catch (Exception e) { return "(could not read the app's numbers: " + e + ")"; }
	}

	static double value(String text, String name) {
		for (String line : text.split("\n")) if (line.startsWith(name + "{")) return Double.parseDouble(line.substring(line.lastIndexOf(' ') + 1));
		return Double.NaN;
	}

	static long pct(List<Long> sorted, double p) { return sorted.isEmpty() ? 0 : sorted.get((int) Math.min(sorted.size() - 1, Math.floor(p * sorted.size()))); }

	static void report(int streams, int seconds, int opened, int failed, ConcurrentLinkedQueue<Long> first,
			ConcurrentLinkedQueue<Long> gaps, ConcurrentLinkedQueue<Integer> perStream, String during) {
		List<Long> f = new ArrayList<>(first), g = new ArrayList<>(gaps);
		List<Integer> e = new ArrayList<>(perStream);
		Collections.sort(f); Collections.sort(g); Collections.sort(e);
		System.out.println();
		System.out.printf("Streams asked for       %d%n", streams);
		System.out.printf("Opened                  %d (failed %d)%n", opened, failed);
		System.out.printf("Time to first update    p50 %d ms, p95 %d ms, max %d ms%n", pct(f, .5), pct(f, .95), f.isEmpty() ? 0 : f.get(f.size() - 1));
		System.out.printf("Gap between updates     p50 %d ms, p95 %d ms, p99 %d ms, max %d ms (sent every 1000 ms)%n", pct(g, .5), pct(g, .95), pct(g, .99), g.isEmpty() ? 0 : g.get(g.size() - 1));
		System.out.printf("Updates per stream      median %d over about %d s%n", e.isEmpty() ? 0 : e.get(e.size() / 2), seconds);
		System.out.println("App while streams open  " + during);
		boolean ok = opened >= streams * 0.99 && !e.isEmpty() && e.get(e.size() / 2) >= seconds * 0.8;
		System.out.println(ok ? "\nPASS" : "\nFAIL: fewer than 99% opened, or updates stopped arriving");
		System.exit(ok ? 0 : 1);
	}

}
