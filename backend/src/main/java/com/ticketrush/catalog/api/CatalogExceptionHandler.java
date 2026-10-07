package com.ticketrush.catalog.api;

import com.ticketrush.catalog.application.NotFoundException;
import com.ticketrush.catalog.application.NotOwnerException;
import com.ticketrush.catalog.application.RuleViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(basePackageClasses = CatalogExceptionHandler.class)
class CatalogExceptionHandler {

	@ExceptionHandler(RuleViolationException.class)
	ProblemDetail ruleViolation(RuleViolationException e) {
		return problem(HttpStatus.BAD_REQUEST, "Request rejected", e.getMessage());
	}

	@ExceptionHandler(NotFoundException.class)
	ProblemDetail notFound(NotFoundException e) {
		return problem(HttpStatus.NOT_FOUND, "Not found", e.getMessage());
	}

	@ExceptionHandler(NotOwnerException.class)
	ProblemDetail notOwner(NotOwnerException e) {
		return problem(HttpStatus.FORBIDDEN, "Not allowed", e.getMessage());
	}

	private static ProblemDetail problem(HttpStatus status, String title, String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
		problem.setTitle(title);
		return problem;
	}

}
