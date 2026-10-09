package com.ticketrush.identity.api;

import com.ticketrush.identity.application.AuthService;
import com.ticketrush.identity.application.BotCheck;
import com.ticketrush.identity.application.TokenIssuer.IssuedToken;
import com.ticketrush.identity.domain.User;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;

@RestController
@RequestMapping("/api")
class AuthController {

	private final AuthService auth;
	private final BotCheck botCheck;

	AuthController(AuthService auth, BotCheck botCheck) {
		this.auth = auth;
		this.botCheck = botCheck;
	}

	@PostMapping("/auth/register")
	@ResponseStatus(HttpStatus.CREATED)
	UserResponse register(HttpServletRequest http, @Valid @RequestBody RegisterRequest request) {
		botCheck.require(request.turnstileToken(), http.getRemoteAddr());
		return UserResponse.of(auth.register(request.email(), request.password(), request.displayName()));
	}

	@PostMapping("/auth/login")
	TokenResponse login(@Valid @RequestBody LoginRequest request) {
		return TokenResponse.of(auth.login(request.email(), request.password()));
	}

	/** Renews the caller's token while the sign-in is still within its maximum age. */
	@PostMapping("/auth/refresh")
	TokenResponse refresh(@AuthenticationPrincipal Jwt jwt) {
		Object claim = jwt.getClaim("auth_time");
		Instant authTime = claim instanceof Number n ? Instant.ofEpochSecond(n.longValue()) : jwt.getIssuedAt();
		return TokenResponse.of(auth.refresh(Long.parseLong(jwt.getSubject()), authTime));
	}

	@PostMapping("/auth/verify-email")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void verifyEmail(@Valid @RequestBody LinkRequest request) {
		auth.verifyEmail(request.token());
	}

	@PostMapping("/auth/verify-email/resend")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void resendVerification(@AuthenticationPrincipal Jwt jwt) {
		auth.resendVerification(Long.parseLong(jwt.getSubject()));
	}

	/** Always 202, whether or not the address has an account. */
	@PostMapping("/auth/forgot-password")
	@ResponseStatus(HttpStatus.ACCEPTED)
	void forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
		auth.forgotPassword(request.email());
	}

	@PostMapping("/auth/reset-password")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
		auth.resetPassword(request.token(), request.password());
	}

	@GetMapping("/me")
	UserResponse me(@AuthenticationPrincipal Jwt jwt) {
		return UserResponse.of(auth.get(Long.parseLong(jwt.getSubject())));
	}

	record RegisterRequest(
			@NotBlank @Email @Size(max = 254) String email,
			// 72 is bcrypt's input limit; longer passwords would be silently truncated.
			@NotBlank @Size(min = 8, max = 72) String password,
			@NotBlank @Size(max = 80) String displayName,
			/** The answer from the sign-up bot check, when one is configured. */
			@Schema(nullable = true) @Size(max = 2048) String turnstileToken) {
	}

	record LinkRequest(@NotBlank @Size(max = 200) String token) {
	}

	record ForgotPasswordRequest(@NotBlank @Email @Size(max = 254) String email) {
	}

	record ResetPasswordRequest(@NotBlank @Size(max = 200) String token, @NotBlank @Size(min = 8, max = 72) String password) {
	}

	record LoginRequest(@NotBlank String email, @NotBlank String password) {
	}

	record TokenResponse(String accessToken, String tokenType, long expiresIn) {

		static TokenResponse of(IssuedToken token) {
			return new TokenResponse(token.value(), "Bearer", token.expiresInSeconds());
		}

	}

	record UserResponse(long id, String email, String displayName, String role, boolean emailVerified) {

		static UserResponse of(User user) {
			return new UserResponse(user.getId(), user.getEmail(), user.getDisplayName(), user.getRole().name(), user.isEmailVerified());
		}

	}

}
