import sql from 'mssql';
import { HttpError } from '../utils/validation.js';
import { ADMIN_PAYMENT_STATUSES } from '../utils/adminBookingValidation.js';

function permissionScope(branch, permission) {
  return `EXISTS (SELECT 1 FROM dbo.user_roles ur
    JOIN dbo.roles r ON r.role_id = ur.role_id
    JOIN dbo.role_permissions rp ON rp.role_id = r.role_id
    JOIN dbo.permissions p ON p.permission_id = rp.permission_id
    WHERE ur.user_id = @actorUserId AND ur.revoked_at IS NULL AND r.is_active = 1
      AND p.permission_code = '${permission}' AND (r.scope_type = 'GLOBAL' OR
        (r.scope_type = 'BRANCH' AND EXISTS (SELECT 1 FROM dbo.user_branch_assignments a
          WHERE a.user_id = ur.user_id AND a.role_id = ur.role_id AND a.branch_id = ${branch}
            AND a.status = 'ACTIVE' AND a.starts_at <= @at AND (a.ends_at IS NULL OR a.ends_at > @at)))))`;
}

const VIEW_SCOPE = permissionScope('b.branch_id', 'booking.view');
const CANCEL_SCOPE = permissionScope('b.branch_id', 'booking.cancel');
const PAYMENT_STATUS = "CASE WHEN redeemed.redemptionCount > 0 THEN 'SUCCESS' ELSE COALESCE(pt.status, 'NOT_STARTED') END";
const UNPAID_PENDING = `st.status_code = 'PENDING_PAYMENT' AND b.expires_at > SYSDATETIME()
  AND COALESCE(pt.status, '') <> 'SUCCESS' AND redeemed.redemptionCount = 0
  AND counts.ticketCount = 0 AND (fo.fnb_order_id IS NULL OR fo.order_status IN ('PENDING', 'CANCELLED'))`;

const BOOKING_FROM = `FROM dbo.bookings b
  JOIN dbo.booking_statuses st ON st.booking_status_id = b.booking_status_id
  JOIN dbo.showtimes s ON s.showtime_id = b.showtime_id
  JOIN dbo.branches br ON br.branch_id = b.branch_id
  JOIN dbo.auditoriums a ON a.auditorium_id = s.auditorium_id
  JOIN dbo.movie_versions mv ON mv.movie_version_id = s.movie_version_id
  JOIN dbo.movies m ON m.movie_id = mv.movie_id
  JOIN dbo.screening_formats f ON f.format_id = mv.format_id
  LEFT JOIN dbo.users u ON u.user_id = b.user_id
  LEFT JOIN dbo.fnb_orders fo ON fo.booking_id = b.booking_id
  LEFT JOIN dbo.payment_transactions pt ON pt.booking_id = b.booking_id
  LEFT JOIN dbo.payment_methods pm ON pm.payment_method_id = pt.payment_method_id
  OUTER APPLY (SELECT COUNT_BIG(*) AS redemptionCount,
    COALESCE(SUM(-CONVERT(bigint, ll.points_delta)), 0) AS pointsRedeemed
    FROM dbo.loyalty_ledger ll WHERE ll.booking_id = b.booking_id AND ll.change_type = 'REDEEM') redeemed
  OUTER APPLY (SELECT COUNT(*) AS seatCount, COUNT(t.ticket_id) AS ticketCount
    FROM dbo.booking_seats bs LEFT JOIN dbo.tickets t ON t.booking_seat_id = bs.booking_seat_id
    WHERE bs.booking_id = b.booking_id) counts`;

const PROJECTION = `CONVERT(varchar(20), b.booking_id) AS id, b.booking_code AS code,
  st.status_code AS status, CONVERT(varchar(20), b.branch_id) AS branchId,
  CONVERT(varchar(20), b.showtime_id) AS showtimeId, b.booking_channel AS channel,
  COALESCE(u.full_name, b.guest_name) AS customerName, COALESCE(u.email, b.guest_email) AS customerEmail,
  COALESCE(u.phone, b.guest_phone) AS customerPhone, counts.seatCount, counts.ticketCount,
  b.subtotal_amount AS subtotalAmount, b.discount_amount AS discountAmount, b.total_amount AS totalAmount,
  COALESCE(fo.total_amount, 0) AS fnbTotalAmount,
  b.total_amount + COALESCE(fo.total_amount, 0) AS grandTotalAmount, b.currency_code AS currencyCode,
  b.created_at AS createdAt, b.expires_at AS expiresAt, b.confirmed_at AS confirmedAt,
  s.start_at AS startAt, s.end_at AS endAt, br.branch_name AS branchName,
  a.auditorium_name AS auditoriumName, f.format_name AS formatName,
  CONVERT(varchar(20), m.movie_id) AS movieId, m.title AS movieTitle,
  ${PAYMENT_STATUS} AS paymentStatus,
  CASE WHEN redeemed.redemptionCount > 0 THEN 'POINTS' ELSE pm.method_code END AS paymentMethod,
  redeemed.pointsRedeemed, CONVERT(bit, CASE WHEN ${CANCEL_SCOPE} AND ${UNPAID_PENDING} THEN 1 ELSE 0 END) AS canCancel`;

function utc(value) {
  return value?.toISOString() ?? null;
}

function local(value) {
  return value ? `${value.toISOString().slice(0, 19)}+07:00` : null;
}

function mapSummary(row) {
  const { startAt, endAt, branchName, auditoriumName, formatName, movieId, movieTitle, ...summary } = row;
  for (const key of ['subtotalAmount', 'discountAmount', 'totalAmount', 'fnbTotalAmount', 'grandTotalAmount', 'pointsRedeemed']) summary[key] = Number(summary[key]);
  return {
    ...summary, canCancel: Boolean(row.canCancel), createdAt: utc(row.createdAt),
    expiresAt: local(row.expiresAt), confirmedAt: local(row.confirmedAt),
    showtime: { id: row.showtimeId, startAt: utc(startAt), endAt: utc(endAt), branchName, auditoriumName, formatName },
    movie: { id: movieId, title: movieTitle },
  };
}

export function createSqlAdminBookingRepository(pool) {
  function request(userId, at, transaction = null) {
    return (transaction ? new sql.Request(transaction) : pool.request())
      .input('actorUserId', sql.BigInt, userId).input('at', sql.DateTime2, new Date(at));
  }

  async function getAdminBooking({ userId, bookingId }, at) {
    const row = (await request(userId, at).input('bookingId', sql.BigInt, bookingId)
      .query(`SELECT ${PROJECTION} ${BOOKING_FROM} WHERE b.booking_id = @bookingId AND ${VIEW_SCOPE};`)).recordset[0];
    if (!row) return null;
    const detail = await request(userId, at).input('bookingId', sql.BigInt, bookingId).query(`
      SELECT CONVERT(varchar(20), bs.booking_seat_id) AS id, se.seat_code AS code,
        ty.type_name AS typeName, bs.seat_price AS price, bs.discount_amount AS discountAmount,
        bs.final_price AS finalPrice, bs.released_at AS releasedAt,
        t.ticket_code AS ticketCode, ts.status_code AS ticketStatus
      FROM dbo.booking_seats bs JOIN dbo.showtime_seats ss ON ss.showtime_seat_id = bs.showtime_seat_id
      JOIN dbo.seats se ON se.seat_id = ss.seat_id JOIN dbo.seat_types ty ON ty.seat_type_id = se.seat_type_id
      LEFT JOIN dbo.tickets t ON t.booking_seat_id = bs.booking_seat_id
      LEFT JOIN dbo.ticket_statuses ts ON ts.ticket_status_id = t.ticket_status_id
      WHERE bs.booking_id = @bookingId ORDER BY se.row_label, se.seat_number;
      SELECT CONVERT(varchar(20), fo.fnb_order_id) AS id, fo.order_code AS code, fo.order_status AS status,
        fo.subtotal AS subtotalAmount, fo.discount_amount AS discountAmount, fo.total_amount AS totalAmount
      FROM dbo.fnb_orders fo WHERE fo.booking_id = @bookingId;
      SELECT i.line_number AS lineNumber, i.item_name_snapshot AS name, i.item_code_snapshot AS code,
        i.unit_price AS unitPrice, i.quantity, i.line_total AS lineTotal,
        CASE WHEN i.combo_id IS NULL THEN 'PRODUCT' ELSE 'COMBO' END AS kind
      FROM dbo.fnb_order_items i JOIN dbo.fnb_orders fo ON fo.fnb_order_id = i.fnb_order_id
      WHERE fo.booking_id = @bookingId ORDER BY i.line_number;
      SELECT CONVERT(varchar(20), pt.payment_transaction_id) AS id, pt.payment_code AS code,
        pt.status, pm.method_code AS method, pt.amount, pt.currency_code AS currencyCode, pt.paid_at AS paidAt
      FROM dbo.payment_transactions pt JOIN dbo.payment_methods pm ON pm.payment_method_id = pt.payment_method_id
      WHERE pt.booking_id = @bookingId;
      SELECT CONVERT(varchar(20), c.cancellation_id) AS id, c.cancellation_code AS code,
        c.cancellation_reason AS reason, c.cancellation_status AS status, c.requested_at AS requestedAt,
        c.processed_at AS processedAt, requested.full_name AS requestedBy, processed.full_name AS processedBy
      FROM dbo.booking_cancellations c LEFT JOIN dbo.users requested ON requested.user_id = c.requested_by_user_id
      LEFT JOIN dbo.users processed ON processed.user_id = c.processed_by_user_id
      WHERE c.booking_id = @bookingId ORDER BY c.cancellation_id;`);
    const [seats, orders, items, payments, cancellations] = detail.recordsets;
    const order = orders[0];
    const payment = payments[0];
    return {
      ...mapSummary(row),
      seats: seats.map((seat) => ({ ...seat, price: Number(seat.price), discountAmount: Number(seat.discountAmount), finalPrice: Number(seat.finalPrice), releasedAt: utc(seat.releasedAt) })),
      fnbOrder: order ? { ...order, subtotalAmount: Number(order.subtotalAmount), discountAmount: Number(order.discountAmount), totalAmount: Number(order.totalAmount), items: items.map((item) => ({ ...item, unitPrice: Number(item.unitPrice), lineTotal: Number(item.lineTotal) })) } : null,
      payment: payment ? { ...payment, amount: Number(payment.amount), paidAt: local(payment.paidAt) } : null,
      cancellations: cancellations.map((cancellation) => ({ ...cancellation, requestedAt: local(cancellation.requestedAt), processedAt: local(cancellation.processedAt) })),
    };
  }

  return {
    async adminBookingOptions({ userId }, at) {
      const result = await request(userId, at).query(`
        SELECT CONVERT(varchar(20), br.branch_id) AS id, br.branch_name AS name,
          CONVERT(bit, CASE WHEN ${permissionScope('br.branch_id', 'booking.cancel')} THEN 1 ELSE 0 END) AS canCancel
        FROM dbo.branches br WHERE ${permissionScope('br.branch_id', 'booking.view')} ORDER BY br.branch_id;
        SELECT status_code AS code, status_name AS name FROM dbo.booking_statuses ORDER BY display_order, booking_status_id;`);
      return { branches: result.recordsets[0], bookingStatuses: result.recordsets[1], paymentStatuses: ADMIN_PAYMENT_STATUSES };
    },
    async listAdminBookings({ userId, limit, after = null, branchId = null, status = null, paymentStatus = null, q = '' }, at) {
      const search = `%${q.replaceAll('~', '~~').replaceAll('%', '~%').replaceAll('_', '~_').replaceAll('[', '~[')}%`;
      const result = await request(userId, at).input('limit', sql.Int, limit).input('after', sql.BigInt, after)
        .input('branchId', sql.BigInt, branchId).input('status', sql.VarChar(30), status)
        .input('paymentStatus', sql.VarChar(30), paymentStatus).input('q', sql.NVarChar(250), search)
        .query(`SELECT TOP (@limit) ${PROJECTION} ${BOOKING_FROM}
          WHERE ${VIEW_SCOPE} AND (@after IS NULL OR b.booking_id > @after)
            AND (@branchId IS NULL OR b.branch_id = @branchId) AND (@status IS NULL OR st.status_code = @status)
            AND (@paymentStatus IS NULL OR ${PAYMENT_STATUS} = @paymentStatus)
            AND (b.booking_code LIKE @q ESCAPE '~' OR COALESCE(u.full_name, b.guest_name) LIKE @q ESCAPE '~'
              OR COALESCE(u.email, b.guest_email) LIKE @q ESCAPE '~' OR m.title LIKE @q ESCAPE '~')
          ORDER BY b.booking_id;`);
      return result.recordset.map(mapSummary);
    },
    getAdminBooking,
    async cancelAdminBooking({ userId, bookingId, reason }, at) {
      const transaction = new sql.Transaction(pool);
      await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
      try {
        await request(userId, at, transaction).input('bookingId', sql.BigInt, bookingId)
          .query(`SELECT payment_transaction_id FROM dbo.payment_transactions WITH (UPDLOCK, HOLDLOCK) WHERE booking_id = @bookingId;`);
        const row = (await request(userId, at, transaction).input('bookingId', sql.BigInt, bookingId)
          .query(`SELECT st.status_code AS status, b.expires_at AS expiresAt
            FROM dbo.bookings b WITH (UPDLOCK, HOLDLOCK)
            JOIN dbo.booking_statuses st ON st.booking_status_id = b.booking_status_id
            WHERE b.booking_id = @bookingId AND ${VIEW_SCOPE} AND ${CANCEL_SCOPE};`)).recordset[0];
        if (!row) throw new HttpError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
        if (row.status !== 'CANCELLED') {
          const eligible = (await request(userId, at, transaction).input('bookingId', sql.BigInt, bookingId)
            .query(`SELECT b.booking_id ${BOOKING_FROM} WHERE b.booking_id = @bookingId AND ${UNPAID_PENDING};`)).recordset[0];
          if (!eligible) throw new HttpError(409, 'BOOKING_NOT_CANCELLABLE', 'Chỉ hủy được đơn đang chờ thanh toán, còn hạn và chưa thu tiền.');
          await new sql.Request(transaction).input('booking_id', sql.BigInt, bookingId)
            .input('status_code', sql.VarChar(30), 'CANCELLED').input('actor_user_id', sql.BigInt, userId)
            .input('reason', sql.NVarChar(1000), reason).execute('dbo.usp_booking_release');
        }
        await transaction.commit();
      } catch (error) {
        try { await transaction.rollback(); } catch {}
        if ([52502, 52503, 52505].includes(error.number)) throw new HttpError(409, 'BOOKING_NOT_CANCELLABLE', 'Booking không còn đủ điều kiện hủy.');
        if ([1205, 1222, 52408].includes(error.number)) throw new HttpError(409, 'BOOKING_BUSY', 'Booking đang được xử lý. Vui lòng tải lại và thử lại.');
        throw error;
      }
      return getAdminBooking({ userId, bookingId }, at);
    },
  };
}
