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

/**
 * Demo data for local development: one organizer, four venues and five published events that match the
 * posters in the design. Runs only with the "dev" profile, only if an organizer password is configured,
 * and only once (it skips when the organizer already exists).
 */
@Component
@Profile("dev")
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
		if (users.findByEmailIgnoreCase(organizerEmail).isPresent()) {
			log.info("Demo data already present");
			return;
		}
		long organizer = users.saveAndFlush(
				new User(organizerEmail, encoder.encode(organizerPassword), "Demo Organizer", Role.ORGANIZER)).getId();

		VenueView halden = venues.create("Halden Hall", "Montreal", List.of(new SectionSpec("Floor", 10, 40),
				new SectionSpec("Stalls", 20, 50), new SectionSpec("Balcony", 10, 60)));
		VenueView laurier = venues.create("Théâtre Laurier", "Montreal",
				List.of(new SectionSpec("Orchestra", 15, 25), new SectionSpec("Balcony", 5, 25)));
		VenueView cartier = venues.create("Maison Cartier", "Montreal",
				List.of(new SectionSpec("Parterre", 20, 30), new SectionSpec("Gallery", 5, 40)));
		VenueView stade = venues.create("Stade Laurentien", "Montreal",
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
		log.info("Demo data created. Sign in as {} with the password from DEMO_ORGANIZER_PASSWORD", organizerEmail);
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
		EventRef event = events.create(organizer, new NewEvent(title, artist, "Demo event.", venue.id(), starts,
				starts.minus(1, ChronoUnit.HOURS), onSale.minus(10, ChronoUnit.MINUTES), onSale,
				new Poster(style, inkOne, inkTwo, paper), prices, waitingRoom));
		events.publish(organizer, event.id());
	}

}
