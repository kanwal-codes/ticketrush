package com.ticketrush.catalog.domain;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class SaleStateTest {

	private static final Instant DROP = Instant.parse("2026-11-01T09:50:00Z");
	private static final Instant SALE = Instant.parse("2026-11-01T10:00:00Z");
	private static final Instant START = Instant.parse("2026-11-14T20:00:00Z");

	private static SaleState at(String instant) {
		return SaleState.at(DROP, SALE, START, Instant.parse(instant));
	}

	@Test
	void beforeTheWaitingRoomOpens() {
		assertThat(at("2026-11-01T09:49:59Z")).isEqualTo(SaleState.UPCOMING);
	}

	@Test
	void boundariesBelongToTheLaterState() {
		assertThat(at("2026-11-01T09:50:00Z")).isEqualTo(SaleState.QUEUE_OPEN);
		assertThat(at("2026-11-01T09:59:59Z")).isEqualTo(SaleState.QUEUE_OPEN);
		assertThat(at("2026-11-01T10:00:00Z")).isEqualTo(SaleState.ON_SALE);
		assertThat(at("2026-11-14T19:59:59Z")).isEqualTo(SaleState.ON_SALE);
		assertThat(at("2026-11-14T20:00:00Z")).isEqualTo(SaleState.ENDED);
	}

}
