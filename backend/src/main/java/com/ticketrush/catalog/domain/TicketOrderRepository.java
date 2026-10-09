package com.ticketrush.catalog.domain;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface TicketOrderRepository extends JpaRepository<TicketOrder, Long> {

	/** Locks the row, so two settlements of one order run one after the other. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select o from TicketOrder o where o.id = :id")
	Optional<TicketOrder> findByIdForUpdate(Long id);

	boolean existsByHoldIdAndStatusIn(Long holdId, Collection<OrderStatus> statuses);

	List<TicketOrder> findByUserIdOrderByIdDesc(Long userId);

	boolean existsByUserIdAndStatusIn(Long userId, Collection<OrderStatus> statuses);

	/** Every order of the event that was paid for and has not been refunded. */
	@Query("select o from TicketOrder o where o.eventId = :eventId and o.status = com.ticketrush.catalog.domain.OrderStatus.PAID")
	List<TicketOrder> findPaidByEventId(Long eventId);

	List<TicketOrder> findByStatusAndCreatedAtBefore(OrderStatus status, Instant before);

}
