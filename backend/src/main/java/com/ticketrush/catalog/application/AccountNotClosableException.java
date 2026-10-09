package com.ticketrush.catalog.application;

public class AccountNotClosableException extends RuntimeException {

	public AccountNotClosableException(String message) {
		super(message);
	}

}
