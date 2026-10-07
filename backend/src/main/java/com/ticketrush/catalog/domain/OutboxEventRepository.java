package com.ticketrush.catalog.domain;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface OutboxEventRepository extends JpaRepository<OutboxEvent, Long> {

	/** Oldest undelivered rows, locked. Rows another relay holds are skipped, so relays never block each other. */
	@Query(value = "select * from outbox_event where published_at is null order by id limit :limit "
			+ "for update skip locked", nativeQuery = true)
	List<OutboxEvent> lockUnpublished(int limit);

}
