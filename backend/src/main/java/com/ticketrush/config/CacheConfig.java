package com.ticketrush.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

/**
 * In-process cache with a very short lifetime for the seat map. It absorbs the burst of identical reads when
 * a drop opens. With several app instances this would move to Redis.
 */
@Configuration
@EnableCaching
class CacheConfig {

	@Bean
	CacheManager cacheManager(@Value("${ticketrush.cache.seatmap-ttl}") Duration seatMapTtl) {
		CaffeineCacheManager manager = new CaffeineCacheManager("seatmaps");
		manager.setCaffeine(Caffeine.newBuilder().expireAfterWrite(seatMapTtl).maximumSize(2_000));
		return manager;
	}

}
