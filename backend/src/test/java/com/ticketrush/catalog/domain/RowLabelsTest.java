package com.ticketrush.catalog.domain;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RowLabelsTest {

	@Test
	void firstRowsAreSingleLetters() {
		assertThat(RowLabels.of(0)).isEqualTo("A");
		assertThat(RowLabels.of(25)).isEqualTo("Z");
	}

	@Test
	void afterZComesAA() {
		assertThat(RowLabels.of(26)).isEqualTo("AA");
		assertThat(RowLabels.of(27)).isEqualTo("AB");
		assertThat(RowLabels.of(51)).isEqualTo("AZ");
		assertThat(RowLabels.of(52)).isEqualTo("BA");
		assertThat(RowLabels.of(701)).isEqualTo("ZZ");
		assertThat(RowLabels.of(702)).isEqualTo("AAA");
	}

	@Test
	void rejectsNegativeIndex() {
		assertThatThrownBy(() -> RowLabels.of(-1)).isInstanceOf(IllegalArgumentException.class);
	}

}
