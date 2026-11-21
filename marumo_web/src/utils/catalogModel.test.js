import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildDateStrip,
  formatLabelForCode,
  groupShowtimesByCinema,
  listCinemas,
  listCities,
  toDayLabel,
  toMovieView,
  toShowtimeView,
  toVietnamDateId,
  toVietnamTimeLabel,
} from './catalogModel.js';

const MOVIE_DTO = {
  id: '42',
  title: 'Hành trình Mặt Trời',
  originalTitle: 'Solar Odyssey',
  slug: 'solar-odyssey',
  synopsis: 'Một chuyến thám hiểm vòng ngoài Hệ Mặt Trời.',
  durationMinutes: 148,
  releaseDate: '2026-11-06',
  endDate: '2026-12-15',
  productionYear: 2026,
  productionCompany: 'Marumo Studios',
  directorDisplay: 'Kenji Takahashi',
  originalLanguageCode: 'en',
  status: 'NOW_SHOWING',
  isFeatured: true,
  ratingCode: 'T13',
  genres: [
    { code: 'SCI_FI', name: 'Khoa học viễn tưởng' },
    { code: 'ADVENTURE', name: 'Phiêu lưu' },
  ],
  formats: [
    { code: 'IMAX_2D', name: 'IMAX' },
    { code: 'DOLBY', name: 'Dolby Atmos' },
  ],
};

const SHOWTIME_DTO = {
  id: '9001',
  showtimeCode: 'ST-9001',
  movieId: '42',
  movieVersionId: '7',
  branchId: '3',
  branchName: 'MARUMO Saigon Centre',
  branchAddress: '65 Lê Lợi',
  branchCity: 'Ho Chi Minh City',
  auditoriumId: '12',
  auditoriumName: 'Phòng 2',
  formatCode: 'IMAX_2D',
  formatName: 'IMAX',
  startAt: '2026-11-18T17:30:00Z',
  endAt: '2026-11-18T20:00:00Z',
  baseTicketPrice: 135000,
  status: 'SCHEDULED',
};

const NOW = new Date('2026-11-19T02:00:00Z');

test('toMovieView maps public movie fields, status and display labels', () => {
  const movie = toMovieView(MOVIE_DTO);
  assert.equal(movie.id, '42');
  assert.equal(movie.slug, 'solar-odyssey');
  assert.equal(movie.status, 'now-showing');
  assert.equal(movie.isFeaturedHero, true);
  assert.equal(movie.genre, 'Khoa học viễn tưởng / Phiêu lưu');
  assert.equal(movie.genreKey, 'SCI_FI');
  assert.equal(movie.duration, 148);
  assert.equal(movie.ageRating, 'T13');
  assert.equal(movie.releaseLabel, '06/11/2026');
  assert.deepEqual(movie.formats, ['IMAX Laser', 'Dolby Atmos']);
  assert.deepEqual(movie.formatCodes, ['IMAX_2D', 'DOLBY']);
  assert.equal(movie.director, 'Kenji Takahashi');
  assert.equal(movie.language, 'en');
  assert.equal(movie.synopsis, MOVIE_DTO.synopsis);
  assert.equal(movie.originalTitle, 'Solar Odyssey');
  assert.equal(movie.productionYear, 2026);
  assert.equal(movie.productionCompany, 'Marumo Studios');
  assert.equal(movie.bookingEnabled, false);
  assert.deepEqual(movie.cast, []);
  assert.equal(movie.rating, null);
  assert.equal(movie.heroDescription, MOVIE_DTO.synopsis);
});

test('toMovieView maps coming soon and published status without dropping visible fields', () => {
  const comingSoon = toMovieView({ ...MOVIE_DTO, status: 'COMING_SOON' });
  assert.equal(comingSoon.status, 'coming-soon');
  assert.equal(comingSoon.synopsis, MOVIE_DTO.synopsis);
  assert.equal(comingSoon.duration, 148);
  assert.equal(comingSoon.releaseLabel, '06/11/2026');
  assert.deepEqual(comingSoon.formats, ['IMAX Laser', 'Dolby Atmos']);

  const published = toMovieView({ ...MOVIE_DTO, status: 'PUBLISHED' });
  assert.equal(published.status, 'now-showing');
});

test('toMovieView tolerates missing optional fields', () => {
  const movie = toMovieView({});
  assert.equal(movie.id, '');
  assert.equal(movie.status, 'now-showing');
  assert.equal(movie.genre, '');
  assert.equal(movie.genreKey, '');
  assert.equal(movie.duration, 0);
  assert.equal(movie.ageRating, '');
  assert.equal(movie.releaseLabel, '');
  assert.deepEqual(movie.formats, []);
  assert.equal(movie.bookingEnabled, false);
});

test('toShowtimeView converts UTC instants to Asia/Ho_Chi_Minh date, labels and time', () => {
  const showtime = toShowtimeView(SHOWTIME_DTO, NOW);
  assert.equal(showtime.dateId, '2026-11-19');
  assert.equal(showtime.dateLabel, '19/11');
  assert.equal(showtime.dayLabel, 'Hôm nay');
  assert.equal(showtime.time, '00:30');
  assert.equal(showtime.endDateId, '2026-11-19');
  assert.equal(showtime.endTime, '03:00');
  assert.equal(showtime.cinemaId, '3');
  assert.equal(showtime.cinemaName, 'MARUMO Saigon Centre');
  assert.equal(showtime.city, 'Ho Chi Minh City');
  assert.equal(showtime.address, '65 Lê Lợi');
  assert.equal(showtime.format, 'IMAX_2D');
  assert.equal(showtime.formatLabel, 'IMAX Laser');
  assert.equal(showtime.price, 135000);
  assert.equal(showtime.bookingEnabled, false);
});

test('toShowtimeView labels tomorrow and later weekdays and falls back for cinema name', () => {
  const tomorrow = toShowtimeView(
    { ...SHOWTIME_DTO, branchName: '', startAt: '2026-11-19T17:00:00Z' },
    NOW
  );
  assert.equal(tomorrow.dateId, '2026-11-20');
  assert.equal(tomorrow.dayLabel, 'Ngày mai');
  assert.equal(tomorrow.cinemaName, 'Rạp 3');

  const saturday = toShowtimeView(
    { ...SHOWTIME_DTO, startAt: '2026-11-21T03:00:00Z' },
    NOW
  );
  assert.equal(saturday.dateId, '2026-11-21');
  assert.equal(saturday.dayLabel, 'Thứ Bảy');
  assert.equal(toDayLabel('2026-11-21', NOW), 'Thứ Bảy');
});

test('timezone helpers keep the local date across the UTC midnight boundary', () => {
  assert.equal(toVietnamDateId('2026-11-18T16:59:00Z'), '2026-11-18');
  assert.equal(toVietnamTimeLabel('2026-11-18T16:59:00Z'), '23:59');
  assert.equal(toVietnamDateId('2026-11-18T17:00:00Z'), '2026-11-19');
  assert.equal(toVietnamTimeLabel('2026-11-18T17:00:00Z'), '00:00');
});

test('format labels map API codes and fall back to the provided name', () => {
  assert.equal(formatLabelForCode('TWO_D', 'ignored'), '2D Sub');
  assert.equal(formatLabelForCode('THREE_D', 'ignored'), '3D');
  assert.equal(formatLabelForCode('IMAX_2D', 'ignored'), 'IMAX Laser');
  assert.equal(formatLabelForCode('IMAX_3D', 'ignored'), 'IMAX 3D');
  assert.equal(formatLabelForCode('DOLBY', 'Dolby Atmos'), 'Dolby Atmos');
  assert.equal(formatLabelForCode(undefined, '4DX'), '4DX');
  assert.equal(formatLabelForCode(undefined, undefined), '');
});

test('buildDateStrip derives sorted local-date buttons with labels and counts', () => {
  const showtimes = [
    toShowtimeView({ ...SHOWTIME_DTO, id: '1', startAt: '2026-11-20T03:00:00Z' }, NOW),
    toShowtimeView({ ...SHOWTIME_DTO, id: '2', startAt: '2026-11-18T17:00:00Z' }, NOW),
    toShowtimeView({ ...SHOWTIME_DTO, id: '3', startAt: '2026-11-19T03:00:00Z' }, NOW),
    toShowtimeView({ ...SHOWTIME_DTO, id: '4', startAt: '2026-11-19T09:00:00Z' }, NOW),
  ];
  const strip = buildDateStrip(showtimes, NOW);
  assert.deepEqual(
    strip.map((date) => [date.id, date.dayName, date.dateLabel, date.fullLabel, date.showtimeCount]),
    [
      ['2026-11-19', 'Hôm nay', '19/11', 'Thứ Năm, 19/11', 3],
      ['2026-11-20', 'Ngày mai', '20/11', 'Thứ Sáu, 20/11', 1],
    ]
  );
});

test('groupShowtimesByCinema groups by cinema and format with chronological slots', () => {
  const early = toShowtimeView({ ...SHOWTIME_DTO, id: '1', startAt: '2026-11-19T02:00:00Z' }, NOW);
  const late = toShowtimeView({ ...SHOWTIME_DTO, id: '2', startAt: '2026-11-19T12:00:00Z' }, NOW);
  const otherFormat = toShowtimeView(
    { ...SHOWTIME_DTO, id: '3', formatCode: 'THREE_D', formatName: '3D', startAt: '2026-11-19T04:00:00Z' },
    NOW
  );
  const otherCinema = toShowtimeView(
    { ...SHOWTIME_DTO, id: '4', branchId: '8', branchName: 'MARUMO Hà Nội', branchCity: 'Hanoi' },
    NOW
  );
  const rows = groupShowtimesByCinema([late, otherCinema, early, otherFormat]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].cinemaName, 'MARUMO Hà Nội');
  assert.deepEqual(rows[0].formats[0].slots.map((slot) => slot.id), ['4']);

  const saigon = rows[1];
  assert.deepEqual(saigon.formats.map((format) => format.code), ['IMAX_2D', 'THREE_D']);
  assert.deepEqual(saigon.formats[0].slots.map((slot) => slot.id), ['1', '2']);
  assert.equal(saigon.formats[0].label, 'IMAX Laser');
  assert.deepEqual(listCities([late, otherCinema, early]), ['Hanoi', 'Ho Chi Minh City']);
  assert.deepEqual(
    listCinemas([late, otherCinema, early]).map((cinema) => cinema.cinemaName),
    ['MARUMO Hà Nội', 'MARUMO Saigon Centre']
  );
});
