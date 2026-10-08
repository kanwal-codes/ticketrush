package com.ticketrush.catalog.infrastructure;

import com.ticketrush.catalog.domain.SeatStore;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

/** Seat queries as plain SQL: there are thousands of rows per event, so no entities. */
@Repository
class JdbcSeatStore implements SeatStore {

	/** A seat a guest could take right now: free, or held by someone whose hold has run out. */
	private static final String CLAIMABLE = "(es.status = 'AVAILABLE' or (es.status = 'HELD' and es.held_until <= :now))";

	private final JdbcClient jdbc;

	JdbcSeatStore(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public void generateRow(long sectionId, String rowLabel, int seatCount) {
		jdbc.sql("insert into venue_seat (section_id, row_label, seat_number) "
				+ "select :section, :row, n from generate_series(1, :count) n")
				.param("section", sectionId)
				.param("row", rowLabel)
				.param("count", seatCount)
				.update();
	}

	@Override
	public int createEventInventory(long eventId, long venueId) {
		return jdbc.sql("insert into event_seat (event_id, seat_id) "
				+ "select :event, vs.id from venue_seat vs "
				+ "join venue_section s on s.id = vs.section_id where s.venue_id = :venue")
				.param("event", eventId)
				.param("venue", venueId)
				.update();
	}

	@Override
	public List<SectionSize> sectionSizes(long venueId) {
		return jdbc.sql("select s.id, s.name, count(vs.id) as seats from venue_section s "
				+ "left join venue_seat vs on vs.section_id = s.id where s.venue_id = :venue "
				+ "group by s.id, s.name, s.sort_order order by s.sort_order")
				.param("venue", venueId)
				.query((rs, i) -> new SectionSize(rs.getLong("id"), rs.getString("name"), rs.getInt("seats")))
				.list();
	}

	@Override
	public List<SectionAvailability> availabilityBySection(long eventId, Instant now) {
		return jdbc.sql("select s.id as section_id, count(*) as total, "
				+ "count(*) filter (where " + CLAIMABLE + ") as available "
				+ "from event_seat es join venue_seat vs on vs.id = es.seat_id "
				+ "join venue_section s on s.id = vs.section_id where es.event_id = :event group by s.id")
				.param("event", eventId)
				.param("now", ts(now))
				.query((rs, i) -> new SectionAvailability(rs.getLong("section_id"), rs.getInt("total"),
						rs.getInt("available")))
				.list();
	}

	@Override
	public List<SeatView> seatMap(long eventId, Long sectionId, Instant now) {
		String sql = "select vs.id, s.id as section_id, s.name as section_name, vs.row_label, vs.seat_number, "
				+ "case when es.status = 'HELD' and es.held_until <= :now then 'AVAILABLE' else es.status end as status "
				+ "from event_seat es join venue_seat vs on vs.id = es.seat_id "
				+ "join venue_section s on s.id = vs.section_id where es.event_id = :event "
				+ (sectionId != null ? "and s.id = :section " : "")
				// Row labels sort by length first so that Z comes before AA.
				+ "order by s.sort_order, length(vs.row_label), vs.row_label, vs.seat_number";
		JdbcClient.StatementSpec spec = jdbc.sql(sql).param("event", eventId).param("now", ts(now));
		if (sectionId != null) {
			spec = spec.param("section", sectionId);
		}
		return spec.query((rs, i) -> new SeatView(rs.getLong("id"), rs.getLong("section_id"),
				rs.getString("section_name"), rs.getString("row_label"), rs.getInt("seat_number"),
				rs.getString("status"))).list();
	}

	@Override
	public void lockUserEvent(long userId, long eventId) {
		long key = (eventId << 32) | (userId & 0xFFFFFFFFL);
		jdbc.sql("select pg_advisory_xact_lock(:key)").param("key", key).query().singleRow();
	}

	@Override
	public List<Long> claim(long eventId, long holdId, List<Long> seatIds, Instant now, Instant until) {
		// SKIP LOCKED: a seat another request is working on is skipped, not waited for, so the claim fails fast
		// and two claims can never block each other. ORDER BY keeps lock order the same for everyone.
		return jdbc.sql("with locked as ("
				+ "select es.seat_id from event_seat es "
				+ "where es.event_id = :event and es.seat_id in (:seats) and " + CLAIMABLE + " "
				+ "order by es.seat_id for update skip locked) "
				+ "update event_seat set status = 'HELD', hold_id = :hold, held_until = :until "
				+ "from locked where event_seat.event_id = :event and event_seat.seat_id = locked.seat_id "
				+ "returning event_seat.seat_id")
				.param("event", eventId)
				.param("seats", seatIds)
				.param("now", ts(now))
				.param("hold", holdId)
				.param("until", ts(until))
				.query(Long.class)
				.list();
	}

	@Override
	public List<Long> seatsInEvent(long eventId, List<Long> seatIds) {
		return jdbc.sql("select seat_id from event_seat where event_id = :event and seat_id in (:seats)")
				.param("event", eventId)
				.param("seats", seatIds)
				.query(Long.class)
				.list();
	}

	@Override
	public List<Long> unavailable(long eventId, List<Long> seatIds, Instant now) {
		return jdbc.sql("select es.seat_id from event_seat es where es.event_id = :event and es.seat_id in (:seats) "
				+ "and not " + CLAIMABLE + " order by es.seat_id")
				.param("event", eventId)
				.param("seats", seatIds)
				.param("now", ts(now))
				.query(Long.class)
				.list();
	}

	@Override
	public int extendHold(long holdId, Instant until) {
		return jdbc.sql("update event_seat set held_until = greatest(held_until, :until) "
				+ "where hold_id = :hold and status = 'HELD'")
				.param("until", ts(until))
				.param("hold", holdId)
				.update();
	}

	@Override
	public List<Long> lockHeldSeats(long holdId) {
		return jdbc.sql("select seat_id from event_seat where hold_id = :hold and status = 'HELD' "
				+ "order by seat_id for update")
				.param("hold", holdId)
				.query(Long.class)
				.list();
	}

	@Override
	public int sellHeldSeats(long holdId) {
		return jdbc.sql("update event_seat set status = 'SOLD' where hold_id = :hold and status = 'HELD'")
				.param("hold", holdId)
				.update();
	}

	@Override
	public int releaseHold(long holdId) {
		return jdbc.sql("update event_seat set status = 'AVAILABLE', hold_id = null, held_until = null "
				+ "where hold_id = :hold and status = 'HELD'")
				.param("hold", holdId)
				.update();
	}

	@Override
	public List<HeldSeat> heldSeats(long holdId) {
		return jdbc.sql("select vs.id, s.id as section_id, s.name as section_name, vs.row_label, vs.seat_number "
				+ "from event_seat es join venue_seat vs on vs.id = es.seat_id "
				+ "join venue_section s on s.id = vs.section_id where es.hold_id = :hold "
				+ "order by s.sort_order, length(vs.row_label), vs.row_label, vs.seat_number")
				.param("hold", holdId)
				.query((rs, i) -> new HeldSeat(rs.getLong("id"), rs.getLong("section_id"),
						rs.getString("section_name"), rs.getString("row_label"), rs.getInt("seat_number")))
				.list();
	}

	@Override
	public ExpiryResult expireDue(Instant now) {
		int seats = jdbc.sql("update event_seat set status = 'AVAILABLE', hold_id = null, held_until = null "
				+ "where status = 'HELD' and held_until <= :now")
				.param("now", ts(now))
				.update();
		int holds = jdbc.sql("update seat_hold set status = 'EXPIRED' where status = 'ACTIVE' and expires_at <= :now")
				.param("now", ts(now))
				.update();
		return new ExpiryResult(seats, holds);
	}

	/** The Postgres driver does not accept java.time.Instant directly. */
	private static OffsetDateTime ts(Instant instant) {
		return OffsetDateTime.ofInstant(instant, ZoneOffset.UTC);
	}

}
