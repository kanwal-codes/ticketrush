package com.ticketrush.catalog.infrastructure;

import com.ticketrush.catalog.domain.EventStatus;
import com.ticketrush.catalog.domain.OrganizerStore;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Repository
class JdbcOrganizerStore implements OrganizerStore {

	private final JdbcClient jdbc;

	JdbcOrganizerStore(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public long countEventsOf(long organizerId) {
		return jdbc.sql("select count(*) from event where organizer_id = :organizer").param("organizer", organizerId)
				.query(Long.class).single();
	}

	@Override
	public List<EventRow> eventsOf(long organizerId, int limit, int offset) {
		// A draft has no seat inventory yet, so its capacity is the venue's.
		return jdbc.sql("select e.id, e.title, e.status, e.starts_at, v.name as venue_name, v.city, "
				+ "case when e.status = 'DRAFT' then (select count(*) from venue_seat vs "
				+ "join venue_section s on s.id = vs.section_id where s.venue_id = e.venue_id) "
				+ "else (select count(*) from event_seat es where es.event_id = e.id) end as capacity, "
				+ "(select count(*) from event_seat es where es.event_id = e.id and es.status = 'SOLD') as sold, "
				+ "(select coalesce(sum(o.total_cents), 0) from ticket_order o "
				+ "where o.event_id = e.id and o.status = 'PAID') as gross "
				+ "from event e join venue v on v.id = e.venue_id where e.organizer_id = :organizer "
				+ "order by e.starts_at desc, e.id desc limit :limit offset :offset")
				.param("organizer", organizerId)
				.param("limit", limit)
				.param("offset", offset)
				.query((rs, i) -> new EventRow(rs.getLong("id"), rs.getString("title"),
						EventStatus.valueOf(rs.getString("status")), rs.getTimestamp("starts_at").toInstant(),
						rs.getString("venue_name"), rs.getString("city"), rs.getInt("capacity"), rs.getInt("sold"),
						rs.getLong("gross")))
				.list();
	}

	@Override
	public List<TierRow> tiers(long eventId, Instant now) {
		// Sections come from the venue, so a draft (no inventory yet) still shows its tiers with every seat free.
		// Held counts only live holds; an expired hold is available again, whether or not the sweeper has run.
		return jdbc.sql("select s.id as section_id, s.name, ep.price_cents, count(vs.id) as total, "
				+ "count(es.seat_id) filter (where es.status = 'SOLD') as sold, "
				+ "count(es.seat_id) filter (where es.status = 'HELD' and es.held_until > :now) as held "
				+ "from event e join venue_section s on s.venue_id = e.venue_id "
				+ "left join event_price ep on ep.event_id = e.id and ep.section_id = s.id "
				+ "left join venue_seat vs on vs.section_id = s.id "
				+ "left join event_seat es on es.event_id = e.id and es.seat_id = vs.id "
				+ "where e.id = :event group by s.id, s.name, s.sort_order, ep.price_cents order by s.sort_order")
				.param("event", eventId)
				.param("now", Timestamp.from(now))
				.query((rs, i) -> {
					int total = rs.getInt("total");
					int sold = rs.getInt("sold");
					int held = rs.getInt("held");
					int price = rs.getInt("price_cents");
					return new TierRow(rs.getLong("section_id"), rs.getString("name"), rs.wasNull() ? null : price,
							total, sold, held, total - sold - held);
				})
				.list();
	}

	@Override
	public Revenue revenue(long eventId) {
		return jdbc.sql("select count(*) as orders, coalesce(sum(subtotal_cents), 0) as subtotal, "
				+ "coalesce(sum(fee_cents), 0) as fees, coalesce(sum(total_cents), 0) as total "
				+ "from ticket_order where event_id = :event and status = 'PAID'")
				.param("event", eventId)
				.query((rs, i) -> new Revenue(rs.getLong("orders"), rs.getLong("subtotal"), rs.getLong("fees"),
						rs.getLong("total")))
				.single();
	}

	@Override
	public Map<String, Long> ordersByStatus(long eventId) {
		Map<String, Long> counts = new LinkedHashMap<>();
		jdbc.sql("select status, count(*) as n from ticket_order where event_id = :event group by status order by status")
				.param("event", eventId)
				.query((rs, i) -> counts.put(rs.getString("status"), rs.getLong("n")))
				.list();
		return counts;
	}

	@Override
	public Door door(long eventId) {
		return jdbc.sql("select count(*) filter (where status <> 'VOID') as issued, "
				+ "count(*) filter (where status = 'USED') as used from ticket where event_id = :event")
				.param("event", eventId)
				.query((rs, i) -> new Door(rs.getLong("issued"), rs.getLong("used")))
				.single();
	}

	@Override
	public void recordScan(long eventId, long scannerId, String code, String outcome, String seat, Instant at) {
		jdbc.sql("insert into scan_attempt (event_id, scanner_id, code, outcome, seat, at) "
				+ "values (:event, :scanner, :code, :outcome, :seat, :at)")
				.param("event", eventId)
				.param("scanner", scannerId)
				.param("code", code.length() > 64 ? code.substring(0, 64) : code)
				.param("outcome", outcome)
				.param("seat", seat)
				.param("at", Timestamp.from(at))
				.update();
	}

	@Override
	public List<ScanRow> recentScans(long eventId, int limit) {
		return jdbc.sql("select code, outcome, seat, at from scan_attempt where event_id = :event "
				+ "order by at desc, id desc limit :limit")
				.param("event", eventId)
				.param("limit", limit)
				.query((rs, i) -> new ScanRow(rs.getString("code"), rs.getString("outcome"), rs.getString("seat"),
						rs.getTimestamp("at").toInstant()))
				.list();
	}

}
