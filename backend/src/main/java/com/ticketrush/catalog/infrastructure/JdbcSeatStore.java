package com.ticketrush.catalog.infrastructure;

import com.ticketrush.catalog.domain.SeatStore;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.util.List;

/** Seat queries as plain SQL: there are thousands of rows per event, so no entities. */
@Repository
class JdbcSeatStore implements SeatStore {

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
	public List<SectionAvailability> availabilityBySection(long eventId) {
		return jdbc.sql("select s.id as section_id, count(*) as total, "
				+ "count(*) filter (where es.status = 'AVAILABLE') as available "
				+ "from event_seat es join venue_seat vs on vs.id = es.seat_id "
				+ "join venue_section s on s.id = vs.section_id where es.event_id = :event group by s.id")
				.param("event", eventId)
				.query((rs, i) -> new SectionAvailability(rs.getLong("section_id"), rs.getInt("total"),
						rs.getInt("available")))
				.list();
	}

	@Override
	public List<SeatView> seatMap(long eventId, Long sectionId) {
		String sql = "select vs.id, s.id as section_id, s.name as section_name, vs.row_label, vs.seat_number, es.status "
				+ "from event_seat es join venue_seat vs on vs.id = es.seat_id "
				+ "join venue_section s on s.id = vs.section_id where es.event_id = :event "
				+ (sectionId != null ? "and s.id = :section " : "")
				// Row labels sort by length first so that Z comes before AA.
				+ "order by s.sort_order, length(vs.row_label), vs.row_label, vs.seat_number";
		JdbcClient.StatementSpec spec = jdbc.sql(sql).param("event", eventId);
		if (sectionId != null) {
			spec = spec.param("section", sectionId);
		}
		return spec.query((rs, i) -> new SeatView(rs.getLong("id"), rs.getLong("section_id"),
				rs.getString("section_name"), rs.getString("row_label"), rs.getInt("seat_number"),
				rs.getString("status"))).list();
	}

}
