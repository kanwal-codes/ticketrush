import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { supportEmail } from '../../lib/support'
import { useTitle } from '../../lib/useTitle'
import './legal.css'

const UPDATED = '9 October 2026'

function Legal({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
  useTitle(`${title} · TicketRush`)
  return (
    <article className="page legal">
      <h1>{title}</h1>
      <p className="legal__updated label">Last updated {UPDATED}</p>
      <p className="legal__summary">{summary}</p>
      {children}
      <p>
        Questions about this page? See <Link to="/contact">Contact</Link>.
      </p>
    </article>
  )
}

export function Terms() {
  return (
    <Legal title="Terms of use" summary="TicketRush is a demonstration of a fair ticket queue. Payments here are in test mode: no real money moves and a ticket is worth nothing outside this site.">
      <h2>What this is</h2>
      <p>
        TicketRush shows how a flash sale for tickets can be run fairly: a waiting room that lets people in by arrival time, seats that are
        held for a few minutes while you pay, and a seat that is never sold twice. The events, venues and organizers on it are
        demonstrations, unless an event says otherwise.
      </p>
      <h2>Test mode</h2>
      <p>
        Payments run in a test mode. Test cards are accepted, real cards are not charged, and a ticket gives no right to enter any
        real venue. If this ever changes, this page and the checkout will say so before any real payment is taken.
      </p>
      <h2>Your account</h2>
      <ul>
        <li>Give a real email address that you can read: we send password reset links and order messages to it.</li>
        <li>Keep your password to yourself. You are responsible for what is done with your account.</li>
        <li>You can download your data or close your account at any time from <Link to="/account">your account</Link>.</li>
      </ul>
      <h2>Playing fair</h2>
      <p>
        The queue is only fair if everyone uses it the way a person would. Do not use scripts or tools to join queues, hold seats
        or pay faster than a person can, do not make accounts to get more places in line, and do not try to break or overload the
        service. We may close accounts that do.
      </p>
      <h2>Tickets and events</h2>
      <p>
        Events are run by their organizers. An organizer can cancel an event; when they do, every paid order is refunded
        automatically (see <Link to="/refunds">Refunds</Link>). Tickets cannot be transferred or resold on TicketRush.
      </p>
      <h2>No promises</h2>
      <p>
        The service is provided as it is. It may be changed, reset or taken down at any time, and the data on it may be erased. We do
        our best to keep it running and correct, but we do not promise it will always be available, and to the extent the law allows we
        are not liable for losses from using it.
      </p>
      <h2>Changes</h2>
      <p>If these terms change, the date at the top changes with them. Using the service after that means you accept the new terms.</p>
    </Legal>
  )
}

export function Privacy() {
  return (
    <Legal title="Privacy" summary="We keep what we need to run your orders and nothing to sell. You can download your data or close your account yourself.">
      <h2>What we keep</h2>
      <ul>
        <li><strong>Your account:</strong> your name, your email address, and your password as a salted hash (we cannot read it).</li>
        <li><strong>Your orders:</strong> what you bought, the price, the seats, the ticket codes, and the messages we sent you about them.</li>
        <li><strong>Your place in a queue and any seats you hold,</strong> while they last (minutes).</li>
        <li>
          <strong>Your network address,</strong> briefly: it is counted for a minute to slow down people who guess passwords or create
          accounts in bulk, and then forgotten. Our host also keeps ordinary server logs for a short time.
        </li>
      </ul>
      <p>
        We do not use advertising or analytics trackers, and we do not set cookies. Your sign-in is kept in your browser tab&apos;s
        session storage and disappears when the tab closes.
      </p>
      <h2>What we use it for</h2>
      <p>
        To run the sale: to let you in a queue, hold seats, take payment, give you your tickets, tell you about your order or a
        cancellation, and let you reset a password. That is all.
      </p>
      <h2>Who else handles it</h2>
      <p>These services handle data for us, only for the job named, and only where that service is switched on:</p>
      <ul>
        <li><strong>Fly.io</strong> runs the app, and <strong>Supabase</strong> keeps the database, both in Canada.</li>
        <li><strong>Cloudflare</strong> runs a check at sign-up that you are a person, and so sees your network address and browser details.</li>
        <li><strong>Resend</strong> delivers our emails to you, so it sees your address and the message.</li>
        <li><strong>Stripe</strong> takes card payments (in test mode today). Your card details go to Stripe&apos;s own form and never to us.</li>
      </ul>
      <h2>Your choices</h2>
      <ul>
        <li><strong>See what we have:</strong> download a copy of your data from <Link to="/account">your account</Link>.</li>
        <li>
          <strong>Close your account</strong> from the same page. Your name and address are removed. The records of orders and tickets
          stay, with no name or address on them, because the organizer&apos;s sales and the money have to add up. You can close once any ticket
          for an event still to come has been used or refunded.
        </li>
        <li><strong>Anything else</strong> (a correction, a question, a complaint): see <Link to="/contact">Contact</Link>.</li>
      </ul>
      <h2>Children</h2>
      <p>TicketRush is not meant for children under 13.</p>
      <h2>Changes</h2>
      <p>If this page changes, the date at the top changes with it.</p>
    </Legal>
  )
}

export function Refunds() {
  return (
    <Legal title="Refunds" summary="If an event is cancelled, you are refunded in full automatically. Otherwise tickets are final.">
      <h2>When an event is cancelled</h2>
      <p>
        You get back everything you paid for that order, fees included, on the card you paid with. You do not need to ask: we start
        the refund as soon as the organizer cancels, and tell you by email. Banks usually show it within a few business days.
        If a refund fails on our side we keep trying until it goes through.
      </p>
      <p>A ticket that was already scanned at the door counts as used, and its order is not refunded.</p>
      <h2>When something goes wrong while you pay</h2>
      <ul>
        <li>A payment that is declined, or that you do not finish, does not charge you. Your seats are released when your hold ends.</li>
        <li>If you were charged but the seats could not be given to you, you are refunded automatically.</li>
        <li>If we could not tell whether a payment went through, we find out and settle it. You are never charged twice for one order.</li>
      </ul>
      <h2>Otherwise</h2>
      <p>
        Tickets are final: there is no refund or exchange if you change your mind, and tickets cannot be transferred or resold
        on TicketRush. Payments are in test mode today, so no real money is involved either way.
      </p>
    </Legal>
  )
}

export function Contact() {
  const email = supportEmail()
  return (
    <Legal title="Contact" summary="How to reach the person who runs this site.">
      {email ? (
        <p>
          Write to <a href={`mailto:${email}`}>{email}</a>. Include the order reference (it looks like TR-ABC123) if your question is about an order, and never
          send a password.
        </p>
      ) : (
        <p>
          There is no support mailbox yet. Questions and problems can be raised on{' '}
          <a href="https://github.com/kanwal-codes/ticketrush/issues" rel="noreferrer">the project&apos;s issue page on GitHub</a>. Please do not post
          passwords, ticket codes or other private details there.
        </p>
      )}
      <h2>Data requests</h2>
      <p>
        You can download your data and close your account yourself from <Link to="/account">your account</Link>. For anything that page cannot do,
        use the contact above.
      </p>
    </Legal>
  )
}
