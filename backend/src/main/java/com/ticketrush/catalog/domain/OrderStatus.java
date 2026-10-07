package com.ticketrush.catalog.domain;

public enum OrderStatus {
	/** Charge started or its outcome is not known yet. The seats are held for the guest. */
	PENDING_PAYMENT,
	PAID,
	/** The payment was declined. The hold is kept, so the guest can try another card. */
	FAILED,
	/** The guest was charged but the seats were gone, so the money is being returned. */
	REFUNDING,
	REFUNDED
}
