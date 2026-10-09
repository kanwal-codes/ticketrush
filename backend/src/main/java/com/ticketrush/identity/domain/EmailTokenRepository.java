package com.ticketrush.identity.domain;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.time.Instant;
import java.util.Optional;

public interface EmailTokenRepository extends JpaRepository<EmailToken, Long> {

	Optional<EmailToken> findByTokenHashAndKind(String tokenHash, String kind);

	Optional<EmailToken> findFirstByUserIdAndKindOrderByCreatedAtDesc(Long userId, String kind);

	/** Once a new password is chosen, any other reset link still out there must stop working. */
	@Modifying
	@Query("update EmailToken t set t.usedAt = :now where t.userId = :userId and t.kind = :kind and t.usedAt is null")
	int retireAll(Long userId, String kind, Instant now);

}
