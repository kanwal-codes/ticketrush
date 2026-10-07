package com.ticketrush.catalog.domain;

import org.springframework.data.jpa.repository.JpaRepository;

public interface SentEmailRepository extends JpaRepository<SentEmail, Long> {

	boolean existsByOrderIdAndKind(Long orderId, String kind);

}
