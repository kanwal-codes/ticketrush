package com.ticketrush.catalog.domain;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface OutboxEventRepository extends JpaRepository<OutboxEvent, Long> {

	long countByPublishedAtIsNull();

	/** Rows that failed this many times stay in the table for a person to look at and are no longer retried. */
	int MAX_ATTEMPTS = 20;

	/** Oldest undelivered rows, not locked: only a list of work to try. */
	@Query(value = "select id from outbox_event where published_at is null and attempts < " + MAX_ATTEMPTS
			+ " order by id limit :limit", nativeQuery = true)
	List<Long> undeliveredIds(int limit);

	/** Locks one undelivered row. A row another relay is working on is skipped, so relays never block each other. */
	@Query(value = "select * from outbox_event where id = :id and published_at is null for update skip locked",
			nativeQuery = true)
	Optional<OutboxEvent> lockUndelivered(long id);

}
