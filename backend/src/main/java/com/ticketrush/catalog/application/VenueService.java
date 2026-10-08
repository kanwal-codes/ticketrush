package com.ticketrush.catalog.application;

import com.ticketrush.catalog.domain.RowLabels;
import com.ticketrush.catalog.domain.SeatStore;
import com.ticketrush.catalog.domain.SeatStore.SectionSize;
import com.ticketrush.catalog.domain.Venue;
import com.ticketrush.catalog.domain.VenueRepository;
import com.ticketrush.catalog.domain.VenueSection;
import com.ticketrush.catalog.domain.VenueSectionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
public class VenueService {

	static final int MAX_SEATS = 5_000;

	private final VenueRepository venues;
	private final VenueSectionRepository sections;
	private final SeatStore seats;

	public VenueService(VenueRepository venues, VenueSectionRepository sections, SeatStore seats) {
		this.venues = venues;
		this.sections = sections;
		this.seats = seats;
	}

	public record SectionSpec(String name, int rows, int seatsPerRow) {
	}

	public record SectionView(long id, String name, int seats) {
	}

	public record VenueView(long id, String name, String city, int totalSeats, List<SectionView> sections) {
	}

	/** Creates a venue and generates every seat (rows A, B, ... with numbered seats) in one transaction. */
	@Transactional
	public VenueView create(long ownerId, String name, String city, List<SectionSpec> specs) {
		int total = specs.stream().mapToInt(s -> s.rows() * s.seatsPerRow()).sum();
		if (total > MAX_SEATS) {
			throw new RuleViolationException(
					"A venue can have at most " + MAX_SEATS + " seats, and this layout has " + total);
		}
		Set<String> names = new HashSet<>();
		for (SectionSpec spec : specs) {
			if (!names.add(spec.name().strip().toLowerCase(Locale.ROOT))) {
				throw new RuleViolationException("Section names must be unique, but '" + spec.name() + "' repeats");
			}
		}

		Venue venue = venues.save(new Venue(ownerId, name.strip(), city.strip()));
		for (int i = 0; i < specs.size(); i++) {
			SectionSpec spec = specs.get(i);
			VenueSection section = sections.save(new VenueSection(venue.getId(), spec.name().strip(), i));
			for (int row = 0; row < spec.rows(); row++) {
				seats.generateRow(section.getId(), RowLabels.of(row), spec.seatsPerRow());
			}
		}
		return get(venue.getId());
	}

	/** The organizer's own venues, A to Z. */
	@Transactional(readOnly = true)
	public List<VenueView> ownedBy(long ownerId) {
		return venues.findByOwnerIdOrderByNameAsc(ownerId).stream().map(v -> get(v.getId())).toList();
	}

	@Transactional(readOnly = true)
	public VenueView get(long id) {
		Venue venue = venues.findById(id).orElseThrow(() -> new NotFoundException("Venue " + id + " not found"));
		List<SectionSize> sizes = seats.sectionSizes(id);
		List<SectionView> views = sizes.stream().map(s -> new SectionView(s.sectionId(), s.name(), s.seats())).toList();
		return new VenueView(venue.getId(), venue.getName(), venue.getCity(),
				sizes.stream().mapToInt(SectionSize::seats).sum(), views);
	}

}
