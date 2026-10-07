# 0003. Checkout, payments and tickets

Status: accepted. Date: 2026-10-07.

## Context
Paying is where the product's promises meet real money. A guest must never be charged twice, charged without
getting tickets, or sold a seat someone else holds. The payment provider is another company's server: a
request can time out after the card was charged, and a retry can arrive while the first attempt is still
running. The design must stay correct through every one of those.

## Decision
- **Money never moves inside a database transaction.** A checkout is three short steps around one provider
  call. *Reserve* (transaction): check the hold, create the order as pending, push the seats' hold time out by
  a 3 minute checkout window so nobody can take them mid-payment. *Charge* (no transaction): call the provider.
  *Settle* (transaction, order row locked): record the result. Holding a transaction (and its row locks) open
  across a network call to a third party would let one slow provider stall seat reads for everyone.
- **Unknown is a real outcome.** A timeout means neither "failed" nor "paid". The API answers 202 with the
  order pending. Retrying with the same key charges again under the same provider key, which cannot charge
  twice, then settles. A scheduled reconciler asks the provider (`lookup`) about orders still pending and
  settles them. A provider with no record is left alone: failing an order whose charge is still in flight
  would take money without giving tickets.
- **Three layers of idempotency**, because each catches a different failure:
  1. `Idempotency-Key` header, unique per guest in the database, inserted in the same transaction as the
     order. Two identical requests at once cannot both pass: the second waits for the first to commit and
     replays its answer. The same key with a different body is 422, so a key can't be quietly reused.
  2. A partial unique index allows one live (pending, paid or refunding) order per hold. A retry with a *new*
     key while another attempt is live is refused with 409.
  3. The provider is called with a key derived from the order (`order-{id}`), so even a crash between charging
     and settling cannot lead to a second charge.
- **The database refuses to sell a seat twice.** `ticket` has a partial unique index on `(event_id, seat_id)`
  for tickets that are not void. Settling locks the order's seats and sells only seats still stamped with this
  hold. If any are gone (a very slow charge outlived the checkout window and someone else took them), nothing
  is sold, the order goes `REFUNDING`, the charge is refunded under a derived key, and the order becomes
  `REFUNDED`. The reconciler retries refunds that failed.
- **A hold that is being paid for cannot be replaced or released**, otherwise a second tab could free the seats
  mid-payment.
- **Transactional outbox.** Settling writes an `OrderPaid` row in the same transaction as the sale, so "paid"
  and "someone will be told" cannot disagree. A relay locks one row at a time (`FOR UPDATE SKIP LOCKED`, safe
  on several instances), publishes a Spring event, and marks the row delivered in the same transaction. A
  failing listener rolls that row back and the failure is counted; after 20 attempts the row is parked in the
  table for a person to look at. Listeners (the confirmation message, releasing the waiting-room admission)
  are idempotent, so a repeat is harmless.
- **Card details never reach the server.** The API takes a provider token, as Stripe's does. The mock provider
  understands test tokens (`tok_visa`, `tok_declined`, `tok_insufficient_funds`, `tok_error`, `tok_slow`).
- **Tickets** carry a random 128-bit code. The QR image is drawn as SVG from it (ZXing core). Scanning at the
  door is a single conditional update (`ISSUED` to `USED`), so twenty scanners presenting one ticket admit it
  exactly once.
- **Module boundary:** orders, tickets and payments live in `catalog` with holds and inventory, because they
  share tables and rules. If they grow apart, orders and payments are the part that would split off, behind the
  `PaymentGateway` port and the outbox.

## Alternatives considered
- **Charge inside the transaction.** Simplest to write, and the first thing to fail under load: connections
  and row locks are held for as long as the provider takes, and a timeout leaves the transaction and the
  charge disagreeing.
- **Two-phase commit between Postgres and the provider.** Card networks don't offer it. Idempotent calls plus
  reconciliation get the same outcome with parts that exist.
- **A saga framework.** The workflow is three steps with one compensation (refund). A framework would be more
  machinery than the problem.
- **Publishing the event straight after commit, without an outbox.** A crash between the commit and the publish
  loses the message for good. The outbox makes that impossible at the cost of a one second delay.
- **Storing card data.** Out of scope and a compliance burden; tokens avoid it.

## Consequences
- An order can sit pending while the provider is unreachable. The guest sees that honestly and the seats stay
  held through the checkout window; after that the reconciler is the only thing that can move it.
- A pending order with no provider record is never failed automatically. A real deployment would alert on
  orders pending longer than some limit; that alert is not built.
- Confirmation messages are written to a table. Real email is a later swap behind the same listener.
- The mock provider is in memory and single process. The tests rely on it to count charges and refunds.
