package com.ticketrush.partner.domain;

import java.util.List;

/** Upcoming events from another ticket seller. Empty when it is not set up or cannot be reached. */
public interface PartnerEvents {

	/** @param city exact city name, or blank for the default one; @param q free text, or blank */
	List<PartnerEvent> search(String city, String q, int size);

}
