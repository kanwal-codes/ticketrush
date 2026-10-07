package com.ticketrush.catalog.application;

import com.ticketrush.catalog.domain.Event;
import com.ticketrush.catalog.domain.EventPrice;
import com.ticketrush.catalog.domain.EventPriceRepository;
import com.ticketrush.catalog.domain.EventPriceRepository.MinPrice;
import com.ticketrush.catalog.domain.EventRepository;
import com.ticketrush.catalog.domain.EventStatus;
import com.ticketrush.catalog.domain.FeePolicy;
import com.ticketrush.catalog.domain.PosterStyle;
import com.ticketrush.catalog.domain.SaleState;
import com.ticketrush.catalog.domain.SeatStore;
import com.ticketrush.catalog.domain.SeatStore.SectionAvailability;
import com.ticketrush.catalog.domain.SeatStore.SeatView;
import com.ticketrush.catalog.domain.VenueSection;
import com.ticketrush.catalog.domain.VenueSectionRepository;
import jakarta.persistence.criteria.Predicate;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Everything guests can read. Only published events are visible. */
@Service
@Transactional(readOnly = true)
public class EventQueryService {

	private static final int MAX_PAGE_SIZE = 50;

	private final EventRepository events;
	private final EventPriceRepository prices;
	private final VenueSectionRepository sections;
	private final SeatStore seats;
	private final Clock clock;

	public EventQueryService(EventRepository events, EventPriceRepository prices, VenueSectionRepository sections,
			SeatStore seats, Clock clock) {
		this.events = events;
		this.prices = prices;
		this.sections = sections;
		this.seats = seats;
		this.clock = clock;
	}

	public record PosterView(PosterStyle style, String inkOne, String inkTwo, String paperColor) {
	}

	public record EventSummary(long id, String title, String artist, Instant startsAt, String venueName, String city,
			Instant dropOpensAt, Instant onSaleAt, SaleState saleState, long fromAllInCents, PosterView poster) {
	}

	public record PageView<T>(List<T> items, int page, int size, long totalItems, int totalPages) {
	}

	/** Prices in cents. The guest pays allIn, which is face plus fee. */
	public record TierView(long sectionId, String name, long faceCents, long feeCents, long allInCents,
			int totalSeats, int availableSeats) {
	}

	public record EventDetail(long id, String title, String artist, String description, Instant startsAt,
			Instant doorsAt, Instant dropOpensAt, Instant onSaleAt, SaleState saleState, Instant serverTime,
			String venueName, String city, PosterView poster, List<TierView> tiers, int totalSeats,
			int availableSeats, boolean waitingRoom) {
	}

	public record SeatCell(long id, int number, String status) {
	}

	public record RowMap(String label, List<SeatCell> seats) {
	}

	public record SectionMap(long id, String name, List<RowMap> rows) {
	}

	public record SeatMap(List<SectionMap> sections) {
	}

	public PageView<EventSummary> list(String city, String query, int page, int size) {
		Instant now = clock.instant();
		int pageSize = Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
		Page<Event> result = events.findAll(upcomingPublished(now, city, query),
				PageRequest.of(Math.max(page, 0), pageSize, Sort.by("startsAt", "id")));

		List<Long> ids = result.getContent().stream().map(Event::getId).toList();
		Map<Long, Integer> cheapest = ids.isEmpty() ? Map.of() : prices.minPrices(ids).stream()
				.collect(Collectors.toMap(MinPrice::getEventId, MinPrice::getMinCents));
		List<EventSummary> items = result.getContent().stream().map(e -> new EventSummary(e.getId(), e.getTitle(),
				e.getArtist(), e.getStartsAt(), e.getVenue().getName(), e.getVenue().getCity(), e.getDropOpensAt(),
				e.getOnSaleAt(), e.saleState(now), FeePolicy.allIn(cheapest.getOrDefault(e.getId(), 0)), poster(e)))
				.toList();
		return new PageView<>(items, result.getNumber(), result.getSize(), result.getTotalElements(),
				result.getTotalPages());
	}

	public EventDetail detail(long id) {
		Instant now = clock.instant();
		Event event = published(id);
		Map<Long, SectionAvailability> availability = seats.availabilityBySection(id, now).stream()
				.collect(Collectors.toMap(SectionAvailability::sectionId, Function.identity()));
		Map<Long, VenueSection> byId = sections.findByVenueIdOrderBySortOrder(event.getVenue().getId()).stream()
				.collect(Collectors.toMap(VenueSection::getId, Function.identity()));

		List<TierView> tiers = new ArrayList<>();
		for (EventPrice price : prices.findByEventId(id)) {
			SectionAvailability counts = availability.get(price.getSectionId());
			long fee = FeePolicy.fee(price.getPriceCents());
			tiers.add(new TierView(price.getSectionId(), byId.get(price.getSectionId()).getName(),
					price.getPriceCents(), fee, price.getPriceCents() + fee, counts == null ? 0 : counts.total(),
					counts == null ? 0 : counts.available()));
		}
		tiers.sort((a, b) -> Long.compare(a.sectionId(), b.sectionId()));
		return new EventDetail(event.getId(), event.getTitle(), event.getArtist(), event.getDescription(),
				event.getStartsAt(), event.getDoorsAt(), event.getDropOpensAt(), event.getOnSaleAt(),
				event.saleState(now), now, event.getVenue().getName(), event.getVenue().getCity(), poster(event),
				tiers, tiers.stream().mapToInt(TierView::totalSeats).sum(),
				tiers.stream().mapToInt(TierView::availableSeats).sum(), event.isQueueEnabled());
	}

	/** Cached for a couple of seconds: the map is the hot read while a drop is running. */
	@Cacheable(cacheNames = "seatmaps", key = "#eventId + ':' + #sectionId")
	public SeatMap seatMap(long eventId, Long sectionId) {
		published(eventId);
		Map<Long, SectionMap> bySection = new LinkedHashMap<>();
		Map<String, List<SeatCell>> rowSeats = new LinkedHashMap<>();
		for (SeatView seat : seats.seatMap(eventId, sectionId, clock.instant())) {
			bySection.computeIfAbsent(seat.sectionId(), k -> new SectionMap(k, seat.sectionName(), new ArrayList<>()));
			String rowKey = seat.sectionId() + "/" + seat.row();
			List<SeatCell> row = rowSeats.get(rowKey);
			if (row == null) {
				row = new ArrayList<>();
				rowSeats.put(rowKey, row);
				bySection.get(seat.sectionId()).rows().add(new RowMap(seat.row(), row));
			}
			row.add(new SeatCell(seat.seatId(), seat.number(), seat.status()));
		}
		return new SeatMap(new ArrayList<>(bySection.values()));
	}

	private Event published(long id) {
		return events.findWithVenueById(id).filter(e -> e.getStatus() == EventStatus.PUBLISHED)
				.orElseThrow(() -> new NotFoundException("Event " + id + " not found"));
	}

	private static Specification<Event> upcomingPublished(Instant now, String city, String query) {
		return (root, cq, cb) -> {
			List<Predicate> all = new ArrayList<>();
			all.add(cb.equal(root.get("status"), EventStatus.PUBLISHED));
			all.add(cb.greaterThan(root.get("startsAt"), now));
			if (city != null && !city.isBlank()) {
				all.add(cb.equal(cb.lower(root.get("venue").get("city")), city.strip().toLowerCase(Locale.ROOT)));
			}
			if (query != null && !query.isBlank()) {
				String like = "%" + escapeLike(query.strip().toLowerCase(Locale.ROOT)) + "%";
				all.add(cb.or(cb.like(cb.lower(root.get("title")), like, '\\'),
						cb.like(cb.lower(root.get("artist")), like, '\\')));
			}
			return cb.and(all.toArray(Predicate[]::new));
		};
	}

	private static String escapeLike(String text) {
		return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
	}

	private static PosterView poster(Event e) {
		return new PosterView(e.getPosterStyle(), e.getInkOne(), e.getInkTwo(), e.getPaperColor());
	}

}
