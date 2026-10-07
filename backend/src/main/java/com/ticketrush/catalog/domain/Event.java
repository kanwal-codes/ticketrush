package com.ticketrush.catalog.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "event")
public class Event {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "organizer_id", nullable = false)
	private Long organizerId;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "venue_id")
	private Venue venue;

	@Column(nullable = false)
	private String title;

	@Column(nullable = false)
	private String artist;

	@Column(nullable = false)
	private String description;

	@Column(name = "starts_at", nullable = false)
	private Instant startsAt;

	@Column(name = "doors_at", nullable = false)
	private Instant doorsAt;

	@Column(name = "drop_opens_at", nullable = false)
	private Instant dropOpensAt;

	@Column(name = "on_sale_at", nullable = false)
	private Instant onSaleAt;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private EventStatus status = EventStatus.DRAFT;

	@Enumerated(EnumType.STRING)
	@Column(name = "poster_style", nullable = false)
	private PosterStyle posterStyle;

	@Column(name = "ink_one", nullable = false)
	private String inkOne;

	@Column(name = "ink_two", nullable = false)
	private String inkTwo;

	@Column(name = "paper_color", nullable = false)
	private String paperColor;

	@Column(name = "queue_enabled", nullable = false)
	private boolean queueEnabled;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt = Instant.now();

	protected Event() {
	}

	public Event(Long organizerId, Venue venue, String title, String artist, String description, Instant startsAt,
			Instant doorsAt, Instant dropOpensAt, Instant onSaleAt, PosterStyle posterStyle, String inkOne,
			String inkTwo, String paperColor, boolean queueEnabled) {
		this.organizerId = organizerId;
		this.venue = venue;
		this.title = title;
		this.artist = artist;
		this.description = description;
		this.startsAt = startsAt;
		this.doorsAt = doorsAt;
		this.dropOpensAt = dropOpensAt;
		this.onSaleAt = onSaleAt;
		this.posterStyle = posterStyle;
		this.inkOne = inkOne;
		this.inkTwo = inkTwo;
		this.paperColor = paperColor;
		this.queueEnabled = queueEnabled;
	}

	public boolean isOwnedBy(long organizerId) {
		return this.organizerId == organizerId;
	}

	public void markPublished() {
		this.status = EventStatus.PUBLISHED;
	}

	public void markCancelled() {
		this.status = EventStatus.CANCELLED;
	}

	public Long getId() {
		return id;
	}

	public Long getOrganizerId() {
		return organizerId;
	}

	public Venue getVenue() {
		return venue;
	}

	public String getTitle() {
		return title;
	}

	public String getArtist() {
		return artist;
	}

	public String getDescription() {
		return description;
	}

	public Instant getStartsAt() {
		return startsAt;
	}

	public Instant getDoorsAt() {
		return doorsAt;
	}

	public Instant getDropOpensAt() {
		return dropOpensAt;
	}

	public Instant getOnSaleAt() {
		return onSaleAt;
	}

	public EventStatus getStatus() {
		return status;
	}

	public PosterStyle getPosterStyle() {
		return posterStyle;
	}

	public String getInkOne() {
		return inkOne;
	}

	public String getInkTwo() {
		return inkTwo;
	}

	public String getPaperColor() {
		return paperColor;
	}

	/** True when guests must pass through the waiting room before they can hold seats. */
	public boolean isQueueEnabled() {
		return queueEnabled;
	}

	public SaleState saleState(Instant now) {
		return SaleState.at(dropOpensAt, onSaleAt, startsAt, now);
	}

}
