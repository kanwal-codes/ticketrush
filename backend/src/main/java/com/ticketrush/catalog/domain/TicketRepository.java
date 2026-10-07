package com.ticketrush.catalog.domain;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface TicketRepository extends JpaRepository<Ticket, Long> {

	List<Ticket> findByOrderIdOrderById(Long orderId);

	List<Ticket> findByUserIdOrderByIdDesc(Long userId);

	Optional<Ticket> findByCode(String code);

	/**
	 * Accepts a ticket at the door. One conditional update, so when many scanners present the same ticket at once
	 * the database lets exactly one of them change it from ISSUED; the rest see zero rows.
	 */
	@Modifying
	@Query("update Ticket t set t.status = com.ticketrush.catalog.domain.TicketStatus.USED, t.usedAt = :now "
			+ "where t.code = :code and t.status = com.ticketrush.catalog.domain.TicketStatus.ISSUED")
	int markUsed(String code, Instant now);

	/** Read straight from the table, so it reflects a scan made a moment ago by someone else. */
	@Query("select t.usedAt from Ticket t where t.code = :code")
	Instant usedAt(String code);

}
