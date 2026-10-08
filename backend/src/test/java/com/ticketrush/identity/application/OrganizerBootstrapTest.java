package com.ticketrush.identity.application;

import com.ticketrush.identity.domain.User;
import com.ticketrush.identity.domain.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OrganizerBootstrapTest {

	private final UserRepository users = mock(UserRepository.class);
	private final PasswordEncoder encoder = mock(PasswordEncoder.class);

	private OrganizerBootstrap with(String email, String password) {
		return new OrganizerBootstrap(users, encoder, email, password);
	}

	@Test
	void doesNothingWhenNotConfigured() {
		with("", "").run(null);
		verify(users, never()).save(any());
	}

	@Test
	void refusesToStartWithAWeakPasswordOrAnInvalidEmail() {
		assertThatThrownBy(() -> with("boss@example.org", "short").run(null)).hasMessageContaining("at least 12");
		assertThatThrownBy(() -> with("not-an-email", "a-long-enough-pass").run(null)).hasMessageContaining("email");
		assertThatThrownBy(() -> with("", "a-long-enough-pass").run(null)).hasMessageContaining("email");
		verify(users, never()).save(any());
	}

	@Test
	void neverTouchesAnAccountThatExists() {
		when(users.findByEmailIgnoreCase("boss@example.org")).thenReturn(Optional.of(mock(User.class)));
		with("boss@example.org", "a-long-enough-pass").run(null);
		verify(users, never()).save(any());
	}

}
