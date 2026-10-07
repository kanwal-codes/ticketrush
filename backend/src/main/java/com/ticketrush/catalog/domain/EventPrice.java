package com.ticketrush.catalog.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Face price in cents for one section of one event. */
@Entity
@Table(name = "event_price")
public class EventPrice {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "event_id", nullable = false)
	private Long eventId;

	@Column(name = "section_id", nullable = false)
	private Long sectionId;

	@Column(name = "price_cents", nullable = false)
	private int priceCents;

	protected EventPrice() {
	}

	public EventPrice(Long eventId, Long sectionId, int priceCents) {
		this.eventId = eventId;
		this.sectionId = sectionId;
		this.priceCents = priceCents;
	}

	public Long getEventId() {
		return eventId;
	}

	public Long getSectionId() {
		return sectionId;
	}

	public int getPriceCents() {
		return priceCents;
	}

}
