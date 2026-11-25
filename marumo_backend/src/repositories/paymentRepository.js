import sql from 'mssql';
import { HttpError } from '../utils/validation.js';

const PAYMENT_SELECT = `SELECT
    CONVERT(varchar(20), pt.payment_transaction_id) AS id,
    pt.payment_code AS code,
    CONVERT(varchar(20), pt.booking_id) AS bookingId,
    pm.method_code AS methodCode,
    pp.provider_code AS providerCode,
    pt.amount AS amount,
    pt.currency_code AS currencyCode,
    pt.status AS status,
    pt.provider_transaction_id AS providerTransactionId,
    pt.paid_at AS paidAt,
    pt.expired_at AS expiresAt,
    pt.created_at AS createdAt
  FROM dbo.payment_transactions pt
  JOIN dbo.payment_methods pm ON pm.payment_method_id = pt.payment_method_id
  LEFT JOIN dbo.payment_providers pp ON pp.provider_id = pt.provider_id`;

const UNFINISHED_ATTEMPT = `SELECT TOP (1) CONVERT(varchar(20), payment_attempt_id) AS id, attempt_number
  FROM dbo.payment_attempts
  WHERE payment_transaction_id = @paymentTransactionId AND status IN ('PENDING','PROCESSING')
  ORDER BY attempt_number DESC;`;

function bookingNotFound() {
  return new HttpError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
}

function bookingNotPending() {
  return new HttpError(409, 'BOOKING_NOT_PENDING_PAYMENT', 'The booking is not awaiting payment.');
}

function paymentNotPending() {
  return new HttpError(409, 'PAYMENT_NOT_PENDING', 'The payment transaction is not awaiting payment.');
}

function wallStamp(value) {
  return `${value.toISOString().slice(0, 19)}+07:00`;
}

function mapPayment(row) {
  return {
    id: row.id,
    code: row.code,
    bookingId: row.bookingId,
    methodCode: row.methodCode,
    providerCode: row.providerCode,
    amount: Number(row.amount),
    currencyCode: row.currencyCode,
    status: row.status,
    providerTransactionId: row.providerTransactionId,
    paidAt: row.paidAt === null ? null : row.paidAt.toISOString(),
    expiresAt: row.expiresAt === null ? null : wallStamp(row.expiresAt),
    createdAt: row.createdAt.toISOString(),
  };
}

function procError(error, mapping) {
  const mapped = mapping[error?.number];
  if (mapped) throw mapped();
  throw error;
}

export function createMemoryPaymentRepository(bookingRepository) {
  const payments = new Map();
  const attempts = new Map();
  const events = [];
  let nextAttemptId = 1n;

  return {
    async createBookingPayment({ userId, bookingId }, _at) {
      const booking = await bookingRepository.getBooking({ userId, bookingId }, Date.now());
      if (!booking) throw bookingNotFound();
      if (booking.status !== 'PENDING_PAYMENT') throw bookingNotPending();
      let payment = payments.get(bookingId);
      if (!payment) {
        payment = {
          id: String(payments.size + 1),
          code: `PAY-MEM-${bookingId}`,
          bookingId,
          methodCode: 'CARD',
          providerCode: 'VNPAY',
          amount: booking.totalAmount,
          currencyCode: booking.currencyCode,
          status: 'PENDING',
          providerTransactionId: null,
          paidAt: null,
          expiresAt: booking.expiresAt,
          createdAt: new Date().toISOString(),
        };
        payments.set(bookingId, payment);
      }
      if (!attempts.has(payment.id)) {
        attempts.set(payment.id, { id: String(nextAttemptId++), number: attempts.size + 1, status: 'PENDING' });
        payment.status = 'PROCESSING';
      }
      return { payment: { ...payment }, orderInfo: `MARUMO booking ${booking.code}`, txnRef: payment.code };
    },
    async applyProviderCallback({ txnRef, signatureValid, eventType, payload, providerTransactionId }, at) {
      const payment = [...payments.values()].find((row) => row.code === txnRef) ?? null;
      events.push({ txnRef, signatureValid, eventType, payload, receivedAt: at, processingStatus: signatureValid ? 'PROCESSED' : 'FAILED' });
      if (!signatureValid || !payment) {
        return { event: { processingStatus: 'FAILED', isDuplicate: false, errorMessage: signatureValid ? null : 'Invalid signature.' }, payment: null, booking: null };
      }
      if (eventType === 'PAYMENT_SUCCESS') {
        payment.status = 'SUCCESS';
        payment.paidAt = new Date(at).toISOString();
        payment.providerTransactionId = providerTransactionId;
      } else if (eventType === 'PAYMENT_FAILED') {
        attempts.get(payment.id).status = 'FAILED';
      }
      return { event: { processingStatus: 'PROCESSED', isDuplicate: false, errorMessage: null }, payment: { ...payment }, booking: null };
    },
  };
}

export function createSqlPaymentRepository(pool) {
  async function lookupScalar(table, keyColumn, valueColumn, code, type) {
    const result = await pool.request().input('code', type, code).query(
      `SELECT TOP (1) ${keyColumn} AS id FROM ${table} WHERE ${valueColumn} = @code AND is_active = 1;`,
    );
    const row = result.recordset[0];
    if (!row) throw new Error(`${table} is missing an active ${valueColumn}='${code}' row.`);
    return row.id;
  }

  const providerId = (code) => lookupScalar('dbo.payment_providers', 'provider_id', 'provider_code', code, sql.VarChar(30));
  const methodId = (code) => lookupScalar('dbo.payment_methods', 'payment_method_id', 'method_code', code, sql.VarChar(30));

  async function createBookingPayment({ userId, bookingId }, _at) {
    const owned = await pool.request()
      .input('bookingId', sql.BigInt, bookingId)
      .input('userId', sql.BigInt, userId)
      .query(`SELECT booking_code, booking_status_id FROM dbo.bookings WHERE booking_id = @bookingId AND user_id = @userId;`);
    const bookingRow = owned.recordset[0];
    if (!bookingRow) throw bookingNotFound();
    const [vnpayId, cardMethodId] = await Promise.all([providerId('VNPAY'), methodId('CARD')]);
    let created;
    try {
      created = await pool.request()
        .input('booking_id', sql.BigInt, bookingId)
        .input('payment_method_id', sql.Int, cardMethodId)
        .input('idempotency_key', sql.VarChar(100), `vnpay-booking-${bookingId}`)
        .input('provider_id', sql.Int, vnpayId)
        .execute('dbo.usp_payment_create');
    } catch (error) {
      procError(error, {
        52102: bookingNotPending,
        52103: () => new HttpError(409, 'PAYMENT_ALREADY_EXISTS', 'The booking already has a payment transaction.'),
        52108: () => new HttpError(409, 'BOOKING_EXPIRED', 'The booking hold has expired.'),
        52408: () => new HttpError(409, 'FNB_STOCK_BUSY', 'Không lấy được khóa cập nhật kho F&B.'),
        52411: () => new HttpError(409, 'FNB_STOCK_INSUFFICIENT', 'Không đủ nguyên liệu có thể giữ cho đơn F&B.'),
      });
    }
    const paymentRow = created.recordset[0];
    let attempt = (await pool.request()
      .input('paymentTransactionId', sql.BigInt, paymentRow.payment_transaction_id)
      .query(UNFINISHED_ATTEMPT)).recordset[0];
    if (!attempt) {
      try {
        const started = await pool.request()
          .input('payment_transaction_id', sql.BigInt, paymentRow.payment_transaction_id)
          .input('request_reference', sql.VarChar(100), paymentRow.payment_code)
          .execute('dbo.usp_payment_attempt_start');
        attempt = { id: String(started.recordset[0].payment_attempt_id), number: started.recordset[0].attempt_number };
      } catch (error) {
        if (error?.number === 52114) {
          attempt = (await pool.request()
            .input('paymentTransactionId', sql.BigInt, paymentRow.payment_transaction_id)
            .query(UNFINISHED_ATTEMPT)).recordset[0];
          if (!attempt) throw paymentNotPending();
        } else procError(error, {
          52111: paymentNotPending,
          52112: paymentNotPending,
        });
      }
    }
    const refreshed = (await pool.request()
      .input('paymentTransactionId', sql.BigInt, paymentRow.payment_transaction_id)
      .query(`${PAYMENT_SELECT} WHERE pt.payment_transaction_id = @paymentTransactionId;`)).recordset[0];
    return {
      payment: mapPayment(refreshed),
      attempt: { id: attempt.id, number: attempt.attempt_number },
      orderInfo: `MARUMO-${bookingRow.booking_code}`,
      txnRef: paymentRow.payment_code,
    };
  }

  async function applyProviderCallback({ providerCode, txnRef, signatureValid, eventType, payload, providerTransactionId, eventAmount, eventCurrency, paidAt }, _at) {
    const [vnpayId] = await Promise.all([providerId(providerCode)]);
    const tx = (await pool.request()
      .input('code', sql.VarChar(50), txnRef)
      .query(`SELECT CONVERT(varchar(20), payment_transaction_id) AS id, provider_id, status FROM dbo.payment_transactions WHERE payment_code = @code;`)).recordset[0];
    const applied = await pool.request()
      .input('provider_id', sql.Int, vnpayId)
      .input('payment_transaction_id', sql.BigInt, tx ? tx.id : null)
      .input('provider_event_id', sql.VarChar(150), `${txnRef}-${payload.vnp_TransactionNo ?? ''}-${payload.vnp_PayDate ?? ''}`)
      .input('event_type', sql.VarChar(100), eventType)
      .input('event_payload', sql.NVarChar(sql.MAX), JSON.stringify(payload))
      .input('signature_valid', sql.Bit, signatureValid)
      .input('provider_transaction_id', sql.VarChar(150), providerTransactionId ?? null)
      .input('event_amount', sql.Decimal(18, 2), eventAmount ?? null)
      .input('event_currency', sql.Char(3), eventCurrency ?? null)
      .input('paid_at', sql.DateTime2, paidAt ?? null)
      .execute('dbo.usp_payment_provider_event_apply');
    const eventRow = applied.recordset[0];
    const payment = tx
      ? mapPayment((await pool.request()
        .input('paymentTransactionId', sql.BigInt, tx.id)
        .query(`${PAYMENT_SELECT} WHERE pt.payment_transaction_id = @paymentTransactionId;`)).recordset[0])
      : null;
    const booking = payment?.bookingId
      ? (await pool.request()
        .input('bookingId', sql.BigInt, payment.bookingId)
        .query(`SELECT CONVERT(varchar(20), b.booking_id) AS id, st.status_code AS status
          FROM dbo.bookings b JOIN dbo.booking_statuses st ON st.booking_status_id = b.booking_status_id
          WHERE b.booking_id = @bookingId;`)).recordset[0]
      : null;
    return {
      event: { processingStatus: eventRow.processing_status, isDuplicate: Boolean(eventRow.is_duplicate), errorMessage: eventRow.error_message ?? null },
      payment,
      booking: booking ? { id: booking.id, status: booking.status } : null,
    };
  }

  return { createBookingPayment, applyProviderCallback };
}
