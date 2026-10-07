package com.ticketrush.catalog.domain;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FeePolicyTest {

	@Test
	void ninetySixDollarsGetsA720CentFee() {
		assertThat(FeePolicy.fee(9_600)).isEqualTo(720);
		assertThat(FeePolicy.allIn(9_600)).isEqualTo(10_320);
	}

	@Test
	void roundsHalfUpToTheCent() {
		assertThat(FeePolicy.fee(4_500)).isEqualTo(338); // 337.5 -> 338
		assertThat(FeePolicy.fee(6)).isEqualTo(0); // 0.45 -> 0
		assertThat(FeePolicy.fee(7)).isEqualTo(1); // 0.525 -> 1
	}

	@Test
	void matchesThePricesShownInTheDesign() {
		assertThat(FeePolicy.allIn(3_800)).isEqualTo(4_085);
		assertThat(FeePolicy.allIn(2_000)).isEqualTo(2_150);
		assertThat(FeePolicy.allIn(4_700)).isEqualTo(5_053);
		assertThat(FeePolicy.allIn(5_500)).isEqualTo(5_913);
	}

	@Test
	void rejectsNegativePrices() {
		assertThatThrownBy(() -> FeePolicy.fee(-1)).isInstanceOf(IllegalArgumentException.class);
	}

}
