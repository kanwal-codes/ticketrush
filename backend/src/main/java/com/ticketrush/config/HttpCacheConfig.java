package com.ticketrush.config;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.filter.ShallowEtagHeaderFilter;

/** Adds an ETag to public event responses so unchanged seat maps can answer 304 Not Modified. */
@Configuration
class HttpCacheConfig {

	@Bean
	FilterRegistrationBean<ShallowEtagHeaderFilter> eventEtagFilter() {
		ShallowEtagHeaderFilter etag = new ShallowEtagHeaderFilter() {
			@Override
			protected boolean shouldNotFilter(HttpServletRequest request) {
				// The filter buffers whole responses. Live streams must never be buffered, and a guest's own
				// holds are not public data.
				String uri = request.getRequestURI();
				return uri.contains("/queue") || uri.contains("/holds");
			}
		};
		FilterRegistrationBean<ShallowEtagHeaderFilter> registration = new FilterRegistrationBean<>(etag);
		registration.addUrlPatterns("/api/events/*");
		registration.setName("eventEtagFilter");
		return registration;
	}

}
