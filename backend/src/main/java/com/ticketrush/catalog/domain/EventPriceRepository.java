package com.ticketrush.catalog.domain;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.Collection;
import java.util.List;

public interface EventPriceRepository extends JpaRepository<EventPrice, Long> {

	List<EventPrice> findByEventId(Long eventId);

	@Query("select p.eventId as eventId, min(p.priceCents) as minCents from EventPrice p "
			+ "where p.eventId in :eventIds group by p.eventId")
	List<MinPrice> minPrices(Collection<Long> eventIds);

	interface MinPrice {

		Long getEventId();

		Integer getMinCents();

	}

}
