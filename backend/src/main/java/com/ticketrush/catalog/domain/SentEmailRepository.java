package com.ticketrush.catalog.domain;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface SentEmailRepository extends JpaRepository<SentEmail, Long> {

	boolean existsByOrderIdAndKind(Long orderId, String kind);

	/** Oldest messages not yet sent, not locked: only a list of work to try. */
	@Query(value = "select id from sent_email where sent_at is null and attempts < " + SentEmail.MAX_ATTEMPTS
			+ " order by id limit :limit", nativeQuery = true)
	List<Long> unsentIds(int limit);

	/** Locks one unsent message. One another relay is working on is skipped, so relays never block each other. */
	@Query(value = "select * from sent_email where id = :id and sent_at is null for update skip locked", nativeQuery = true)
	Optional<SentEmail> lockUnsent(long id);

}
