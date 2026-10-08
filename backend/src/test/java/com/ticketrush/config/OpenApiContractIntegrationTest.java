package com.ticketrush.config;

import com.jayway.jsonpath.JsonPath;
import com.ticketrush.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The web app's types are generated from this document, so what is required and what can be null matters. */
class OpenApiContractIntegrationTest extends AbstractIntegrationTest {

	private String docs() throws Exception {
		return mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse()
				.getContentAsString();
	}

	private List<String> required(String schema) throws Exception {
		return JsonPath.read(docs(), "$.components.schemas." + schema + ".required");
	}

	@Test
	void fieldsAreRequiredUnlessTheyCanBeNull() throws Exception {
		assertThat(required("EventDetail")).contains("id", "title", "serverTime", "tiers", "poster", "waitingRoom");
		assertThat(required("HoldView")).contains("id", "expiresAt", "serverTime", "seats", "totalCents");
		assertThat(required("OrderView")).contains("id", "status", "totalCents", "seats", "tickets")
				.doesNotContain("failureReason", "paidAt");
		assertThat(required("QueueView")).contains("state", "aheadOfYou", "queueLength", "serverTime")
				.doesNotContain("position", "admissionToken", "admittedUntil");
		assertThat(required("ScanResult")).contains("outcome").doesNotContain("seat", "usedAt");
		assertThat(required("TierRow")).contains("sectionId", "name", "total", "sold", "held", "available")
				.doesNotContain("priceCents");
		assertThat(required("SalesSummary")).contains("eventId", "status", "tiers", "revenue", "ordersByStatus", "door");
		assertThat(required("ScanRow")).contains("code", "outcome", "at").doesNotContain("seat");
		assertThat(required("Depth")).contains("waiting", "inside");
		assertThat(required("RegisterRequest")).contains("email", "password", "displayName").doesNotContain("turnstileToken");
		assertThat(required("OrganizerEvent")).contains("id", "status", "title", "venueId", "poster", "prices", "waitingRoom");
		assertThat(required("PageViewEventRow")).contains("items", "page", "totalItems", "totalPages");
	}

	@Test
	void nullableFieldsAreDescribedAsNullable() throws Exception {
		Object type = JsonPath.read(docs(), "$.components.schemas.QueueView.properties.position.type");
		assertThat(type.toString()).contains("null");
	}

}
