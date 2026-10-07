package com.ticketrush.catalog.application;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;

import java.util.Map;

/** Draws a QR code as an SVG: one square per dark module, on white, with the 4-module quiet zone scanners need. */
final class QrSvg {

	private static final int QUIET = 4;

	private QrSvg() {
	}

	static String of(String text) {
		BitMatrix matrix;
		try {
			matrix = new QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, 0, 0,
					Map.of(EncodeHintType.MARGIN, 0, EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M));
		}
		catch (WriterException e) {
			throw new IllegalStateException("Could not draw a QR code", e);
		}
		int size = matrix.getWidth() + 2 * QUIET;
		StringBuilder path = new StringBuilder();
		for (int y = 0; y < matrix.getHeight(); y++) {
			for (int x = 0; x < matrix.getWidth(); x++) {
				if (matrix.get(x, y)) {
					path.append('M').append(x + QUIET).append(' ').append(y + QUIET).append("h1v1h-1z");
				}
			}
		}
		return "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 " + size + " " + size
				+ "\" shape-rendering=\"crispEdges\" role=\"img\" aria-label=\"Ticket QR code\">"
				+ "<rect width=\"" + size + "\" height=\"" + size + "\" fill=\"#fff\"/>"
				+ "<path fill=\"#000\" d=\"" + path + "\"/></svg>";
	}

}
