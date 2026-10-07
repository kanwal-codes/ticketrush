package com.ticketrush.catalog.domain;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface SeatHoldRepository extends JpaRepository<SeatHold, Long> {

	Optional<SeatHold> findByEventIdAndUserIdAndStatus(Long eventId, Long userId, HoldStatus status);

}
