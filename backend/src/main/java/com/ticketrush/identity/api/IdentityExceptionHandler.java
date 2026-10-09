package com.ticketrush.identity.api;

import com.ticketrush.identity.application.BotCheckFailedException;
import com.ticketrush.identity.application.BotCheckUnavailableException;
import com.ticketrush.identity.application.DuplicateEmailException;
import com.ticketrush.identity.application.InvalidCredentialsException;
import com.ticketrush.identity.application.InvalidLinkException;
import com.ticketrush.identity.application.SessionExpiredException;
import com.ticketrush.identity.application.TooSoonException;
import com.ticketrush.identity.application.UserNotFoundException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(basePackageClasses = AuthController.class)
class IdentityExceptionHandler {

	@ExceptionHandler(DuplicateEmailException.class)
	ProblemDetail duplicateEmail(DuplicateEmailException e) {
		return problem(HttpStatus.CONFLICT, "Email already registered", e.getMessage());
	}

	@ExceptionHandler(InvalidCredentialsException.class)
	ProblemDetail invalidCredentials(InvalidCredentialsException e) {
		return problem(HttpStatus.UNAUTHORIZED, "Sign-in failed", e.getMessage());
	}

	@ExceptionHandler(SessionExpiredException.class)
	ProblemDetail sessionExpired(SessionExpiredException e) {
		return problem(HttpStatus.UNAUTHORIZED, "Session ended", e.getMessage());
	}

	@ExceptionHandler(BotCheckFailedException.class)
	ProblemDetail botCheckFailed(BotCheckFailedException e) {
		return problem(HttpStatus.BAD_REQUEST, "Check not passed", e.getMessage());
	}

	@ExceptionHandler(BotCheckUnavailableException.class)
	ProblemDetail botCheckUnavailable(BotCheckUnavailableException e) {
		return problem(HttpStatus.SERVICE_UNAVAILABLE, "Check unavailable", e.getMessage());
	}

	@ExceptionHandler(InvalidLinkException.class)
	ProblemDetail invalidLink(InvalidLinkException e) {
		return problem(HttpStatus.BAD_REQUEST, "Link not valid", e.getMessage());
	}

	@ExceptionHandler(TooSoonException.class)
	ProblemDetail tooSoon(TooSoonException e) {
		return problem(HttpStatus.TOO_MANY_REQUESTS, "Slow down", e.getMessage());
	}

	@ExceptionHandler(UserNotFoundException.class)
	ProblemDetail userNotFound(UserNotFoundException e) {
		return problem(HttpStatus.NOT_FOUND, "User not found", e.getMessage());
	}

	private static ProblemDetail problem(HttpStatus status, String title, String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
		problem.setTitle(title);
		return problem;
	}

}
