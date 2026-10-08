package com.ticketrush.catalog.domain;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface VenueRepository extends JpaRepository<Venue, Long> {

	List<Venue> findByOwnerIdOrderByNameAsc(Long ownerId);

}
