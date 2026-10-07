package com.ticketrush;

import com.jayway.jsonpath.JsonPath;
import com.ticketrush.identity.application.TokenIssuer;
import com.ticketrush.identity.domain.Role;
import com.ticketrush.identity.domain.User;
import com.ticketrush.identity.domain.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** Boots the full app against real Postgres and Redis containers. Subclasses share one Spring context. */
@SpringBootTest
@AutoConfigureMockMvc
@Import({ TestcontainersConfiguration.class, TestClockConfig.class })
@ActiveProfiles("test")
public abstract class AbstractIntegrationTest {

	protected static final String PASSWORD = "correct-horse-battery";

	@Autowired
	protected MockMvc mvc;

	@Autowired
	protected JdbcClient jdbc;

	@Autowired
	protected MutableClock clock;

	@Autowired
	private UserRepository users;

	@Autowired
	private TokenIssuer tokenIssuer;

	@Autowired
	private PasswordEncoder encoder;

	protected record Guest(long id, String token) {
	}

	/**
	 * Creates many guests quickly: one shared password hash and tokens minted directly, so hundreds of guests
	 * cost milliseconds instead of a bcrypt hash and a login each.
	 */
	protected List<Guest> createGuests(int count) {
		String hash = encoder.encode(PASSWORD);
		List<User> batch = new ArrayList<>();
		for (int i = 0; i < count; i++) {
			batch.add(new User("bulk-" + UUID.randomUUID() + "@example.org", hash, "Guest " + i, Role.GUEST));
		}
		List<Guest> guests = new ArrayList<>();
		for (User user : users.saveAll(batch)) {
			guests.add(new Guest(user.getId(), tokenIssuer.issue(user).value()));
		}
		return guests;
	}

	@AfterEach
	void resetClock() {
		clock.reset();
	}

	/** Bearer token for a brand new organizer. */
	protected String organizerToken() throws Exception {
		return tokenFor(createUser(Role.ORGANIZER));
	}

	/** Bearer token for a brand new guest. */
	protected String guestToken() throws Exception {
		return tokenFor(createUser(Role.GUEST));
	}

	protected static String bearer(String token) {
		return "Bearer " + token;
	}

	private String createUser(Role role) {
		String email = role.name().toLowerCase() + "-" + UUID.randomUUID() + "@example.org";
		users.saveAndFlush(new User(email, encoder.encode(PASSWORD), "Test " + role, role));
		return email;
	}

	private String tokenFor(String email) throws Exception {
		String body = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"email":"%s","password":"%s"}""".formatted(email, PASSWORD)))
				.andReturn().getResponse().getContentAsString();
		return JsonPath.read(body, "$.accessToken");
	}

}
