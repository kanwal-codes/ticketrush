package com.ticketrush.catalog.application;

/** A request that is well formed but breaks a business rule. Becomes a 400 problem response. */
public class RuleViolationException extends RuntimeException {

	public RuleViolationException(String message) {
		super(message);
	}

}
