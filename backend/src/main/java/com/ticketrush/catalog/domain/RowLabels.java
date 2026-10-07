package com.ticketrush.catalog.domain;

/** Row labels like a spreadsheet's columns: A to Z, then AA, AB and so on. */
public final class RowLabels {

	private RowLabels() {
	}

	/** Label for the zero-based row index. */
	public static String of(int index) {
		if (index < 0) {
			throw new IllegalArgumentException("Row index cannot be negative");
		}
		StringBuilder label = new StringBuilder();
		int n = index;
		do {
			label.append((char) ('A' + n % 26));
			n = n / 26 - 1;
		} while (n >= 0);
		return label.reverse().toString();
	}

}
