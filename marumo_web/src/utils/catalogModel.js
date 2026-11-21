const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const TODAY_LABEL = 'Hôm nay';
const TOMORROW_LABEL = 'Ngày mai';

const STATUS_BY_API = {
  NOW_SHOWING: 'now-showing',
  COMING_SOON: 'coming-soon',
  PUBLISHED: 'now-showing',
};

const SHOWTIME_FORMAT_LABELS = {
  TWO_D: '2D Sub',
  THREE_D: '3D',
  IMAX_2D: 'IMAX Laser',
  IMAX_3D: 'IMAX 3D',
};

const dateIdFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: VIETNAM_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: VIETNAM_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const weekdayFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: VIETNAM_TIME_ZONE,
  weekday: 'long',
});

function toPartsMap(formatter, date) {
  return Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );
}

function toDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isValidDateId(dateId) {
  return typeof dateId === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateId);
}

export function formatLabelForCode(code, fallbackName) {
  return SHOWTIME_FORMAT_LABELS[code] ?? fallbackName ?? code ?? '';
}

export function toVietnamDateId(value) {
  const date = toDate(value);
  if (!date) return '';
  const parts = toPartsMap(dateIdFormatter, date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function toVietnamTimeLabel(value) {
  const date = toDate(value);
  if (!date) return '';
  const parts = toPartsMap(timeFormatter, date);
  return `${parts.hour}:${parts.minute}`;
}

export function toDateLabel(dateId) {
  if (!isValidDateId(dateId)) return '';
  return `${dateId.slice(8, 10)}/${dateId.slice(5, 7)}`;
}

export function toVietnamWeekday(dateId) {
  if (!isValidDateId(dateId)) return '';
  const [year, month, day] = dateId.split('-').map(Number);
  return weekdayFormatter.format(new Date(Date.UTC(year, month - 1, day, 5)));
}

export function shiftDateId(dateId, days) {
  if (!isValidDateId(dateId)) return '';
  const [year, month, day] = dateId.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, '0'),
    String(shifted.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export function toDayLabel(dateId, now = new Date()) {
  const todayId = toVietnamDateId(now);
  if (!todayId || !isValidDateId(dateId)) return '';
  if (dateId === todayId) return TODAY_LABEL;
  if (dateId === shiftDateId(todayId, 1)) return TOMORROW_LABEL;
  return toVietnamWeekday(dateId);
}

export function toReleaseLabel(releaseDate) {
  if (typeof releaseDate !== 'string') return '';
  const match = releaseDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function toMovieView(dto = {}) {
  const genres = Array.isArray(dto.genres)
    ? dto.genres.filter((genre) => genre && typeof genre === 'object')
    : [];
  const formats = Array.isArray(dto.formats)
    ? dto.formats.filter((format) => format && typeof format === 'object')
    : [];
  const durationMinutes = Number(dto.durationMinutes);
  const synopsis = dto.synopsis ?? '';

  return {
    id: dto.id ?? '',
    title: dto.title ?? '',
    originalTitle: dto.originalTitle ?? '',
    slug: dto.slug ?? '',
    synopsis,
    status: STATUS_BY_API[dto.status] ?? 'now-showing',
    statusCode: dto.status ?? '',
    isFeatured: Boolean(dto.isFeatured),
    isFeaturedHero: Boolean(dto.isFeatured),
    genres: genres.map((genre) => ({
      code: genre.code ?? '',
      name: genre.name ?? '',
    })),
    genre: genres.map((genre) => genre.name).filter(Boolean).join(' / '),
    genreKey: genres[0]?.code ?? '',
    duration: Number.isFinite(durationMinutes) ? durationMinutes : 0,
    ageRating: dto.ratingCode ?? '',
    ratingCode: dto.ratingCode ?? '',
    releaseDate: dto.releaseDate ?? '',
    releaseLabel: toReleaseLabel(dto.releaseDate),
    endDate: dto.endDate ?? '',
    productionYear: dto.productionYear ?? null,
    productionCompany: dto.productionCompany ?? '',
    director: dto.directorDisplay ?? '',
    directorDisplay: dto.directorDisplay ?? '',
    language: dto.originalLanguageCode ?? '',
    originalLanguageCode: dto.originalLanguageCode ?? '',
    formats: formats
      .map((format) => formatLabelForCode(format.code, format.name))
      .filter(Boolean),
    formatCodes: formats.map((format) => format.code ?? '').filter(Boolean),
    cast: [],
    rating: null,
    posterImage: dto.posterImage ?? null,
    heroImage: dto.heroImage ?? null,
    heroTagline: '',
    heroDescription: synopsis,
    bookingEnabled: false,
  };
}

export function toShowtimeView(dto = {}, now = new Date()) {
  const startAt = dto.startAt ?? '';
  const endAt = dto.endAt ?? '';
  const dateId = toVietnamDateId(startAt);
  const branchId = dto.branchId ?? '';
  const branchName = dto.branchName ?? '';
  const formatCode = dto.formatCode ?? '';
  const formatName = dto.formatName ?? '';
  const price = Number(dto.baseTicketPrice);

  return {
    id: dto.id ?? '',
    showtimeCode: dto.showtimeCode ?? '',
    movieId: dto.movieId ?? '',
    movieVersionId: dto.movieVersionId ?? '',
    branchId,
    branchName,
    branchCity: dto.branchCity ?? '',
    branchAddress: dto.branchAddress ?? '',
    cinemaId: branchId,
    cinemaName: branchName || (branchId ? `Rạp ${branchId}` : 'Rạp đang cập nhật'),
    city: dto.branchCity ?? '',
    address: dto.branchAddress ?? '',
    auditoriumId: dto.auditoriumId ?? '',
    auditoriumName: dto.auditoriumName ?? '',
    formatCode,
    formatName,
    format: formatCode || formatName,
    formatLabel: formatLabelForCode(formatCode, formatName),
    startAt,
    endAt,
    dateId,
    dayLabel: dateId ? toDayLabel(dateId, now) : '',
    dateLabel: toDateLabel(dateId),
    time: toVietnamTimeLabel(startAt),
    endDateId: toVietnamDateId(endAt),
    endTime: toVietnamTimeLabel(endAt),
    price: Number.isFinite(price) ? price : 0,
    status: dto.status ?? '',
    bookingEnabled: false,
  };
}

export function buildDateStrip(showtimes = [], now = new Date()) {
  const countByDate = new Map();
  showtimes.forEach((showtime) => {
    if (!showtime.dateId) return;
    countByDate.set(showtime.dateId, (countByDate.get(showtime.dateId) ?? 0) + 1);
  });

  return [...countByDate.keys()].sort().map((dateId) => ({
    id: dateId,
    dayName: toDayLabel(dateId, now),
    dateLabel: toDateLabel(dateId),
    fullLabel: `${toVietnamWeekday(dateId)}, ${toDateLabel(dateId)}`,
    showtimeCount: countByDate.get(dateId),
  }));
}

export function listCities(showtimes = []) {
  return [...new Set(showtimes.map((showtime) => showtime.city).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'vi'));
}

export function listCinemas(showtimes = []) {
  const cinemas = new Map();
  showtimes.forEach((showtime) => {
    if (cinemas.has(showtime.cinemaId)) return;
    cinemas.set(showtime.cinemaId, {
      cinemaId: showtime.cinemaId,
      cinemaName: showtime.cinemaName,
      city: showtime.city,
    });
  });
  return [...cinemas.values()].sort((left, right) =>
    left.cinemaName.localeCompare(right.cinemaName, 'vi')
  );
}

export function groupShowtimesByCinema(showtimes = []) {
  const cinemas = new Map();

  showtimes.forEach((showtime) => {
    const cinemaKey = showtime.cinemaId || showtime.cinemaName;
    let cinema = cinemas.get(cinemaKey);
    if (!cinema) {
      cinema = {
        cinemaId: showtime.cinemaId,
        cinemaName: showtime.cinemaName,
        city: showtime.city,
        address: showtime.address,
        formats: new Map(),
      };
      cinemas.set(cinemaKey, cinema);
    }

    let format = cinema.formats.get(showtime.format);
    if (!format) {
      format = {
        code: showtime.format,
        label: showtime.formatLabel,
        slots: [],
      };
      cinema.formats.set(showtime.format, format);
    }
    format.slots.push(showtime);
  });

  return [...cinemas.values()]
    .map((cinema) => ({
      ...cinema,
      formats: [...cinema.formats.values()].map((format) => ({
        ...format,
        slots: format.slots.slice().sort((left, right) =>
          String(left.startAt).localeCompare(String(right.startAt))
        ),
      })),
    }))
    .sort((left, right) => left.cinemaName.localeCompare(right.cinemaName, 'vi'));
}

export { SHOWTIME_FORMAT_LABELS };
