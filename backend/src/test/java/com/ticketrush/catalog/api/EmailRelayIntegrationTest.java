package com.ticketrush.catalog.api;

import com.ticketrush.catalog.application.EmailRelay;
import com.ticketrush.catalog.application.OutboxRelay;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Order emails are written when something happens and sent by a relay that retries, so a provider outage loses nothing. */
class EmailRelayIntegrationTest extends OrderTestSupport {

	@Autowired
	private OutboxRelay outbox;

	@Autowired
	private EmailRelay emails;

	/** The tests share one database, and other tests leave events and messages undelivered: start with nothing waiting to be relayed or sent. */
	@BeforeEach
	void emptyTheOutbox() {
		jdbc.sql("update outbox_event set published_at = now() where published_at is null").update();
		jdbc.sql("update sent_email set sent_at = now() where sent_at is null").update();
	}

	private int sentRows(long orderId) {
		return count("select count(*) from sent_email where order_id = :p0 and sent_at is not null", orderId);
	}

	@Test
	void aPaidOrderIsConfirmedByEmailOnceHoweverOftenTheRelayRuns() throws Exception {
		setUpEvent();
		Guest guest = createGuests(1).get(0);
		long order = buyTwo(guest, 0);
		outbox.relay();
		assertThat(count("select count(*) from sent_email where order_id = :p0 and sent_at is null", order)).isEqualTo(1);

		emails.relay();
		emails.relay();

		String address = jdbc.sql("select email from app_user where id = :u").param("u", guest.id()).query(String.class).single();
		assertThat(mailer.sentTo(address)).hasSize(1);
		assertThat(mailer.sentTo(address).get(0).subject()).startsWith("Your tickets, order ");
		assertThat(mailer.sentTo(address).get(0).key()).startsWith("sent-email-");
		assertThat(sentRows(order)).isEqualTo(1);
	}

	@Test
	void aFailedSendIsRetriedAndNothingIsSentTwice() throws Exception {
		setUpEvent();
		Guest guest = createGuests(1).get(0);
		long order = buyTwo(guest, 0);
		outbox.relay();

		mailer.failNext(1);
		assertThat(emails.relay()).isZero();
		assertThat(sentRows(order)).isZero();
		assertThat(jdbc.sql("select attempts from sent_email where order_id = :o").param("o", order).query(Integer.class).single())
				.isEqualTo(1);
		assertThat(jdbc.sql("select last_error from sent_email where order_id = :o").param("o", order).query(String.class).single())
				.contains("provider is down");

		assertThat(emails.relay()).isEqualTo(1);
		assertThat(emails.relay()).isZero();
		assertThat(sentRows(order)).isEqualTo(1);
		assertThat(mailer.sent()).hasSize(1);
	}

	@Test
	void cancellingAnEventTellsEachBuyerTheirMoneyIsComingBack() throws Exception {
		setUpEvent();
		List<Guest> guests = createGuests(2);
		long first = buyTwo(guests.get(0), 0);
		long second = buyTwo(guests.get(1), 2);
		outbox.relay();
		emails.relay();
		mailer.reset();

		mvc.perform(post("/api/events/" + eventId + "/cancel").header("Authorization", bearer(organizer))).andExpect(status().isOk());
		// Cancelling again changes nothing and says nothing more.
		mvc.perform(post("/api/events/" + eventId + "/cancel").header("Authorization", bearer(organizer))).andExpect(status().isOk());
		emails.relay();

		assertThat(mailer.sent()).hasSize(2);
		for (var mail : mailer.sent()) {
			assertThat(mail.subject()).contains("was cancelled");
			assertThat(mail.text()).contains("refunded").contains("$206.40");
		}
		assertThat(count("select count(*) from sent_email where kind = 'CANCELLATION' and order_id in (:p0, " + second + ")", first))
				.isEqualTo(2);
	}

}
