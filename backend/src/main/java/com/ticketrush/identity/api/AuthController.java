package com.ticketrush.identity.api;

import com.ticketrush.identity.application.AuthService;
import com.ticketrush.identity.application.TokenIssuer.IssuedToken;
import com.ticketrush.identity.domain.User;
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

@RestController
@RequestMapping("/api")
class AuthController {

	private final AuthService auth;

	AuthController(AuthService auth) {
		this.auth = auth;
	}

	@PostMapping("/auth/register")
	@ResponseStatus(HttpStatus.CREATED)
	UserResponse register(@Valid @RequestBody RegisterRequest request) {
		return UserResponse.of(auth.register(request.email(), request.password(), request.displayName()));
	}

	@PostMapping("/auth/login")
	TokenResponse login(@Valid @RequestBody LoginRequest request) {
		return TokenResponse.of(auth.login(request.email(), request.password()));
	}

	@GetMapping("/me")
	UserResponse me(@AuthenticationPrincipal Jwt jwt) {
		return UserResponse.of(auth.get(Long.parseLong(jwt.getSubject())));
	}

	record RegisterRequest(
			@NotBlank @Email @Size(max = 254) String email,
			// 72 is bcrypt's input limit; longer passwords would be silently truncated.
			@NotBlank @Size(min = 8, max = 72) String password,
			@NotBlank @Size(max = 80) String displayName) {
	}

	record LoginRequest(@NotBlank String email, @NotBlank String password) {
	}

	record TokenResponse(String accessToken, String tokenType, long expiresIn) {

		static TokenResponse of(IssuedToken token) {
			return new TokenResponse(token.value(), "Bearer", token.expiresInSeconds());
		}

	}

	record UserResponse(long id, String email, String displayName, String role) {

		static UserResponse of(User user) {
			return new UserResponse(user.getId(), user.getEmail(), user.getDisplayName(), user.getRole().name());
		}

	}

}
