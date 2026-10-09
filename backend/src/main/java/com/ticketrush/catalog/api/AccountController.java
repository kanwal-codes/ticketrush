package com.ticketrush.catalog.api;

import com.ticketrush.catalog.application.AccountDataService;
import com.ticketrush.catalog.application.AccountDataService.Export;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** A guest's own data: a copy of it, and closing the account. Any signed-in guest, only about themselves. */
@RestController
@RequestMapping("/api/me")
class AccountController {

	private final AccountDataService account;

	AccountController(AccountDataService account) {
		this.account = account;
	}

	@GetMapping("/export")
	ResponseEntity<Export> export(@AuthenticationPrincipal Jwt jwt) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
				.header("Content-Disposition", "attachment; filename=\"ticketrush-my-data.json\"")
				.body(account.export(Long.parseLong(jwt.getSubject())));
	}

	/** Asks for the password again, since this cannot be undone. */
	@PostMapping("/close")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void close(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CloseRequest request) {
		account.close(Long.parseLong(jwt.getSubject()), request.password());
	}

	record CloseRequest(@NotBlank @Size(max = 72) String password) {
	}

}
