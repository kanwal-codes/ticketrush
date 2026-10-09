# Edge cases and failure modes

Every row here is proven by a test that creates the situation on purpose, not by inspection or hoping. The test
name is the plain-English description of the scenario; the file is where to find it. This list is not exhaustive —
it is the ones worth a second look, because money, a seat, or an account was on the line.

## Payments

| Scenario | What happens | Proven in |
|---|---|---|
| A card is declined | The order fails with the provider's reason; the seat hold is kept so the guest can try another card without losing their place | `OrderIntegrationTest.aDeclinedCardFailsTheOrderButKeepsTheHoldForAnotherTry` |
| The provider never answers (a timeout) | The order stays pending, the seats stay held past their original expiry, and a reconciler looks the charge up later and settles it — without a second charge | `OrderIntegrationTest.anUnknownOutcomeStaysPendingAndKeepsTheSeatsBeyondTheOriginalExpiry`, `aSlowChargeIsFoundAndSettledByTheReconciler` |
| The guest retries after an unknown outcome | Settles once, using the same idempotency key; never a second charge | `OrderIntegrationTest.retryingWithTheSameKeyAfterAnUnknownOutcomeSettlesWithoutASecondCharge` |
| 10 identical payment requests arrive at once | Exactly one order, one charge | `OrderIntegrationTest.tenIdenticalRequestsAtOnceMakeOneOrderAndOneCharge` |
| 10 different idempotency keys for the same hold | Exactly one of them pays; the hold cannot be double-sold by generating new keys | `OrderIntegrationTest.tenRequestsWithDifferentKeysForOneHoldPayExactlyOnce` |
| A key is reused for a different hold or card | Rejected (422), not silently treated as the earlier request | `OrderIntegrationTest.theSameKeyForADifferentRequestIsRejected` |
| Someone else takes the seats while this guest's charge is still in flight | The charge is refunded automatically and no ticket is issued | `OrderIntegrationTest.seatsTakenWhileTheChargeRunsAreRefundedAndNoTicketsExist` |
| The organizer cancels the event while a payment is mid-flight | The payment is refunded; nothing is sold | `EventCancellationIntegrationTest.aPaymentThatSettlesAfterTheCancelIsRefundedAndSellsNothing` |
| A refund itself fails (provider error) | Left pending, and a reconciler keeps retrying until it goes through | `EventCancellationIntegrationTest.aRefundThatFailsStaysPendingAndTheReconcilerFinishesIt` |
| An event is cancelled twice | Refunds nobody twice | `EventCancellationIntegrationTest.cancellingTwiceRefundsNobodyTwice` |
| A ticket was already scanned at the door when the event is cancelled | That order is left alone — the guest attended, so they keep it | `EventCancellationIntegrationTest.aTicketThatWasAlreadyScannedIsNotRefundedButOthersAre` |
| Stripe: a card needs 3-D Secure | Declined, and the PaymentIntent is cancelled at Stripe rather than left open | `StripePaymentGatewayTest.aCardThatNeedsExtraAuthenticationIsCancelledAndDeclined` |
| Stripe: cancelling that PaymentIntent itself fails | The decline still stands — a failed cleanup never turns into a false success | `StripePaymentGatewayTest.aFailedCancelDoesNotChangeTheAnswer` |
| Stripe: a refund is asked for twice | The second counts as already done, not an error to keep retrying forever | `StripePaymentGatewayTest.anAlreadyRefundedChargeCountsAsRefundedAndOtherFailuresAreRetried` |
| The confirmation relay crashes mid-delivery | Exactly one confirmation still reaches the guest once it is back up | `OrderRecoveryIntegrationTest.aPaidOrderGetsExactlyOneConfirmationEvenIfTheRelayRunsTwice` |
| The app is given a live (non-test) Stripe key | It refuses to start | `StripePaymentGatewayTest.theAppDoesNotStartWithALiveKey` |

## Concurrency and fairness

| Scenario | What happens | Proven in |
|---|---|---|
| 300 guests claim the same seat at the same instant | Exactly one wins, every run | `HoldConcurrencyIntegrationTest.threeHundredGuestsRaceForOneSeatAndExactlyOneWins` (see [ADR 0001](adr/0001-seat-claims.md)) |
| A guest's own client retries a hold request in a storm (a flaky connection resending) | Ends with exactly one hold, not one per retry | `HoldConcurrencyIntegrationTest.aRetryStormFromOneGuestEndsWithExactlyOneHold` |
| 100 guests race for a seat the instant its hold expires | Exactly one wins; expiry and claiming share the same lock, so there is no gap between them | `HoldConcurrencyIntegrationTest.aHundredGuestsRaceForASeatWhoseHoldJustExpiredAndExactlyOneWins` |
| 200 guests join the waiting room at once | Places 1–200, no gaps and no repeats | `QueueConcurrencyIntegrationTest.twoHundredGuestsJoinAtOnceAndEndUpWithPlacesOneToTwoHundred` |
| 8 admission rounds fire at the exact same instant | Never more than the cap let in, never the same guest admitted twice | `QueueConcurrencyIntegrationTest.eightAdmissionRoundsAtOnceNeverLetInMoreThanTheCapOrTheSameGuestTwice` |
| An admitted guest joins the queue again | Does not go back to the end of the line | `QueueIntegrationTest.joiningAgainWhileAdmittedDoesNotPutYouBackInLine` |
| 8 sign-ups with the same email at once | Exactly one account is created | `AuthIntegrationTest.concurrentSignUpsWithOneEmailCreateExactlyOneAccount` |

## Identity and sessions

| Scenario | What happens | Proven in |
|---|---|---|
| Wrong password vs. an email that does not exist | The same response, in the same time, either way — neither can be told apart | `AuthIntegrationTest.wrongPasswordAndUnknownEmailLookTheSame` |
| Repeated password guesses | Slowed down per address, and the guest is told exactly how long to wait | `AuthRateLimitIntegrationTest.guessingPasswordsIsSlowedDownAndTheAnswerSaysHowLong` |
| A token is renewed again and again, far past when the password was entered | Refused past 8 hours from the original sign-in, however often it is renewed in between | `SessionRefreshIntegrationTest.aRefreshCannotKeepASignInAliveForever` |
| A password is reset through the emailed link | Every other outstanding reset link is retired, and sign-ins from before the change can no longer be renewed | `AccountEmailsIntegrationTest.choosingANewPasswordRetiresOtherLinksAndEndsOlderSignIns` |
| A reset link is asked for twice inside a minute | One email, not two | `AccountEmailsIntegrationTest.askingTwiceInAMinuteSendsOneEmailAndTheAnswerNeverRevealsWhoHasAnAccount` |
| A reset is asked for an address with no account | The response gives no sign either way | `AccountEmailsIntegrationTest.neverTouchesAnAccountThatExists` |
| Cloudflare's bot-check service itself is unreachable | Sign-up fails closed with its own message, rather than letting the sign-up through | `SignUpBotCheckIntegrationTest.whenTheCheckCannotBeRunSignUpFailsClosedWithItsOwnMessage` |
| No email provider is configured (a dev/demo environment) | New guests are never asked to confirm an address they cannot receive mail at | `AccountEmailsIntegrationTest.whenMailCannotBeSentGuestsAreNotAskedToConfirmAndCanGoStraightToTheQueue` |
| A guest tries to close their account while holding a ticket for an event that has not happened | Refused, with the reason, until the ticket is used or the event is over | `AccountDataIntegrationTest.closingIsRefusedWhileATicketForAnEventToComeIsHeld` |
| A guest tries to close their account mid-payment | Refused until the payment has settled one way or the other | `AccountDataIntegrationTest.closingIsRefusedWhileAPaymentIsStillBeingSettled` |
| An organizer tries to close their account the same way | Refused outright — an organizer owns events and sales records | `AccountDataIntegrationTest.anOrganizerCannotCloseTheirAccountHere` |

## Access control

| Scenario | What happens | Proven in |
|---|---|---|
| A new endpoint is added with no explicit access rule | The build fails — every endpoint must be listed as open, guest, or organizer, in one place that is checked against the real routes | `AuthorizationMatrixIntegrationTest.everyEndpointIsClassifiedExactlyOnce` |
| An anonymous caller reaches anything not meant to be public | Refused (401), checked against every endpoint in the app, not a sample | `AuthorizationMatrixIntegrationTest.anonymousCallersAreTurnedAwayFromEverythingThatIsNotOpen` |
| A signed-in guest reaches an organizer-only endpoint | Refused (403), again checked against every endpoint | `AuthorizationMatrixIntegrationTest.aGuestIsRefusedEverythingForOrganizersAndIsNotRefusedTheRest` |
| A guest's admission token is reused by someone else, for another event, past its expiry, or edited | Refused in each case | `HoldAdmissionGateIntegrationTest` |

## What the guest actually sees (browser end to end)

| Scenario | What happens | Proven in |
|---|---|---|
| The connection drops mid-queue or mid-hold | Told plainly; their place in line and any held seats are kept; reconnects by itself | `e2e/errors.spec.ts: going offline says so, says nothing is lost, and announces the return` |
| The events list fails to load | Told, with a retry button; nothing about their place in line is touched | `e2e/errors.spec.ts: when the events cannot be loaded, the guest is told and can try again` |
| Too many requests from one address | Told exactly how long to wait, and the button re-enables itself when the wait is over | `e2e/errors.spec.ts: a rate limit shows how long to wait and unlocks the button by itself` |
| A link to an event that no longer exists | A designed "not found" screen with a way back, never a blank page | `e2e/errors.spec.ts: an unknown page or event gets a designed screen with a way home` |

For the reasoning behind the design, not just the test that proves it, see [docs/adr](adr) — each record names the alternatives that were considered and why they lost.
