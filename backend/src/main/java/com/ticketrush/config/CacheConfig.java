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
 * In-process caches with very short lifetimes. The seat map absorbs the burst of identical reads when a drop
 * opens, and the event schedule is asked on every waiting-room request. With several app instances these
 * would move to Redis.
 */
@Configuration
@EnableCaching
class CacheConfig {

	@Bean
	CacheManager cacheManager(@Value("${ticketrush.cache.seatmap-ttl}") Duration seatMapTtl,
			@Value("${ticketrush.cache.event-schedule-ttl}") Duration scheduleTtl) {
		CaffeineCacheManager manager = new CaffeineCacheManager();
		manager.registerCustomCache("seatmaps", cache(seatMapTtl));
		manager.registerCustomCache("eventschedule", cache(scheduleTtl));
		return manager;
	}

	private static com.github.benmanes.caffeine.cache.Cache<Object, Object> cache(Duration ttl) {
		return Caffeine.newBuilder().expireAfterWrite(ttl).maximumSize(2_000).build();
	}

}
