package com.ticketrush.catalog.domain;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface VenueSectionRepository extends JpaRepository<VenueSection, Long> {

	List<VenueSection> findByVenueIdOrderBySortOrder(Long venueId);

}
