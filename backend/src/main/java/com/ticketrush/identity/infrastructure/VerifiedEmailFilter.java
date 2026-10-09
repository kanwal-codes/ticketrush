package com.ticketrush.identity.infrastructure;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpMethod;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.web.util.matcher.RequestMatcher;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Joining a queue, holding seats and paying need a confirmed email address, so a bot cannot sign up with addresses
 * it does not own and go straight to the queue. Browsing, signing in and seeing your own tickets do not. The answer
 * comes from the token's {@code email_verified} claim; a token without the claim (issued before this existed) is let through.
 */
class VerifiedEmailFilter extends OncePerRequestFilter {

	private static final RequestMatcher NEEDS_CONFIRMED_EMAIL = request -> {
		PathPatternRequestMatcher.Builder paths = PathPatternRequestMatcher.withDefaults();
		return paths.matcher(HttpMethod.POST, "/api/events/*/queue").matches(request)
				|| paths.matcher(HttpMethod.POST, "/api/events/*/holds").matches(request)
				|| paths.matcher(HttpMethod.POST, "/api/orders").matches(request);
	};

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		Authentication auth = SecurityContextHolder.getContext().getAuthentication();
		if (NEEDS_CONFIRMED_EMAIL.matches(request) && auth != null && auth.getPrincipal() instanceof Jwt jwt
				&& Boolean.FALSE.equals(jwt.getClaim("email_verified"))) {
			response.setStatus(403);
			response.setContentType("application/problem+json");
			response.getWriter().write("{\"type\":\"about:blank\",\"title\":\"Confirm your email\",\"status\":403,"
					+ "\"code\":\"EMAIL_NOT_VERIFIED\",\"detail\":\"Confirm your email address first. We sent you a link when "
					+ "you signed up, and you can ask for a new one.\"}");
			return;
		}
		chain.doFilter(request, response);
	}

}
