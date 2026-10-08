package com.ticketrush.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.Map;

@Configuration
class OpenApiConfig {

	/**
	 * Springdoc marks a field required only when it carries a validation annotation, which leaves a generated
	 * client with every field optional. In this API a field is always present unless it is explicitly nullable
	 * (see {@code @Schema(nullable = true)}), so say so in the contract.
	 */
	@Bean
	OpenApiCustomizer requiredUnlessNullable() {
		return openApi -> {
			if (openApi.getComponents() == null || openApi.getComponents().getSchemas() == null) {
				return;
			}
			for (Schema<?> schema : openApi.getComponents().getSchemas().values()) {
				Map<String, Schema> properties = schema.getProperties();
				if (properties == null) {
					continue;
				}
				schema.setRequired(properties.entrySet().stream().filter(e -> !isNullable(e.getValue()))
						.map(Map.Entry::getKey).toList());
			}
		};
	}

	private static boolean isNullable(Schema<?> property) {
		return Boolean.TRUE.equals(property.getNullable())
				|| (property.getTypes() != null && property.getTypes().contains("null"));
	}

	@Bean
	OpenAPI openApi() {
		return new OpenAPI()
				.info(new Info().title("TicketRush API").version("v1")
						.description("Flash-sale ticketing: waiting room, timed seat holds, idempotent checkout."))
				.components(new Components().addSecuritySchemes("bearer",
						new SecurityScheme().type(SecurityScheme.Type.HTTP).scheme("bearer").bearerFormat("JWT")))
				.addSecurityItem(new SecurityRequirement().addList("bearer"));
	}

}
