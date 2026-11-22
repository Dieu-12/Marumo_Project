import { CINEMAS, CONCESSIONS, DATES, MOVIES, SHOWTIMES } from '../data/cinemaData.js';

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const COLS = 12;

function hashString(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function generateSeatMap(showtimeId, basePrice = 95000) {
  const seed = hashString(String(showtimeId || 'default'));
  const rows = [];

  for (let rIdx = 0; rIdx < ROWS.length; rIdx += 1) {
    const rowLetter = ROWS[rIdx];
    const seats = [];
    const isCoupleRow = rowLetter === 'H';
    const isVipRow = rIdx >= 3 && rIdx <= 6;

    for (let c = 1; c <= COLS; c += 1) {
      if (isCoupleRow && c % 2 === 0) {

        continue;
      }

      const id = isCoupleRow ? `${rowLetter}${c}-${c + 1}` : `${rowLetter}${c}`;
      const type = isCoupleRow ? 'couple' : isVipRow ? 'vip' : 'standard';

      let price = basePrice;
      if (type === 'vip') {
        price = basePrice + 25000;
      } else if (type === 'couple') {
        price = basePrice * 2 + 20000;
      }


      const seatHash = hashString(`${seed}:${id}`);
      const threshold = isVipRow && c >= 4 && c <= 9 ? 30 : 18;
      const isOccupied = seatHash % 100 < threshold;

      seats.push({
        id,
        row: rowLetter,
        number: c,
        type,
        price,
        isOccupied,
      });
    }

    rows.push({
      row: rowLetter,
      isCoupleRow,
      seats,
    });
  }

  return rows;
}

export function validateSeatSelection(seatRows, selectedSeatIds) {
  const selectedIds = new Set(selectedSeatIds);
  const cells = seatRows.flatMap(({ seats }, row) => seats.flatMap((seat) => (
    Array.from({ length: seat.type === 'couple' ? 2 : 1 }, (_, offset) => ({
      id: seat.id,
      row,
      column: seat.number + offset,
      isOccupied: seat.isOccupied,
      isSelected: !seat.isOccupied && selectedIds.has(seat.id),
    }))
  )));
  const selected = cells.filter((cell) => cell.isSelected);
  if (selected.length === 0) return 'Vui lòng chọn ít nhất một ghế trước khi tiếp tục.';
  const lastColumn = Math.max(...cells.map((cell) => cell.column));
  const cellAt = (row, column) => cells.find((cell) => cell.row === row && cell.column === column);

  if (selected.length > 1) {
    const connected = new Set([selected[0]]);
    for (const current of connected) {
      for (const cell of selected) {
        const distance = Math.abs(cell.row - current.row) + Math.abs(cell.column - current.column);
        const gap = distance === 2 && cell.column === current.column
          ? cellAt((current.row + cell.row) / 2, current.column)
          : undefined;
        const allowedEdgeGap = gap && !gap.isOccupied && !gap.isSelected &&
          (gap.column === 1 || gap.column === lastColumn);
        if (distance === 1 || allowedEdgeGap) {
          connected.add(cell);
        }
      }
    }
    if (connected.size !== selected.length) {
      return 'Vui lòng chọn các ghế liền kề nhau theo hàng ngang hoặc hàng dọc.';
    }
  }

  const isTaken = (cell) => Boolean(cell && (cell.isOccupied || cell.isSelected));
  const hasGap = cells.some((cell) => {
    if (cell.isOccupied || cell.isSelected || cell.column === 1 || cell.column === lastColumn) {
      return false;
    }

    const left = cellAt(cell.row, cell.column - 1);
    const right = cellAt(cell.row, cell.column + 1);
    const horizontalGap = isTaken(left) && isTaken(right);


    if (!horizontalGap || (!left.isSelected && !right.isSelected)) return false;
    if (selected.length !== 1) return true;
    const singleHasBookedHorizontalNeighbor = [-1, 1].some((offset) => (
      cellAt(selected[0].row, selected[0].column + offset)?.isOccupied
    ));
    return !singleHasBookedHorizontalNeighbor;
  });

  return hasGap
    ? 'Lựa chọn hiện tại để lại một ghế trống lẻ. Vui lòng chọn ghế trống đó hoặc điều chỉnh chỗ ngồi trước khi tiếp tục.'
    : '';
}

export function validatePromoCode(rawCode, ticketSubtotal, seatCount = 0) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) {
    return { valid: false, discount: 0, message: '', code: '' };
  }

  if (ticketSubtotal <= 0 || seatCount <= 0) {
    return {
      valid: false,
      discount: 0,
      message: 'Vui lòng chọn ít nhất một ghế trước khi áp dụng mã ưu đãi.',
      code,
    };
  }

  if (code === 'MARUMO20') {
    const discount = Math.round(ticketSubtotal * 0.2);
    return {
      valid: true,
      discount,
      message: 'Đã giảm 20% tiền vé (MARUMO20).',
      code,
    };
  }

  if (code === 'WED50') {
    const discount = Math.min(ticketSubtotal, seatCount * 40000);
    return {
      valid: true,
      discount,
      message: 'Đã giảm 40.000 ₫/ghế cho Thứ Tư vui vẻ (WED50).',
      code,
    };
  }

  if (code === 'STUDENT15') {
    const discount = Math.round(ticketSubtotal * 0.15);
    return {
      valid: true,
      discount,
      message: 'Đã áp dụng ưu đãi 15% cho học sinh, sinh viên (STUDENT15).',
      code,
    };
  }

  return {
    valid: false,
    discount: 0,
    message: 'Mã ưu đãi không hợp lệ. Hãy thử MARUMO20, WED50 hoặc STUDENT15.',
    code,
  };
}

export function calculateBookingTotals({ selectedSeats = [], promoCode = '' }) {
  const ticketSubtotal = Number(
    selectedSeats.reduce((sum, seat) => sum + Number(seat.price || 0), 0).toFixed(2)
  );

  const promoResult = validatePromoCode(promoCode, ticketSubtotal, selectedSeats.length);
  const discount = promoResult.valid ? promoResult.discount : 0;
  const grandTotal = Number(Math.max(0, ticketSubtotal - discount).toFixed(2));

  return {
    ticketSubtotal,
    discount,
    grandTotal,
    promoResult,
  };
}

export function filterMovies(movies, { status = 'all', genre = 'All', format = 'All', query = '' } = {}) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  return movies.filter((movie) => {
    if (status !== 'all' && movie.status !== status) return false;
    if (genre !== 'All' && movie.genreKey !== genre) return false;
    if (format !== 'All' && !movie.formats.includes(format)) return false;
    if (normalizedQuery) {
      const haystack = `${movie.title} ${movie.genre} ${movie.director} ${movie.cast.join(' ')}`.toLowerCase();
      if (!haystack.includes(normalizedQuery)) return false;
    }
    return true;
  });
}

export function filterShowtimes(showtimes, { movieId, cinemaId, dateId, format = 'All' } = {}) {
  return showtimes.filter((item) => {
    if (movieId && item.movieId !== movieId) return false;
    if (cinemaId && item.cinemaId !== cinemaId) return false;
    if (dateId && item.dateId !== dateId) return false;
    if (format && format !== 'All' && item.format !== format) return false;
    return true;
  });
}

export function validateBookingForm({ name, email, phone }) {
  const errors = {};
  const trimmedName = String(name || '').trim();
  const trimmedEmail = String(email || '').trim();
  const trimmedPhone = String(phone || '').trim();

  if (trimmedName.length < 2) {
    errors.name = 'Vui lòng nhập họ và tên (ít nhất 2 ký tự).';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    errors.email = 'Vui lòng nhập địa chỉ email hợp lệ để nhận vé điện tử.';
  }
  if (!/^[+\d\s()-]{8,18}$/.test(trimmedPhone)) {
    errors.phone = 'Vui lòng nhập số điện thoại liên hệ hợp lệ (8–18 chữ số).';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function formatCurrency(amount) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(amount || 0));
}

export function calculateLoyaltyPoints(amount) {
  return Math.round(Number(amount || 0) / 1000);
}

const LEGACY_COMBO_NAMES = [
  'MARUMO Duo Caramel Combo',
  'Solo Classic Popcorn Set',
  'IMAX Family Feast',
  'Crispy Nachos & Cola',
];
const LEGACY_DATE_LABELS = new Map(DATES.map((date) => [
  new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${date.id}T12:00:00Z`)),
  date.fullLabel,
]));

export function migrateStoredBookings(bookings = []) {
  if (!Array.isArray(bookings)) return [];
  return bookings.map((booking) => {
    if (!booking || typeof booking !== 'object') return booking;
    const fields = ['ticketSubtotal', 'comboSubtotal', 'discount', 'grandTotal'];
    const movie = MOVIES.find((item) => item.id === booking.movieId);
    const cinema = CINEMAS.find((item) => item.id === booking.cinemaId);

    if ((booking.currency && booking.currency !== 'USD') || !movie || !cinema
      || !fields.every((key) => typeof booking[key] === 'number' && Number.isFinite(booking[key]) && booking[key] >= 0)
      || booking.grandTotal >= 1000 || !Array.isArray(booking.seatDetails)
      || !booking.seatDetails.length || !Array.isArray(booking.combos)) {
      return booking;
    }
    const seatsMatch = booking.seatDetails.every((seat) => SHOWTIMES.some((showtime) => {
      const base = showtime.basePrice / 10000;
      const price = seat.type === 'vip' ? base + 2.5 : seat.type === 'couple' ? base * 2 + 2 : base;
      return showtime.movieId === booking.movieId && ['standard', 'vip', 'couple'].includes(seat.type)
        && Math.round(seat.price * 100) === Math.round(price * 100);
    }));
    const combosMatch = booking.combos.every((combo) => {
      const index = LEGACY_COMBO_NAMES.indexOf(combo.name);
      return index >= 0 && combo.price === CONCESSIONS[index].price / 10000
        && Number.isInteger(combo.qty) && combo.qty > 0;
    });
    const cents = (amount) => Math.round(amount * 100);
    if (!seatsMatch || !combosMatch
      || cents(booking.seatDetails.reduce((sum, seat) => sum + seat.price, 0)) !== cents(booking.ticketSubtotal)
      || cents(booking.combos.reduce((sum, combo) => sum + combo.price * combo.qty, 0)) !== cents(booking.comboSubtotal)
      || booking.discount > booking.ticketSubtotal
      || cents(booking.ticketSubtotal + booking.comboSubtotal - booking.discount) !== cents(booking.grandTotal)) {
      return booking;
    }
    const amounts = Object.fromEntries(fields.map((key) => [key, Math.round(booking[key] * 10000)]));
    const createdAt = typeof booking.createdAt === 'string' && /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/.test(booking.createdAt)
      ? new Date(`${booking.createdAt} 12:00:00 GMT`).toLocaleDateString('vi-VN', { timeZone: 'UTC' })
      : booking.createdAt;
    return {
      ...booking,
      ...amounts,
      currency: 'VND',
      movieTitle: movie.title,
      cinemaName: cinema.name,
      cinemaAddress: cinema.address,
      dateLabel: LEGACY_DATE_LABELS.get(booking.dateLabel) || booking.dateLabel,
      hall: booking.hall?.replace(/^Hall /, 'Phòng ').replace(' · Family', ' · Gia đình'),
      createdAt,
      seatDetails: booking.seatDetails.map((seat) => ({ ...seat, price: Math.round(seat.price * 10000) })),
      combos: booking.combos.map((combo) => ({
        ...combo,
        name: CONCESSIONS[LEGACY_COMBO_NAMES.indexOf(combo.name)].name,
        price: Math.round(combo.price * 10000),
      })),
    };
  });
}

export function canCancelBooking(booking) {
  if (!booking) return false;
  return booking.status !== 'cancelled';
}

export function filterBookings(bookings = [], { status = 'all', query = '' } = {}) {
  const q = String(query || '').trim().toLowerCase();
  return bookings.filter((item) => {
    const itemStatus = item.status || 'confirmed';
    if (status !== 'all' && itemStatus !== status) return false;
    if (q) {
      const hay = `${item.id} ${item.movieTitle} ${item.cinemaName} ${item.customerEmail || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

