package com.ticketrush;

import org.springframework.boot.SpringApplication;

public class TestTicketrushBackendApplication {

	public static void main(String[] args) {
		SpringApplication.from(TicketrushBackendApplication::main).with(TestcontainersConfiguration.class).run(args);
	}

}
