package com.ticketrush.queue.api;

import com.ticketrush.queue.application.EventNotFoundException;
import com.ticketrush.queue.application.TooManyRequestsException;
import com.ticketrush.queue.application.WaitingRoomClosedException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(basePackageClasses = QueueExceptionHandler.class)
class QueueExceptionHandler {

	@ExceptionHandler(EventNotFoundException.class)
	ProblemDetail notFound(EventNotFoundException e) {
		return problem(HttpStatus.NOT_FOUND, "Not found", e.getMessage());
	}

	@ExceptionHandler(WaitingRoomClosedException.class)
	ProblemDetail closed(WaitingRoomClosedException e) {
		return problem(HttpStatus.CONFLICT, "Waiting room closed", e.getMessage());
	}

	@ExceptionHandler(TooManyRequestsException.class)
	ResponseEntity<ProblemDetail> tooMany(TooManyRequestsException e) {
		return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
				.header(HttpHeaders.RETRY_AFTER, String.valueOf(e.getRetryAfterSeconds()))
				.body(problem(HttpStatus.TOO_MANY_REQUESTS, "Slow down", e.getMessage()));
	}

	private static ProblemDetail problem(HttpStatus status, String title, String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
		problem.setTitle(title);
		return problem;
	}

}
