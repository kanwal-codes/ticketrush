package com.ticketrush.identity;

import com.jayway.jsonpath.JsonPath;
import com.ticketrush.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** A fresh database with no demo data still gets its first organizer, from configuration. */
@TestPropertySource(properties = { "ticketrush.bootstrap.organizer-email=first@ticketrush.test",
		"ticketrush.bootstrap.organizer-password=a-long-bootstrap-pass" })
class OrganizerBootstrapIntegrationTest extends AbstractIntegrationTest {

	@Test
	void theConfiguredOrganizerCanSignInAndRunsTheConsole() throws Exception {
		String login = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"first@ticketrush.test\",\"password\":\"a-long-bootstrap-pass\"}"))
				.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
		String token = "Bearer " + JsonPath.read(login, "$.accessToken");

		mvc.perform(get("/api/me").header("Authorization", token)).andExpect(jsonPath("$.role").value("ORGANIZER"));
		mvc.perform(get("/api/organizer/events").header("Authorization", token)).andExpect(status().isOk());
		assertThat(count("select count(*) from app_user where lower(email) = 'first@ticketrush.test'")).isEqualTo(1);
	}

	private int count(String sql) {
		return jdbc.sql(sql).query(Integer.class).single();
	}

}
