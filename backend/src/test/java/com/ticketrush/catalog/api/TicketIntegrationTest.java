package com.ticketrush.catalog.api;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class TicketIntegrationTest extends OrderTestSupport {

	private ResultActions scan(String token, String code, Long forEvent) throws Exception {
		String event = forEvent == null ? "" : ",\"eventId\":" + forEvent;
		return mvc.perform(post("/api/tickets/scan").contentType(MediaType.APPLICATION_JSON)
				.content("{\"code\":\"%s\"%s}".formatted(code, event)).header("Authorization", bearer(token)));
	}

	private String firstCode(long orderId) {
		return jdbc.sql("select code from ticket where order_id = :o order by id limit 1").param("o", orderId)
				.query(String.class).single();
	}

	@Test
	void aGuestSeesTheirOwnTicketsAndNobodyElses() throws Exception {
		setUpEvent();
		List<Guest> guests = createGuests(2);
		long orderId = buyTwo(guests.get(0), 0);

		mvc.perform(get("/api/tickets").header("Authorization", bearer(guests.get(0).token())))
				.andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2))
				.andExpect(jsonPath("$[0].eventId").value(eventId))
				.andExpect(jsonPath("$[0].section").value("Main"))
				.andExpect(jsonPath("$[0].status").value("ISSUED"))
				.andExpect(jsonPath("$[0].code").value(org.hamcrest.Matchers.hasLength(26)));
		mvc.perform(get("/api/tickets").header("Authorization", bearer(guests.get(1).token())))
				.andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
		assertThat(orderStatus(orderId)).isEqualTo("PAID");
	}

	@Test
	void theOwnerGetsAQrCodeAndOthersDoNot() throws Exception {
		setUpEvent();
		List<Guest> guests = createGuests(2);
		long orderId = buyTwo(guests.get(0), 0);
		long ticketId = jdbc.sql("select id from ticket where order_id = :o order by id limit 1").param("o", orderId)
				.query(Long.class).single();

		mvc.perform(get("/api/tickets/" + ticketId + "/qr.svg").header("Authorization", bearer(guests.get(0).token())))
				.andExpect(status().isOk()).andExpect(content().contentTypeCompatibleWith("image/svg+xml"))
				.andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
				.andExpect(content().string(org.hamcrest.Matchers.allOf(
						org.hamcrest.Matchers.startsWith("<svg"), org.hamcrest.Matchers.containsString("<path"))));
		mvc.perform(get("/api/tickets/" + ticketId + "/qr.svg").header("Authorization", bearer(guests.get(1).token())))
				.andExpect(status().isForbidden());
		mvc.perform(get("/api/tickets/987654321/qr.svg").header("Authorization", bearer(guests.get(0).token())))
				.andExpect(status().isNotFound());
		mvc.perform(get("/api/tickets/" + ticketId + "/qr.svg")).andExpect(status().isUnauthorized());
	}

	@Test
	void anOrganizerAcceptsATicketOnceAndThenSeesItWasUsed() throws Exception {
		setUpEvent();
		String code = firstCode(buyTwo(createGuests(1).get(0), 0));

		scan(organizer, code, (long) eventId).andExpect(status().isOk()).andExpect(jsonPath("$.outcome").value("VALID"))
				.andExpect(jsonPath("$.seat").value("Main A1"));
		scan(organizer, code.toLowerCase(), null).andExpect(status().isOk())
				.andExpect(jsonPath("$.outcome").value("ALREADY_USED")).andExpect(jsonPath("$.usedAt").isNotEmpty());
		assertThat(count("select count(*) from ticket where code = :p0 and status = 'USED' and used_at is not null",
				code)).isEqualTo(1);
	}

	@Test
	void unknownCodesAndTicketsForAnotherEventAreTurnedAway() throws Exception {
		setUpEvent();
		String code = firstCode(buyTwo(createGuests(1).get(0), 0));

		scan(organizer, "NOSUCHTICKET", null).andExpect(status().isOk()).andExpect(jsonPath("$.outcome").value("UNKNOWN"));
		scan(organizer, code, eventId + 1L).andExpect(status().isOk())
				.andExpect(jsonPath("$.outcome").value("WRONG_EVENT"));
		assertThat(count("select count(*) from ticket where code = :p0 and status = 'ISSUED'", code)).isEqualTo(1);
	}

	@Test
	void onlyTheEventsOwnOrganizerCanScan() throws Exception {
		setUpEvent();
		String code = firstCode(buyTwo(createGuests(1).get(0), 0));

		scan(organizerToken(), code, null).andExpect(status().isForbidden());
		scan(guestToken(), code, null).andExpect(status().isForbidden());
		mvc.perform(post("/api/tickets/scan").contentType(MediaType.APPLICATION_JSON)
				.content("{\"code\":\"%s\"}".formatted(code))).andExpect(status().isUnauthorized());
		assertThat(count("select count(*) from ticket where code = :p0 and status = 'ISSUED'", code)).isEqualTo(1);
	}

	@Test
	void twentyScannersPresentingOneTicketAtOnceAdmitItExactlyOnce() throws Exception {
		setUpEvent();
		String code = firstCode(buyTwo(createGuests(1).get(0), 0));

		List<String> outcomes = new java.util.concurrent.CopyOnWriteArrayList<>();
		race(20, i -> {
			ResultActions result = scan(organizer, code, null);
			outcomes.add(JsonPath.read(result.andReturn().getResponse().getContentAsString(), "$.outcome"));
			return result;
		});

		assertThat(outcomes).hasSize(20);
		assertThat(outcomes.stream().filter("VALID"::equals).count()).isEqualTo(1);
		assertThat(outcomes.stream().filter("ALREADY_USED"::equals).count()).isEqualTo(19);
	}

}
