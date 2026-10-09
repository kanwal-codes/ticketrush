package com.ticketrush.catalog.api;

import com.ticketrush.catalog.application.EmailRelay;
import com.ticketrush.catalog.application.OutboxRelay;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** A guest can take a copy of their data and close their account; what the money needs is kept, who they were is not. */
class AccountDataIntegrationTest extends OrderTestSupport {

	@Autowired
	private OutboxRelay outbox;

	@Autowired
	private EmailRelay emails;

	@BeforeEach
	void emptyTheOutbox() {
		jdbc.sql("update outbox_event set published_at = now() where published_at is null").update();
		jdbc.sql("update sent_email set sent_at = now() where sent_at is null").update();
	}

	private String emailOf(Guest guest) {
		return jdbc.sql("select email from app_user where id = :u").param("u", guest.id()).query(String.class).single();
	}

	private org.springframework.test.web.servlet.ResultActions close(String token, String password) throws Exception {
		return mvc.perform(post("/api/me/close").header("Authorization", bearer(token)).contentType(MediaType.APPLICATION_JSON)
				.content("{\"password\":\"%s\"}".formatted(password)));
	}

	@Test
	void theExportHoldsTheGuestsOwnAccountOrdersTicketsAndEmailsAndNobodyElses() throws Exception {
		setUpEvent();
		List<Guest> guests = createGuests(2);
		long mine = buyTwo(guests.get(0), 0);
		buyTwo(guests.get(1), 2);
		outbox.relay();
		emails.relay();

		mvc.perform(get("/api/me/export").header("Authorization", bearer(guests.get(0).token()))).andExpect(status().isOk())
				.andExpect(header().string("Content-Disposition", "attachment; filename=\"ticketrush-my-data.json\""))
				.andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
				.andExpect(jsonPath("$.account.email").value(emailOf(guests.get(0))))
				.andExpect(jsonPath("$.account.role").value("GUEST"))
				.andExpect(jsonPath("$.orders.length()").value(1))
				.andExpect(jsonPath("$.orders[0].order.id").value(mine))
				.andExpect(jsonPath("$.orders[0].eventTitle").isNotEmpty())
				.andExpect(jsonPath("$.orders[0].order.tickets.length()").value(2))
				.andExpect(jsonPath("$.emails.length()").value(1))
				.andExpect(jsonPath("$.emails[0].kind").value("CONFIRMATION"));
		mvc.perform(get("/api/me/export")).andExpect(status().isUnauthorized());
	}

	@Test
	void closingNeedsThePasswordAndASignIn() throws Exception {
		Guest guest = createGuests(1).get(0);
		close(guest.token(), "not-the-password").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("That password is not right."));
		assertThat(emailOf(guest)).doesNotContain("deleted.invalid");
		mvc.perform(post("/api/me/close").contentType(MediaType.APPLICATION_JSON).content("{\"password\":\"x\"}"))
				.andExpect(status().isUnauthorized());
		mvc.perform(post("/api/me/close").header("Authorization", bearer(guest.token())).contentType(MediaType.APPLICATION_JSON)
				.content("{}")).andExpect(status().isBadRequest());
	}

	@Test
	void closingRemovesWhoTheGuestWasAndKeepsWhatTheMoneyNeeds() throws Exception {
		setUpEvent();
		Guest guest = createGuests(1).get(0);
		String email = emailOf(guest);
		long order = buyTwo(guest, 0);
		outbox.relay();
		emails.relay();
		// The event is over, so the tickets no longer strand anyone.
		clock.advance(Duration.ofDays(400));

		close(guest.token(), PASSWORD).andExpect(status().isNoContent());

		assertThat(emailOf(guest)).isEqualTo("deleted-" + guest.id() + "@deleted.invalid");
		assertThat(jdbc.sql("select display_name from app_user where id = :u").param("u", guest.id()).query(String.class).single())
				.isEqualTo("Deleted account");
		assertThat(jdbc.sql("select deleted_at is not null from app_user where id = :u").param("u", guest.id()).query(Boolean.class).single()).isTrue();
		// The order and its money are still there.
		assertThat(orderStatus(order)).isEqualTo("PAID");
		assertThat(count("select count(*) from ticket where order_id = :p0", order)).isEqualTo(2);
		// What was said to the guest is gone.
		assertThat(jdbc.sql("select to_email from sent_email where order_id = :o").param("o", order).query(String.class).single())
				.isEqualTo("deleted@deleted.invalid");
		assertThat(jdbc.sql("select body from sent_email where order_id = :o").param("o", order).query(String.class).single())
				.doesNotContain("Guest");

		// Nobody can sign in as the old account, the address is free again, and the old sign-in cannot be renewed.
		mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, PASSWORD))).andExpect(status().isUnauthorized());
		mvc.perform(post("/api/auth/refresh").header("Authorization", bearer(guest.token()))).andExpect(status().isUnauthorized());
		mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"%s\",\"password\":\"%s\",\"displayName\":\"Back again\"}".formatted(email, PASSWORD)))
				.andExpect(status().isCreated());
		assertMoneyAndSeatsAddUp();
	}

	@Test
	void closingIsRefusedWhileATicketForAnEventToComeIsHeld() throws Exception {
		setUpEvent();
		Guest guest = createGuests(1).get(0);
		buyTwo(guest, 0);

		close(guest.token(), PASSWORD).andExpect(status().isConflict()).andExpect(jsonPath("$.title").value("Cannot close the account"))
				.andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("tickets for an event that has not happened")));
		assertThat(emailOf(guest)).doesNotContain("deleted.invalid");
	}

	@Test
	void closingIsRefusedWhileAPaymentIsStillBeingSettled() throws Exception {
		setUpEvent();
		Guest guest = createGuests(1).get(0);
		long hold = holdTwo(guest, 0);
		pay(guest, newKey(), hold, "tok_error").andExpect(status().isAccepted());

		close(guest.token(), PASSWORD).andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("still being settled")));
	}

	@Test
	void anOrganizerCannotCloseTheirAccountHere() throws Exception {
		close(organizerToken(), PASSWORD).andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("organizer account")));
	}

	@Test
	void aGuestWhoSignedUpThroughTheApiCanCloseAtOnce() throws Exception {
		String email = "close-" + UUID.randomUUID() + "@example.org";
		mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"%s\",\"password\":\"%s\",\"displayName\":\"Short stay\"}".formatted(email, PASSWORD)))
				.andExpect(status().isCreated());
		String token = com.jayway.jsonpath.JsonPath.read(mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, PASSWORD))).andReturn().getResponse().getContentAsString(), "$.accessToken");

		close(token, PASSWORD).andExpect(status().isNoContent());
		close(token, PASSWORD).andExpect(status().isNotFound());
	}

}
