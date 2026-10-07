package com.ticketrush.catalog.domain;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface TicketRepository extends JpaRepository<Ticket, Long> {

	List<Ticket> findByOrderIdOrderById(Long orderId);

	List<Ticket> findByUserIdOrderByIdDesc(Long userId);

	Optional<Ticket> findByCode(String code);

}
