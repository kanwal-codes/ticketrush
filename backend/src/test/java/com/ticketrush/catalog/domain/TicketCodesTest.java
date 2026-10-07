package com.ticketrush.catalog.domain;

import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class TicketCodesTest {

	@Test
	void ticketCodesAre26UnambiguousCharactersAndDoNotRepeat() {
		Set<String> seen = new HashSet<>();
		for (int i = 0; i < 20_000; i++) {
			String code = TicketCodes.ticketCode();
			assertThat(code).hasSize(26).matches("[0-9A-HJKMNP-TV-Z]{26}");
			seen.add(code);
		}
		assertThat(seen).hasSize(20_000);
	}

	@Test
	void orderReferencesAreShortAndReadable() {
		assertThat(TicketCodes.orderReference()).matches("TR-[0-9A-HJKMNP-TV-Z]{6}");
	}

}
