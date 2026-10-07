package com.ticketrush.catalog.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "venue_section")
public class VenueSection {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "venue_id", nullable = false)
	private Long venueId;

	@Column(nullable = false)
	private String name;

	@Column(name = "sort_order", nullable = false)
	private int sortOrder;

	protected VenueSection() {
	}

	public VenueSection(Long venueId, String name, int sortOrder) {
		this.venueId = venueId;
		this.name = name;
		this.sortOrder = sortOrder;
	}

	public Long getId() {
		return id;
	}

	public Long getVenueId() {
		return venueId;
	}

	public String getName() {
		return name;
	}

}
