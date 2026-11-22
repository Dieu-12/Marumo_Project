import { randomBytes } from 'node:crypto';
import sql from 'mssql';
import { HttpError } from './validation.js';
import { memoryStamp, publicShowtime } from './catalogRepository.js';

const SAIGON_OFFSET_MS = 7 * 60 * 60 * 1000;
const DEFAULT_HOLD_MINUTES = 10;
const MAX_HOLD_MINUTES = 120;
const BOOKING_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BOOKING_CODE_ATTEMPTS = 3;

const BOOKING_SELECT = `SELECT
    CONVERT(varchar(20), b.booking_id) AS id,
    b.booking_code AS code,
    st.status_code AS status,
    CONVERT(varchar(20), b.showtime_id) AS showtimeId,
    CONVERT(varchar(20), b.branch_id) AS branchId,
    CONVERT(varchar(20), s.auditorium_id) AS auditoriumId,
    b.subtotal_amount AS subtotalAmount,
    b.discount_amount AS discountAmount,
    b.total_amount AS totalAmount,
    b.currency_code AS currencyCode,
    b.expires_at AS expiresAt,
    b.created_at AS createdAt,
    s.start_at AS startAt,
    s.end_at AS endAt,
    br.branch_name AS branchName,
    a.auditorium_name AS auditoriumName,
    f.format_name AS formatName,
    m.title AS movieTitle,
    m.slug AS movieSlug,
    poster.media_url AS posterImage,
    rating.rating_code AS ratingCode,
    u.full_name AS customerName,
    u.email AS customerEmail,
    COALESCE(pay_method.method_code,
      CASE WHEN EXISTS (
        SELECT 1 FROM dbo.loyalty_ledger ll
        WHERE ll.booking_id = b.booking_id AND ll.change_type = 'REDEEM'
      ) THEN 'POINTS' END) AS paymentMethod
  FROM dbo.bookings b
  JOIN dbo.booking_statuses st ON st.booking_status_id = b.booking_status_id
  JOIN dbo.showtimes s ON s.showtime_id = b.showtime_id
  JOIN dbo.branches br ON br.branch_id = b.branch_id
  JOIN dbo.auditoriums a ON a.auditorium_id = s.auditorium_id
  JOIN dbo.movie_versions mv ON mv.movie_version_id = s.movie_version_id
  JOIN dbo.movies m ON m.movie_id = mv.movie_id
  JOIN dbo.screening_formats f ON f.format_id = mv.format_id
  LEFT JOIN dbo.users u ON u.user_id = b.user_id
  OUTER APPLY (
    SELECT TOP (1) mm.media_url
    FROM dbo.movie_media mm
    WHERE mm.movie_id = m.movie_id AND mm.media_type = 'POSTER'
    ORDER BY mm.is_primary DESC, mm.display_order, mm.media_id
  ) poster
  OUTER APPLY (
    SELECT TOP (1) r.rating_code
    FROM dbo.movie_content_ratings r
    WHERE r.movie_id = m.movie_id
    ORDER BY CASE WHEN r.country_code = 'VN' THEN 0 ELSE 1 END, r.movie_content_rating_id
  ) rating
  OUTER APPLY (
    SELECT TOP (1) pm.method_code
    FROM dbo.payment_transactions ptx
    JOIN dbo.payment_methods pm ON pm.payment_method_id = ptx.payment_method_id
    WHERE ptx.booking_id = b.booking_id
    ORDER BY ptx.payment_transaction_id DESC
  ) pay_method`;

const BOOKING_SEAT_SELECT = `SELECT
    CONVERT(varchar(20), bs.booking_id) AS bookingId,
    CONVERT(varchar(20), bs.booking_seat_id) AS bookingSeatId,
    CONVERT(varchar(20), bs.showtime_seat_id) AS showtimeSeatId,
    CONVERT(varchar(20), ss.seat_id) AS seatId,
    s.seat_code AS code,
    s.row_label AS rowLabel,
    s.seat_number AS seatNumber,
    seat_type.type_code AS typeCode,
    seat_type.type_name AS typeName,
    seat_type.seat_unit_count AS unitCount,
    bs.seat_price AS price,
    bs.discount_amount AS discountAmount,
    bs.final_price AS finalPrice,
    layout_seat.row_position AS rowPosition,
    layout_seat.column_position AS columnPosition
  FROM dbo.booking_seats bs
  JOIN dbo.showtime_seats ss ON ss.showtime_seat_id = bs.showtime_seat_id
  JOIN dbo.seats s ON s.seat_id = ss.seat_id
  JOIN dbo.seat_types seat_type ON seat_type.seat_type_id = s.seat_type_id
  LEFT JOIN dbo.seat_layout_versions layout_version
    ON layout_version.auditorium_id = ss.auditorium_id AND layout_version.version_status = 'PUBLISHED'
  LEFT JOIN dbo.seat_layout_version_seats layout_seat
    ON layout_seat.layout_version_id = layout_version.layout_version_id
    AND layout_seat.seat_id = s.seat_id AND layout_seat.is_enabled = 1`;

const BOOKING_SEAT_ORDER = `ORDER BY COALESCE(layout_seat.row_position, 2147483647), s.row_label,
    COALESCE(layout_seat.column_position, s.seat_number), s.seat_number;`;

function seatUnavailable(codes) {
  return new HttpError(409, 'SEAT_UNAVAILABLE', `These seats are no longer available: ${codes.join(', ')}.`);
}

function showtimeNotFound() {
  return new HttpError(404, 'SHOWTIME_NOT_FOUND', 'Showtime not found.');
}

function showtimeNotBookable() {
  return new HttpError(409, 'SHOWTIME_NOT_BOOKABLE', 'The showtime is no longer open for booking.');
}

function invalid(message) {
  return new HttpError(400, 'INVALID_INPUT', message);
}

function saigonWall(instantMs) {
  return new Date(instantMs + SAIGON_OFFSET_MS);
}

function wallStamp(value) {
  return `${value.toISOString().slice(0, 19)}+07:00`;
}

function generateBookingCode() {
  let code = 'BKG-';
  for (const byte of randomBytes(16)) code += BOOKING_CODE_ALPHABET[byte % BOOKING_CODE_ALPHABET.length];
  return code;
}

function mapBookingSeat(row) {
  return {
    bookingSeatId: row.bookingSeatId,
    showtimeSeatId: row.showtimeSeatId,
    seatId: row.seatId,
    code: row.code,
    rowLabel: row.rowLabel,
    seatNumber: row.seatNumber,
    typeCode: row.typeCode,
    typeName: row.typeName,
    unitCount: row.unitCount,
    price: Number(row.price),
    discountAmount: Number(row.discountAmount),
    finalPrice: Number(row.finalPrice),
    rowPosition: row.rowPosition,
    columnPosition: row.columnPosition,
  };
}

function mapBookingRow(row, seats) {
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    showtimeId: row.showtimeId,
    branchId: row.branchId,
    auditoriumId: row.auditoriumId,
    subtotalAmount: Number(row.subtotalAmount),
    discountAmount: Number(row.discountAmount),
    totalAmount: Number(row.totalAmount),
    currencyCode: row.currencyCode,
    expiresAt: row.expiresAt === null ? null : wallStamp(row.expiresAt),
    createdAt: row.createdAt.toISOString(),
    showtime: {
      id: row.showtimeId,
      startAt: row.startAt === null ? null : row.startAt.toISOString(),
      endAt: row.endAt === null ? null : row.endAt.toISOString(),
      branchName: row.branchName,
      auditoriumName: row.auditoriumName,
      formatName: row.formatName,
    },
    movie: {
      title: row.movieTitle ?? null,
      slug: row.movieSlug ?? null,
      posterImage: row.posterImage ?? null,
      ratingCode: row.ratingCode ?? null,
    },
    customerName: row.customerName ?? null,
    customerEmail: row.customerEmail ?? null,
    paymentMethod: row.paymentMethod ?? null,
    seats,
  };
}

function isUniqueViolation(error) {
  return error?.number === 2627 || error?.number === 2601;
}

async function releaseExpiredForShowtime(run, showtimeId) {
  const expired = await run()
    .input('showtimeId', sql.BigInt, showtimeId)
    .query(`SELECT b.booking_id FROM dbo.bookings b
      JOIN dbo.booking_statuses st ON st.booking_status_id = b.booking_status_id
      WHERE b.showtime_id = @showtimeId AND st.status_code = 'PENDING_PAYMENT' AND b.expires_at <= SYSDATETIME();`);
  for (const row of expired.recordset) {
    await run()
      .input('booking_id', sql.BigInt, row.booking_id)
      .input('status_code', sql.VarChar(30), 'EXPIRED')
      .execute('dbo.usp_booking_release');
  }
}

export { BOOKING_SELECT, BOOKING_SEAT_SELECT, BOOKING_SEAT_ORDER, mapBookingRow, mapBookingSeat, releaseExpiredForShowtime };

export function createMemoryBookingRepository(movieRepository) {
  const bookings = new Map();
  const occupancy = new Map();
  const usedBookingCodes = new Set();
  let nextBookingId = 1n;

  function release(booking, status, at) {
    booking.status = status;
    booking.releasedAt = at;
    for (const seat of booking.seats) {
      const key = `${booking.showtimeId}:${seat.showtimeSeatId}`;
      if (occupancy.get(key)?.bookingId === booking.id) occupancy.delete(key);
    }
  }

  function sweepExpired(showtimeId, at) {
    for (const booking of bookings.values()) {
      if (booking.showtimeId === showtimeId && booking.status === 'PENDING_PAYMENT' && booking.expiresAtWallMs - SAIGON_OFFSET_MS <= at) {
        release(booking, 'EXPIRED', at);
      }
    }
  }

  function snapshot(booking) {
    return {
      id: booking.id,
      code: booking.code,
      status: booking.status,
      showtimeId: booking.showtimeId,
      branchId: booking.branchId,
      auditoriumId: booking.auditoriumId,
      subtotalAmount: booking.subtotalAmount,
      discountAmount: booking.discountAmount,
      totalAmount: booking.totalAmount,
      currencyCode: booking.currencyCode,
      expiresAt: `${new Date(booking.expiresAtWallMs).toISOString().slice(0, 19)}+07:00`,
      createdAt: booking.createdAt,
      showtime: {
        id: booking.showtime.id,
        startAt: booking.showtime.startAt,
        endAt: booking.showtime.endAt,
        branchName: booking.showtime.branchName,
        auditoriumName: booking.showtime.auditoriumName,
        formatName: booking.showtime.formatName,
      },
      movie: booking.movie,
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      paymentMethod: booking.paymentMethod,
      seats: booking.seats.map((seat) => ({ ...seat })),
    };
  }

  return {
    async releaseExpiredShowtimeBookings({ showtimeId }, at) {
      sweepExpired(showtimeId, at);
    },
    async createBooking({ userId, sessionId, showtimeId, seatIds }, at) {
      sweepExpired(showtimeId, at);
      const showtime = await movieRepository.findBookableShowtime(showtimeId, at);
      if (!showtime) throw showtimeNotFound();
      if (!showtime.bookable) throw showtimeNotBookable();
      const taken = seatIds.filter((seatId) => occupancy.has(`${showtimeId}:${seatId}`));
      if (taken.length > 0) throw seatUnavailable(taken);
      const price = showtime.baseTicketPrice;
      const subtotalAmount = Math.round(seatIds.length * price * 100) / 100;
      let code;
      do {
        code = generateBookingCode();
      } while (usedBookingCodes.has(code));
      usedBookingCodes.add(code);
      const booking = {
        id: String(nextBookingId++),
        code,
        userId,
        sessionId,
        status: 'PENDING_PAYMENT',
        showtimeId,
        branchId: showtime.branchId,
        auditoriumId: showtime.auditoriumId,
        subtotalAmount,
        discountAmount: 0,
        totalAmount: subtotalAmount,
        currencyCode: 'VND',
        expiresAtWallMs: saigonWall(at + DEFAULT_HOLD_MINUTES * 60000).getTime(),
        createdAt: new Date(at).toISOString(),
        movie: { title: null, slug: null, posterImage: null, ratingCode: null },
        customerName: null,
        customerEmail: null,
        paymentMethod: null,
        showtime: publicShowtime(showtime, null),
        seats: seatIds.map((seatId) => ({
          bookingSeatId: seatId,
          showtimeSeatId: seatId,
          seatId: seatId,
          code: null,
          rowLabel: null,
          seatNumber: null,
          typeCode: null,
          typeName: null,
          unitCount: 1,
          price,
          discountAmount: 0,
          finalPrice: price,
          rowPosition: null,
          columnPosition: null,
        })),
      };
      bookings.set(booking.id, booking);
      for (const seat of booking.seats) occupancy.set(`${showtimeId}:${seat.showtimeSeatId}`, { bookingId: booking.id });
      return snapshot(booking);
    },
    async scanBooking({ userId, branchId, bookingCode, deviceCode }, at) {
      const booking = [...bookings.values()].find((b) => b.code === bookingCode);
      if (!booking) throw new HttpError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
      if (booking.status !== 'CONFIRMED') throw new HttpError(409, 'BOOKING_NOT_CONFIRMED', 'Booking is not confirmed.');
      if (booking.branchId !== String(branchId)) throw new HttpError(403, 'BRANCH_MISMATCH', 'Booking belongs to a different branch.');
      if (booking.scannedAtWallMs !== undefined) throw new HttpError(409, 'BOOKING_ALREADY_SCANNED', 'Booking has already been scanned.');
      const showtime = await movieRepository.findBookableShowtime(booking.showtimeId, at);
      if (!showtime) throw new HttpError(404, 'SHOWTIME_NOT_FOUND', 'Showtime not found.');
      const earlyEntryMs = 30 * 60000;
      const lateEntryMs = 0;
      if (at < new Date(showtime.startAt).getTime() - earlyEntryMs || at > new Date(showtime.endAt).getTime() + lateEntryMs) {
        throw new HttpError(409, 'SCAN_TIME_WINDOW', 'Outside allowed entry time window.');
      }
      booking.scannedAtWallMs = at;
      booking.scannedAt = new Date(at).toISOString();
      return {
        ...snapshot(booking),
        scannedAt: `${new Date(at).toISOString().slice(0, 19)}+07:00`,
        tickets: booking.seats.map((seat, index) => ({
          ticketId: String(index + 1),
          ticketCode: `TKT-${bookingCode}-${index + 1}`,
          qrToken: `qr-${bookingCode}-${index + 1}`,
          seatCode: seat.code ?? `SEAT-${index + 1}`,
        })),
      };
    },
    async getBooking({ userId, bookingId }, at) {
      const booking = bookings.get(bookingId);
      if (!booking || booking.userId !== userId) return null;
      if (booking.status === 'PENDING_PAYMENT' && booking.expiresAtWallMs - SAIGON_OFFSET_MS <= at) {
        release(booking, 'EXPIRED', at);
      }
      return snapshot(booking);
    },
    async getBookingByCode({ userId, bookingCode }, at) {
      const booking = [...bookings.values()].find((entry) => entry.code === bookingCode);
      if (!booking || booking.userId !== userId) return null;
      if (booking.status === 'PENDING_PAYMENT' && booking.expiresAtWallMs - SAIGON_OFFSET_MS <= at) {
        release(booking, 'EXPIRED', at);
      }
      return snapshot(booking);
    },
    async listBookings({ userId }, at) {
      for (const booking of bookings.values()) {
        if (booking.userId === userId && booking.status === 'PENDING_PAYMENT' && booking.expiresAtWallMs - SAIGON_OFFSET_MS <= at) {
          release(booking, 'EXPIRED', at);
        }
      }
      return [...bookings.values()]
        .filter((booking) => booking.userId === userId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .map(snapshot);
    },
    async confirmBooking({ userId, bookingId }, at) {
      const booking = bookings.get(bookingId);
      if (!booking || booking.userId !== userId) {
        throw new HttpError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
      }
      if (booking.status === 'PENDING_PAYMENT' && booking.expiresAtWallMs - SAIGON_OFFSET_MS <= at) {
        release(booking, 'EXPIRED', at);
      }
      if (booking.status === 'EXPIRED') {
        throw new HttpError(409, 'BOOKING_EXPIRED', 'The booking hold has expired.');
      }
      if (booking.status !== 'PENDING_PAYMENT') {
        throw new HttpError(409, 'BOOKING_NOT_PENDING_PAYMENT', 'The booking is not awaiting payment.');
      }
      booking.status = 'CONFIRMED';
      return snapshot(booking);
    },
  };
}

export function createSqlBookingRepository(pool) {
  async function createBooking({ userId, sessionId, showtimeId, seatIds }, at) {
    await releaseExpiredForShowtime(() => pool.request(), showtimeId);
    const tx = new sql.Transaction(pool);
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const run = () => tx.request();
      const showtimeResult = await run()
        .input('showtimeId', sql.BigInt, showtimeId)
        .query(`SELECT CONVERT(varchar(20), s.showtime_id) AS id, CONVERT(varchar(20), s.branch_id) AS branchId,
            CONVERT(varchar(20), s.auditorium_id) AS auditoriumId,
            CASE WHEN s.start_at > SYSUTCDATETIME()
              AND (s.sales_open_at IS NULL OR s.sales_open_at <= SYSUTCDATETIME())
              AND (s.sales_close_at IS NULL OR s.sales_close_at > SYSUTCDATETIME())
            THEN 1 ELSE 0 END AS bookable
          FROM dbo.showtimes s WITH (UPDLOCK, HOLDLOCK)
          JOIN dbo.showtime_statuses st ON st.status_id = s.status_id
          WHERE s.showtime_id = @showtimeId AND st.status_code IN ('SCHEDULED','OPEN_FOR_BOOKING');`);
      const showtime = showtimeResult.recordset[0];
      if (!showtime) throw showtimeNotFound();
      if (showtime.bookable !== 1) throw showtimeNotBookable();
      const seatPlaceholders = seatIds.map((_, index) => `@seat${index}`).join(', ');
      const seatRequest = run().input('showtimeId', sql.BigInt, showtimeId);
      seatIds.forEach((id, index) => seatRequest.input(`seat${index}`, sql.BigInt, id));
      const seatResult = await seatRequest.query(`SELECT CONVERT(varchar(20), ss.showtime_seat_id) AS showtimeSeatId,
          CONVERT(varchar(20), ss.seat_id) AS seatId, s.seat_code AS code, ss.seat_status AS status, ss.final_price AS finalPrice
        FROM dbo.showtime_seats ss WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.seats s ON s.seat_id = ss.seat_id
        WHERE ss.showtime_id = @showtimeId AND ss.showtime_seat_id IN (${seatPlaceholders});`);
      const seats = seatResult.recordset;
      if (seats.length !== seatIds.length) throw invalid('seatIds reference seats that do not belong to this showtime.');
      const takenSeats = seats.filter((seat) => seat.status !== 'AVAILABLE').map((seat) => seat.code);
      if (takenSeats.length > 0) throw seatUnavailable(takenSeats);
      const holdMinutes = Number((await run().query(`SELECT setting_value FROM dbo.system_settings WHERE setting_key = 'BOOKING_HOLD_MINUTES';`)).recordset[0]?.setting_value);
      if (!Number.isInteger(holdMinutes) || holdMinutes < 1 || holdMinutes > MAX_HOLD_MINUTES) {
        throw new Error('BOOKING_HOLD_MINUTES setting is invalid.');
      }
      const subtotalAmount = Math.round(seats.reduce((sum, seat) => sum + Number(seat.finalPrice), 0) * 100) / 100;
      const expiresAt = saigonWall(at + holdMinutes * 60000);
      let bookingId = null;
      for (let attempt = 0; attempt < BOOKING_CODE_ATTEMPTS && bookingId === null; attempt += 1) {
        try {
          const inserted = await run()
            .input('bookingCode', sql.VarChar(40), generateBookingCode())
            .input('userId', sql.BigInt, userId)
            .input('branchId', sql.BigInt, showtime.branchId)
            .input('showtimeId', sql.BigInt, showtimeId)
            .input('subtotalAmount', sql.Decimal(14, 2), subtotalAmount)
            .input('expiresAt', sql.DateTime2, expiresAt)
            .query(`INSERT INTO dbo.bookings (booking_code, user_id, branch_id, showtime_id, booking_status_id, booking_channel, subtotal_amount, discount_amount, total_amount, expires_at)
              OUTPUT CONVERT(varchar(20), inserted.booking_id) AS id
              VALUES (@bookingCode, @userId, @branchId, @showtimeId,
                (SELECT booking_status_id FROM dbo.booking_statuses WHERE status_code = 'PENDING_PAYMENT'),
                'WEB', @subtotalAmount, 0, @subtotalAmount, @expiresAt);`);
          bookingId = inserted.recordset[0].id;
        } catch (error) {
          if (isUniqueViolation(error) && String(error.message).includes('UQ_bookings_booking_code')) continue;
          throw error;
        }
      }
      if (bookingId === null) throw new Error('Booking code could not be generated.');
      const updateRequest = run().input('showtimeId', sql.BigInt, showtimeId).input('sessionId', sql.UniqueIdentifier, sessionId);
      seatIds.forEach((id, index) => updateRequest.input(`seat${index}`, sql.BigInt, id));
      const updated = await updateRequest.query(`UPDATE dbo.showtime_seats
        SET seat_status = 'BOOKED', held_by_session_id = @sessionId, updated_at = SYSUTCDATETIME()
        WHERE showtime_id = @showtimeId AND showtime_seat_id IN (${seatPlaceholders}) AND seat_status = 'AVAILABLE';`);
      if (updated.rowsAffected[0] !== seatIds.length) throw seatUnavailable(seats.map((seat) => seat.code));
      const bookingSeatRequest = run().input('bookingId', sql.BigInt, bookingId).input('showtimeId', sql.BigInt, showtimeId);
      seats.forEach((seat, index) => {
        bookingSeatRequest.input(`seatId${index}`, sql.BigInt, seat.showtimeSeatId);
        bookingSeatRequest.input(`price${index}`, sql.Decimal(12, 2), Number(seat.finalPrice));
      });
      await bookingSeatRequest.query(`INSERT INTO dbo.booking_seats (booking_id, showtime_id, showtime_seat_id, seat_price, discount_amount, final_price)
        VALUES ${seats.map((_, index) => `(@bookingId, @showtimeId, @seatId${index}, @price${index}, 0, @price${index})`).join(', ')};`);
      const bookingRow = (await run()
        .input('bookingId', sql.BigInt, bookingId)
        .query(`${BOOKING_SELECT} WHERE b.booking_id = @bookingId;`)).recordset[0];
      const bookingSeatRows = (await run()
        .input('bookingId', sql.BigInt, bookingId)
        .query(`${BOOKING_SEAT_SELECT} WHERE bs.booking_id = @bookingId
          ${BOOKING_SEAT_ORDER}`)).recordset;
      await tx.commit();
      return mapBookingRow(bookingRow, bookingSeatRows.map(mapBookingSeat));
    } catch (error) {
      await tx.rollback().catch(() => {});
      if (isUniqueViolation(error) && String(error.message).includes('UX_booking_seats_active_seat')) {
        throw new HttpError(409, 'SEAT_UNAVAILABLE', 'The requested seats are no longer available.');
      }
      throw error;
    }
  }

  async function loadBookingSeats(bookingId) {
    return (await pool.request()
      .input('bookingId', sql.BigInt, bookingId)
      .query(`${BOOKING_SEAT_SELECT} WHERE bs.booking_id = @bookingId
        ${BOOKING_SEAT_ORDER}`)).recordset;
  }

  return {
    async releaseExpiredShowtimeBookings({ showtimeId }) {
      await releaseExpiredForShowtime(() => pool.request(), showtimeId);
    },
    createBooking,
    async scanBooking({ userId, branchId, bookingCode, deviceCode }, at) {
      const run = () => pool.request();
      const scanResult = await run()
        .input('booking_code', sql.VarChar(40), bookingCode)
        .input('branch_id', sql.BigInt, branchId)
        .input('scanned_by_user_id', sql.BigInt, userId)
        .input('device_code', sql.VarChar(50), deviceCode ?? null)
        .input('scan_at', sql.DateTime2, new Date(at))
        .execute('dbo.usp_booking_scan');
      const row = scanResult.recordset[0];
      if (!row) throw new HttpError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
      if (!row.success) {
        if (row.error_message === 'Booking không tồn tại.') throw new HttpError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
        if (row.error_message === 'Booking không ở trạng thái CONFIRMED.') throw new HttpError(409, 'BOOKING_NOT_CONFIRMED', 'Booking is not confirmed.');
        if (row.error_message === 'Booking thuộc chi nhánh khác.') throw new HttpError(403, 'BRANCH_MISMATCH', 'Booking belongs to a different branch.');
        if (row.error_message === 'Booking đã được quét trước đó.') throw new HttpError(409, 'BOOKING_ALREADY_SCANNED', 'Booking has already been scanned.');
        if (row.error_message === 'Ngoài thời gian cho phép vào rạp.') throw new HttpError(409, 'SCAN_TIME_WINDOW', 'Outside allowed entry time window.');
        if (row.error_message === 'Booking vừa được quét bởi giao dịch khác.') throw new HttpError(409, 'BOOKING_ALREADY_SCANNED', 'Booking was just scanned by another request.');
        throw new HttpError(400, 'SCAN_FAILED', row.error_message);
      }
      // Fetch full booking details with tickets for response
      const bookingRow = (await run()
        .input('bookingId', sql.BigInt, row.booking_id)
        .query(`${BOOKING_SELECT} WHERE b.booking_id = @bookingId;`)).recordset[0];
      const bookingSeatRows = (await run()
        .input('bookingId', sql.BigInt, row.booking_id)
        .query(`${BOOKING_SEAT_SELECT} WHERE bs.booking_id = @bookingId
          ${BOOKING_SEAT_ORDER}`)).recordset;
      // Fetch tickets for this booking
      const ticketRows = (await run()
        .input('bookingId', sql.BigInt, row.booking_id)
        .query(`SELECT CONVERT(varchar(20), t.ticket_id) AS ticketId, t.ticket_code AS ticketCode, t.qr_token_hash AS qrTokenHash,
            CONVERT(varchar(20), bs.showtime_seat_id) AS showtimeSeatId, s.seat_code AS seatCode
          FROM dbo.tickets t
          JOIN dbo.booking_seats bs ON bs.booking_seat_id = t.booking_seat_id
          JOIN dbo.showtime_seats ss ON ss.showtime_seat_id = bs.showtime_seat_id
          JOIN dbo.seats s ON s.seat_id = ss.seat_id
          WHERE bs.booking_id = @bookingId
          ORDER BY s.row_label, s.seat_number;`)).recordset;
      return {
        ...mapBookingRow(bookingRow, bookingSeatRows.map(mapBookingSeat)),
        scannedAt: wallStamp(row.scanned_at),
        tickets: ticketRows.map((t) => ({
          ticketId: t.ticketId,
          ticketCode: t.ticketCode,
          qrToken: t.qrTokenHash,
          seatCode: t.seatCode,
        })),
      };
    },
    async getBooking({ userId, bookingId }) {
      await pool.request()
        .input('bookingId', sql.BigInt, bookingId)
        .query(`IF EXISTS (
            SELECT 1 FROM dbo.bookings b
            JOIN dbo.booking_statuses st ON st.booking_status_id = b.booking_status_id
            WHERE b.booking_id = @bookingId AND st.status_code = 'PENDING_PAYMENT' AND b.expires_at <= SYSDATETIME()
          ) EXEC dbo.usp_booking_release @booking_id = @bookingId, @status_code = 'EXPIRED';`);
      const bookingRow = (await pool.request()
        .input('bookingId', sql.BigInt, bookingId)
        .input('userId', sql.BigInt, userId)
        .query(`${BOOKING_SELECT} WHERE b.booking_id = @bookingId AND b.user_id = @userId;`)).recordset[0];
      if (!bookingRow) return null;
      const bookingSeatRows = await loadBookingSeats(bookingId);
      return mapBookingRow(bookingRow, bookingSeatRows.map(mapBookingSeat));
    },
    async getBookingByCode({ userId, bookingCode }) {
      const found = (await pool.request()
        .input('bookingCode', sql.VarChar(40), bookingCode)
        .query(`SELECT CONVERT(varchar(20), booking_id) AS id FROM dbo.bookings WHERE booking_code = @bookingCode;`)).recordset[0];
      if (!found) return null;
      await pool.request()
        .input('bookingId', sql.BigInt, found.id)
        .query(`IF EXISTS (
            SELECT 1 FROM dbo.bookings b
            JOIN dbo.booking_statuses st ON st.booking_status_id = b.booking_status_id
            WHERE b.booking_id = @bookingId AND st.status_code = 'PENDING_PAYMENT' AND b.expires_at <= SYSDATETIME()
          ) EXEC dbo.usp_booking_release @booking_id = @bookingId, @status_code = 'EXPIRED';`);
      const bookingRow = (await pool.request()
        .input('bookingId', sql.BigInt, found.id)
        .input('userId', sql.BigInt, userId)
        .query(`${BOOKING_SELECT} WHERE b.booking_id = @bookingId AND b.user_id = @userId;`)).recordset[0];
      if (!bookingRow) return null;
      const bookingSeatRows = await loadBookingSeats(bookingRow.id);
      return mapBookingRow(bookingRow, bookingSeatRows.map(mapBookingSeat));
    },
    async listBookings({ userId }) {
      const expiredRows = (await pool.request()
        .input('userId', sql.BigInt, userId)
        .query(`SELECT b.booking_id FROM dbo.bookings b
          JOIN dbo.booking_statuses st ON st.booking_status_id = b.booking_status_id
          WHERE b.user_id = @userId AND st.status_code = 'PENDING_PAYMENT' AND b.expires_at <= SYSDATETIME();`)).recordset;
      for (const row of expiredRows) {
        await pool.request()
          .input('booking_id', sql.BigInt, row.booking_id)
          .input('status_code', sql.VarChar(30), 'EXPIRED')
          .execute('dbo.usp_booking_release');
      }
      const bookingRows = (await pool.request()
        .input('userId', sql.BigInt, userId)
        .query(`${BOOKING_SELECT} WHERE b.user_id = @userId ORDER BY b.created_at DESC, b.booking_id DESC;`)).recordset;
      if (bookingRows.length === 0) return [];
      const seatRequest = pool.request();
      bookingRows.forEach((row, index) => seatRequest.input(`booking${index}`, sql.BigInt, row.id));
      const seatRows = (await seatRequest.query(`${BOOKING_SEAT_SELECT}
        WHERE bs.booking_id IN (${bookingRows.map((_, index) => `@booking${index}`).join(', ')})
        ORDER BY bs.booking_id, COALESCE(layout_seat.row_position, 2147483647), s.row_label,
          COALESCE(layout_seat.column_position, s.seat_number), s.seat_number;`)).recordset;
      const seatsByBooking = new Map();
      for (const seatRow of seatRows) {
        const list = seatsByBooking.get(seatRow.bookingId) ?? [];
        list.push(mapBookingSeat(seatRow));
        seatsByBooking.set(seatRow.bookingId, list);
      }
      return bookingRows.map((row) => mapBookingRow(row, seatsByBooking.get(row.id) ?? []));
    },
  };
}
