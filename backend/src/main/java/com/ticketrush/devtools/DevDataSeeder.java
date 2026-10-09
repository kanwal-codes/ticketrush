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
			Map.entry("Afterlight Tour", "Mira Okafor plays her new album Afterlight from start to finish, then an encore of older songs. Standing on the floor, reserved seats in the stalls and balcony."),
			Map.entry("Tomas Aguilar: Live", "Tomas Aguilar performs a solo set on piano and voice at Théâtre Laurier. Every seat in the orchestra and balcony is reserved."),
			Map.entry("The Winter's Tale", "Théâtre du Marais stages Shakespeare's late romance in a new production. One interval, with reserved seats in the orchestra and balcony."),
			Map.entry("Northern Lights Orchestra", "The full orchestra plays an evening of film and concert music at Maison Cartier. Seats are reserved in the parterre and the gallery."),
			Map.entry("Harbour FC vs Rivière United", "Harbour FC host Rivière United in the league derby at Stade Laurentien. The lower and upper stands are reserved seating."),
			Map.entry("After Hours with Noor Haddad", "Noor Haddad plays a late, vinyl-only set in the small room at Studio Vitrine. Seats are limited, so a waiting room opens before the sale."),
			Map.entry("Tidal Night One", "Koji Hayashi plays an electronic set with a full light show at Lakeshore Arena. A waiting room opens before the sale."),
			Map.entry("Rooftop Sessions: Sable Quinn", "Sable Quinn plays an open-air evening set at the Vieux-Port Amphitheatre. Pit seats at the front, lawn seating behind."),
			Map.entry("Lakeshore Lions vs Harbour FC", "The Lakeshore Lions take on Harbour FC at Lakeshore Arena. The lower and upper bowls are reserved seating."),
			Map.entry("Brass and Bloom", "Fanfare Cartier, a brass band, plays marches, jazz and new arrangements at Salle Marquis. Parterre and balcony seats are reserved."),
			Map.entry("Late Night Folk: Oona and the Marlows", "Oona and the Marlows play acoustic folk songs in the small room at Studio Vitrine. A short, quiet late show."),
			Map.entry("Stand-up Cellar: Priya Nair", "Priya Nair headlines an evening of stand-up at Studio Vitrine, with two opening comics. Seating is on the floor and the mezzanine."),
			Map.entry("Vivaldi by Candlelight", "Orchestre de la Rive plays Vivaldi's Four Seasons in an evening concert at the Vieux-Port Amphitheatre. Pit and lawn seating."));

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
		publish(organizer, vitrine, "After Hours with Noor Haddad", "Noor Haddad", PosterStyle.VINYL, "#111111",
				"#FF7A00", "#F1EBDD", Duration.ofHours(3), Duration.ofDays(20), true, 4500, 3000);
		publish(organizer, lakeshore, "Tidal Night One", "Koji Hayashi", PosterStyle.AURORA, "#7DF9D0", "#2E5BFF",
				"#0B1633", Duration.ofDays(2), Duration.ofDays(40), true, 9500, 6500);
		// On sale now, with a queue that is already running.
		publish(organizer, vieuxPort, "Rooftop Sessions: Sable Quinn", "Sable Quinn", PosterStyle.SUN, "#1A1A1A",
				"#E8472B", "#F6C453", Duration.ofHours(-1), Duration.ofDays(9), true, 6200, 3900);
		publish(organizer, lakeshore, "Lakeshore Lions vs Harbour FC", "Lakeshore Lions", PosterStyle.PITCH, "#0057B8",
				"#121212", "#EEF2F7", Duration.ofDays(-4), Duration.ofDays(25), true, 7800, 4200);
		// On sale now, no queue.
		publish(organizer, marquis, "Brass and Bloom", "Fanfare Cartier", PosterStyle.CURTAIN,
				"#7A1F2B", "#F2A33A", "#F5E3D3", Duration.ofDays(-3), Duration.ofDays(14), false, 4800, 3400);
		publish(organizer, vitrine, "Late Night Folk: Oona and the Marlows", "Oona and the Marlows", PosterStyle.SUN,
				"#2B3A55", "#F26B5B", "#F3E9D2", Duration.ofDays(-1), Duration.ofDays(3), false, 2600, 2000);
		publish(organizer, vitrine, "Stand-up Cellar: Priya Nair", "Priya Nair", PosterStyle.CURTAIN, "#111111",
				"#FFB000", "#FFF4D6", Duration.ofDays(-10), Duration.ofDays(55), false, 2800, 2200);
		publish(organizer, vieuxPort, "Vivaldi by Candlelight", "Orchestre de la Rive", PosterStyle.AURORA, "#F5D77A",
				"#B3263E", "#1B0F1F", Duration.ofDays(-6), Duration.ofDays(33), false, 8400, 5200);
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
		publish(organizer, halden, "Afterlight Tour", "Mira Okafor", PosterStyle.ORBIT, "#2B2FD9", "#FF5A36",
				"#FFD9C4", Duration.ofHours(22), Duration.ofDays(38), true, 12800, 9600, 6400);
		publish(organizer, laurier, "Tomas Aguilar: Live", "Tomas Aguilar", PosterStyle.SUN, "#121212", "#E5322D",
				"#FFC20E", Duration.ofDays(-2), Duration.ofDays(16), false, 5800, 4200);
		publish(organizer, laurier, "The Winter's Tale", "Théâtre du Marais", PosterStyle.CURTAIN, "#0E4D3A",
				"#F08FA8", "#F4CFD8", Duration.ofDays(-5), Duration.ofDays(11), false, 7200, 4700);
		publish(organizer, cartier, "Northern Lights Orchestra", "Northern Lights Orchestra", PosterStyle.AURORA,
				"#5CF2B0", "#3F6BFF", "#101B3A", Duration.ofDays(3), Duration.ofDays(26), false, 7800, 5500);
		publish(organizer, stade, "Harbour FC vs Rivière United", "Harbour FC", PosterStyle.PITCH, "#E4002B",
				"#121212", "#F2F2EE", Duration.ofDays(-1), Duration.ofDays(10), true, 5200, 3800);
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
				new Poster(style, inkOne, inkTwo, paper), prices, waitingRoom));
		events.publish(organizer, event.id());
	}

}
