package com.ticketrush.devtools;

import com.ticketrush.catalog.application.EventService;
import com.ticketrush.catalog.application.EventService.EventRef;
import com.ticketrush.catalog.application.EventService.NewEvent;
import com.ticketrush.catalog.application.EventService.Poster;
import com.ticketrush.catalog.application.EventService.PriceSpec;
import com.ticketrush.catalog.application.VenueService;
import com.ticketrush.catalog.application.VenueService.SectionSpec;
import com.ticketrush.catalog.application.VenueService.VenueView;
import com.ticketrush.catalog.domain.PosterStyle;
import com.ticketrush.identity.domain.Role;
import com.ticketrush.identity.domain.User;
import com.ticketrush.identity.domain.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

/**
 * Demo data for local development: one organizer, eight venues in three cities and thirteen published events (the
 * first five match the posters in the design; the rest cover every sale state). Runs only with the "dev" or "demo" profile (the live demo uses "demo"), only if an organizer password
 * is configured, and only once (it skips when the organizer already owns venues). Payments are the mock provider's,
 * so this is demo data, not a shop.
 */
@Component
@Profile({ "dev", "demo" })
class DevDataSeeder implements ApplicationRunner {

	private static final Logger log = LoggerFactory.getLogger(DevDataSeeder.class);

	private final UserRepository users;
	private final PasswordEncoder encoder;
	private final VenueService venues;
	private final EventService events;
	private final Clock clock;
	private final String organizerEmail;
	private final String organizerPassword;

	DevDataSeeder(UserRepository users, PasswordEncoder encoder, VenueService venues, EventService events,
			Clock clock, @Value("${ticketrush.seed.organizer-email}") String organizerEmail,
			@Value("${ticketrush.seed.organizer-password}") String organizerPassword) {
		this.users = users;
		this.encoder = encoder;
		this.venues = venues;
		this.events = events;
		this.clock = clock;
		this.organizerEmail = organizerEmail;
		this.organizerPassword = organizerPassword;
	}

	@Override
	public void run(ApplicationArguments args) {
		if (organizerPassword.isBlank()) {
			log.warn("Demo data skipped: set DEMO_ORGANIZER_PASSWORD to create the demo organizer and events");
			return;
		}
		long organizer = users.findByEmailIgnoreCase(organizerEmail).map(User::getId).orElseGet(() -> users
				.saveAndFlush(new User(organizerEmail, encoder.encode(organizerPassword), "Demo Organizer", Role.ORGANIZER))
				.getId());
		List<VenueView> owned = venues.ownedBy(organizer);
		if (owned.isEmpty()) {
			seedFirstFive(organizer);
		}
		// Added later than the first five, so a database that already has those still gets them (once).
		if (owned.stream().noneMatch(v -> v.name().equals(MARKER_VENUE))) {
			seedMore(organizer);
		}
		log.info("Demo data ready. Sign in as {} with the password from DEMO_ORGANIZER_PASSWORD", organizerEmail);
	}

	private static final String MARKER_VENUE = "Studio Vitrine";

	/** What the event page says about each demo event, by title. Plain sentences about the show and the seating. */
	private static final Map<String, String> ABOUT = Map.ofEntries(
			Map.entry("Afterglow World Tour", "Solene plays her new album Afterglow from start to finish, then an encore of older songs. Standing on the floor, reserved seats in the stalls and balcony."),
			Map.entry("The Understudy", "A new play in two acts about an understudy who finally gets the lead. One interval, with reserved seats in the orchestra and balcony."),
			Map.entry("Swan Lake", "Ballet de la Rive dances Tchaikovsky's Swan Lake in four acts. Every seat in the orchestra and balcony is reserved."),
			Map.entry("Ember & Tide", "A contemporary dance piece for one dancer and two lights, with a live score. Seats are reserved in the parterre and the gallery."),
			Map.entry("Orbit", "Vesper plays an electronic show in the round, under a giant ring of light at Stade Laurentien. The lower and upper stands are reserved seating. A waiting room opens before the sale."),
			Map.entry("Clay & Kiln", "A hands-on pottery night in the small room at Studio Vitrine: wheel throwing, hand building and glazing, with all clay and tools provided. Places are limited, so a waiting room opens before the sale."),
			Map.entry("Halo", "Kai Arden plays an electronic set with a full light show under a glowing ring at Lakeshore Arena. A waiting room opens before the sale."),
			Map.entry("Bloom", "A spring flower show at the Vieux-Port Amphitheatre, with gardens, floral design and a plant market. Pit seats at the front, lawn seating behind."),
			Map.entry("Concours", "An evening showcase of classic cars, supercars, electric cars and one-off concepts at Lakeshore Arena. The lower and upper bowls are reserved seating."),
			Map.entry("Blue Hour", "A live jazz evening with saxophone, piano, bass and drums at Salle Marquis. Parterre and balcony seats are reserved."),
			Map.entry("Form & Light", "The opening night of a contemporary abstraction show, with painting, sculpture and light, in the small room at Studio Vitrine. Seating is on the floor and the mezzanine."),
			Map.entry("Sorry, I'm Late", "Rudy Finch headlines an evening of stand-up at Studio Vitrine, with two opening comics. Seating is on the floor and the mezzanine."),
			Map.entry("Blue Hour Under the Stars", "The jazz quartet takes Blue Hour outdoors at the Vieux-Port Amphitheatre. Pit seats at the front, lawn seating behind."));

	/** The designed poster each demo event shows, by title. The files live in the web app's public/posters folder. */
	private static final Map<String, String> POSTER_IMAGES = Map.ofEntries(
			Map.entry("Afterglow World Tour", "/posters/afterglow-world-tour.webp"),
			Map.entry("The Understudy", "/posters/the-understudy.webp"),
			Map.entry("Swan Lake", "/posters/swan-lake.webp"),
			Map.entry("Ember & Tide", "/posters/ember-and-tide.webp"),
			Map.entry("Orbit", "/posters/orbit.webp"),
			Map.entry("Clay & Kiln", "/posters/clay-and-kiln.webp"),
			Map.entry("Halo", "/posters/halo.webp"),
			Map.entry("Bloom", "/posters/bloom.webp"),
			Map.entry("Concours", "/posters/concours.webp"),
			Map.entry("Blue Hour", "/posters/blue-hour.webp"),
			Map.entry("Form & Light", "/posters/form-and-light.webp"),
			Map.entry("Sorry, I'm Late", "/posters/sorry-im-late.webp"),
			Map.entry("Blue Hour Under the Stars", "/posters/blue-hour.webp"));

	/** More events in more cities, in every state a guest can meet: a drop hours away, a live queue, open sales. */
	private void seedMore(long organizer) {
		VenueView vitrine = venues.create(organizer, MARKER_VENUE, "Montreal",
				List.of(new SectionSpec("Floor", 8, 25), new SectionSpec("Mezzanine", 4, 25)));
		VenueView lakeshore = venues.create(organizer, "Lakeshore Arena", "Toronto",
				List.of(new SectionSpec("Lower", 12, 40), new SectionSpec("Upper", 8, 40)));
		VenueView vieuxPort = venues.create(organizer, "Vieux-Port Amphitheatre", "Quebec City",
				List.of(new SectionSpec("Pit", 6, 30), new SectionSpec("Lawn", 10, 40)));
		VenueView marquis = venues.create(organizer, "Salle Marquis", "Montreal",
				List.of(new SectionSpec("Parterre", 12, 30), new SectionSpec("Balcon", 4, 30)));

		// A drop a few hours away, with a waiting room: the home page's countdown and the queue both have something to show.
		publish(organizer, vitrine, "Clay & Kiln", "Atelier Terre", PosterStyle.VINYL, "#2A1710",
				"#E3A74B", "#B34A2A", Duration.ofHours(3), Duration.ofDays(20), true, 4500, 3000);
		publish(organizer, lakeshore, "Halo", "Kai Arden", PosterStyle.AURORA, "#FFAA3C", "#7FC8FF",
				"#05081A", Duration.ofDays(2), Duration.ofDays(40), true, 9500, 6500);
		// On sale now, with a queue that is already running.
		publish(organizer, vieuxPort, "Bloom", "Jardin de la Rive", PosterStyle.SUN, "#1F4D3A",
				"#E75A7C", "#FBEDE8", Duration.ofHours(-1), Duration.ofDays(9), true, 6200, 3900);
		publish(organizer, lakeshore, "Concours", "Concours International", PosterStyle.PITCH, "#D9A441",
				"#F1EBDC", "#0B3D2E", Duration.ofDays(-4), Duration.ofDays(25), true, 7800, 4200);
		// On sale now, no queue.
		publish(organizer, marquis, "Blue Hour", "Blue Hour Quartet", PosterStyle.CURTAIN,
				"#FF7A59", "#F7EBD3", "#0B1230", Duration.ofDays(-3), Duration.ofDays(14), false, 4800, 3400);
		publish(organizer, vitrine, "Form & Light", "Galerie Prisme", PosterStyle.SUN,
				"#E63B2E", "#1F3FD1", "#F2EFE8", Duration.ofDays(-1), Duration.ofDays(3), false, 2600, 2000);
		publish(organizer, vitrine, "Sorry, I'm Late", "Rudy Finch", PosterStyle.CURTAIN, "#141210",
				"#FF3D81", "#FFD23F", Duration.ofDays(-10), Duration.ofDays(55), false, 2800, 2200);
		publish(organizer, vieuxPort, "Blue Hour Under the Stars", "Blue Hour Quartet", PosterStyle.AURORA, "#F2C14E",
				"#FF7A59", "#0B1230", Duration.ofDays(-6), Duration.ofDays(33), false, 8400, 5200);
	}

	private void seedFirstFive(long organizer) {
		VenueView halden = venues.create(organizer, "Halden Hall", "Montreal", List.of(new SectionSpec("Floor", 10, 40),
				new SectionSpec("Stalls", 20, 50), new SectionSpec("Balcony", 10, 60)));
		VenueView laurier = venues.create(organizer, "Théâtre Laurier", "Montreal",
				List.of(new SectionSpec("Orchestra", 15, 25), new SectionSpec("Balcony", 5, 25)));
		VenueView cartier = venues.create(organizer, "Maison Cartier", "Montreal",
				List.of(new SectionSpec("Parterre", 20, 30), new SectionSpec("Gallery", 5, 40)));
		VenueView stade = venues.create(organizer, "Stade Laurentien", "Montreal",
				List.of(new SectionSpec("Lower", 20, 50), new SectionSpec("Upper", 10, 50)));

		// Prices are face value in cents. Guests see face plus the 7.5% fee.
		publish(organizer, halden, "Afterglow World Tour", "Solene", PosterStyle.ORBIT, "#FF4A1C", "#B9A8FF",
				"#0E0B1F", Duration.ofHours(22), Duration.ofDays(38), true, 12800, 9600, 6400);
		publish(organizer, laurier, "The Understudy", "Théâtre du Marais", PosterStyle.CURTAIN, "#8E1828",
				"#E3B04B", "#150A0C", Duration.ofDays(-2), Duration.ofDays(16), false, 5800, 4200);
		publish(organizer, laurier, "Swan Lake", "Ballet de la Rive", PosterStyle.SUN, "#232A55",
				"#B76E79", "#F1DEDA", Duration.ofDays(-5), Duration.ofDays(11), false, 7200, 4700);
		publish(organizer, cartier, "Ember & Tide", "Compagnie Marée", PosterStyle.AURORA,
				"#FF6A4D", "#5AA9FF", "#06070F", Duration.ofDays(3), Duration.ofDays(26), false, 7800, 5500);
		publish(organizer, stade, "Orbit", "Vesper", PosterStyle.ORBIT, "#8FB4FF",
				"#EAF2FF", "#040918", Duration.ofDays(-1), Duration.ofDays(10), true, 5200, 3800);
	}

	private void publish(long organizer, VenueView venue, String title, String artist, PosterStyle style,
			String inkOne, String inkTwo, String paper, Duration onSaleIn, Duration startsIn, boolean waitingRoom, int... sectionPrices) {
		Instant now = clock.instant().truncatedTo(ChronoUnit.MINUTES);
		Instant onSale = now.plus(onSaleIn);
		Instant starts = now.plus(startsIn).truncatedTo(ChronoUnit.HOURS);
		List<PriceSpec> prices = new java.util.ArrayList<>();
		for (int i = 0; i < venue.sections().size(); i++) {
			prices.add(new PriceSpec(venue.sections().get(i).id(), sectionPrices[i]));
		}
		EventRef event = events.create(organizer, new NewEvent(title, artist, ABOUT.get(title), venue.id(), starts,
				starts.minus(1, ChronoUnit.HOURS), onSale.minus(10, ChronoUnit.MINUTES), onSale,
				new Poster(style, inkOne, inkTwo, paper, POSTER_IMAGES.get(title)), prices, waitingRoom));
		events.publish(organizer, event.id());
	}

}
