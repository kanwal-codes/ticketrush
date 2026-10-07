package com.ticketrush.config;

import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.filter.ShallowEtagHeaderFilter;

/** Adds an ETag to public event responses so unchanged seat maps can answer 304 Not Modified. */
@Configuration
class HttpCacheConfig {

	@Bean
	FilterRegistrationBean<ShallowEtagHeaderFilter> eventEtagFilter() {
		FilterRegistrationBean<ShallowEtagHeaderFilter> registration = new FilterRegistrationBean<>(
				new ShallowEtagHeaderFilter());
		registration.addUrlPatterns("/api/events/*");
		registration.setName("eventEtagFilter");
		return registration;
	}

}
