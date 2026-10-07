package com.ticketrush.queue.domain;

/** Where the sale is, as the waiting room sees it. */
public enum SalePhase {
	/** The waiting room has not opened. */
	NOT_YET,
	/** Guests can join the line but nobody is let in yet. */
	QUEUE_OPEN,
	/** Tickets are on sale: the line moves. */
	ON_SALE,
	ENDED
}
