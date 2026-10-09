package com.ticketrush.security;

import com.ticketrush.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

/**
 * Who may call what, for every endpoint the app has. Each one is listed below as open to anyone, to any signed-in guest, or to
 * organizers only, and the test calls it as an anonymous caller, a guest and an organizer to see that the rules in
 * SecurityConfig say the same. An endpoint that is not listed fails the test, so adding one means deciding who may use it.
 */
class AuthorizationMatrixIntegrationTest extends AbstractIntegrationTest {

	@Autowired
	@Qualifier("requestMappingHandlerMapping")
	private RequestMappingHandlerMapping mappings;

	/** Anyone, with no sign-in. */
	private static final Set<String> OPEN = Set.of(
			"POST /api/auth/register", "POST /api/auth/login", "POST /api/auth/forgot-password",
			"POST /api/auth/reset-password", "POST /api/auth/verify-email",
			"GET /api/events", "GET /api/events/{id}", "GET /api/events/{id}/seats");

	/** Any signed-in guest. What they may do to a particular order or hold is checked in the service, and tested there. */
	private static final Set<String> GUEST = Set.of(
			"POST /api/auth/refresh", "POST /api/auth/verify-email/resend", "GET /api/me", "GET /api/me/export", "POST /api/me/close",
			"POST /api/events/{eventId}/holds", "GET /api/events/{eventId}/holds/me", "DELETE /api/holds/{id}",
			"POST /api/events/{eventId}/queue", "GET /api/events/{eventId}/queue", "DELETE /api/events/{eventId}/queue",
			"GET /api/events/{eventId}/queue/stream",
			"POST /api/orders", "GET /api/orders", "GET /api/orders/{id}", "GET /api/tickets", "GET /api/tickets/{id}/qr.svg");

	/** Organizers only. */
	private static final Set<String> ORGANIZER = Set.of(
			"POST /api/events", "PUT /api/events/{id}", "POST /api/events/{id}/publish", "POST /api/events/{id}/cancel",
			"POST /api/venues", "GET /api/venues/{id}",
			"GET /api/organizer/events", "GET /api/organizer/events/{id}", "GET /api/organizer/events/{id}/summary",
			"GET /api/organizer/events/{id}/scans", "GET /api/organizer/venues", "GET /api/organizer/events/{eventId}/queue",
			"POST /api/tickets/scan");

	/** Endpoints that belong to the framework or to the management port, not to the app's API. */
	private static boolean framework(String pattern) {
		return pattern.startsWith("/v3/api-docs") || pattern.startsWith("/swagger-ui") || pattern.equals("/error")
				|| pattern.startsWith("/actuator");
	}

	private record Endpoint(String method, String pattern) {

		String key() {
			return method + " " + pattern;
		}

		String url() {
			return pattern.replaceAll("\\{[^}]+}", "1");
		}

	}

	private List<Endpoint> endpoints() {
		List<Endpoint> found = new ArrayList<>();
		for (RequestMappingInfo info : mappings.getHandlerMethods().keySet()) {
			for (String pattern : info.getPathPatternsCondition().getPatternValues()) {
				if (framework(pattern)) {
					continue;
				}
				Set<RequestMethod> methods = info.getMethodsCondition().getMethods();
				for (RequestMethod method : methods) {
					found.add(new Endpoint(method.name(), pattern));
				}
			}
		}
		return found;
	}

	private MockHttpServletResponse call(Endpoint endpoint, String token) throws Exception {
		var request = request(org.springframework.http.HttpMethod.valueOf(endpoint.method()), endpoint.url())
				.contentType(MediaType.APPLICATION_JSON).content("{}");
		if (token != null) {
			request.header("Authorization", bearer(token));
		}
		return mvc.perform(request).andReturn().getResponse();
	}

	/** Spring Security's own refusal of a signed-in caller who lacks the role, as opposed to the app answering 403 itself. */
	private static boolean refusedForRole(MockHttpServletResponse response) {
		return response.getStatus() == 403 && String.valueOf(response.getHeader("WWW-Authenticate")).contains("insufficient_scope");
	}

	@Test
	void everyEndpointIsClassifiedExactlyOnce() {
		Set<String> all = new TreeSet<>();
		endpoints().forEach(e -> all.add(e.key()));
		Set<String> classified = new TreeSet<>();
		for (Set<String> group : List.of(OPEN, GUEST, ORGANIZER)) {
			for (String key : group) {
				assertThat(classified.add(key)).as("%s is listed twice", key).isTrue();
			}
		}
		Set<String> unlisted = new TreeSet<>(all);
		unlisted.removeAll(classified);
		Set<String> gone = new TreeSet<>(classified);
		gone.removeAll(all);
		assertThat(unlisted).as("Endpoints with no entry here: who may call them?").isEmpty();
		assertThat(gone).as("Entries here that match no endpoint").isEmpty();
	}

	@Test
	void anonymousCallersAreTurnedAwayFromEverythingThatIsNotOpen() throws Exception {
		for (Endpoint endpoint : endpoints()) {
			MockHttpServletResponse response = call(endpoint, null);
			if (OPEN.contains(endpoint.key())) {
				assertThat(response.getStatus()).as(endpoint.key()).isNotIn(401, 403);
			}
			else {
				assertThat(response.getStatus()).as(endpoint.key()).isEqualTo(401);
			}
		}
	}

	@Test
	void aGuestIsRefusedEverythingForOrganizersAndIsNotRefusedTheRest() throws Exception {
		String guest = guestToken();
		for (Endpoint endpoint : endpoints()) {
			MockHttpServletResponse response = call(endpoint, guest);
			if (ORGANIZER.contains(endpoint.key())) {
				assertThat(refusedForRole(response)).as("%s must refuse a guest (answered %d)", endpoint.key(), response.getStatus()).isTrue();
			}
			else {
				assertThat(response.getStatus()).as(endpoint.key()).isNotEqualTo(401);
				assertThat(refusedForRole(response)).as("%s must not refuse a guest for lack of a role", endpoint.key()).isFalse();
			}
		}
	}

	@Test
	void anOrganizerIsNotRefusedForLackOfARole() throws Exception {
		String organizer = organizerToken();
		for (Endpoint endpoint : endpoints()) {
			// Closing the account is not something to do to the account these tests share.
			if (endpoint.key().equals("POST /api/me/close")) {
				continue;
			}
			MockHttpServletResponse response = call(endpoint, organizer);
			assertThat(response.getStatus()).as(endpoint.key()).isNotEqualTo(401);
			assertThat(refusedForRole(response)).as(endpoint.key()).isFalse();
		}
	}

}
