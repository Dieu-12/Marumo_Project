import express from 'express';
import { HttpError } from './validation.js';
import { paymentEventType, vnpayTimestampToDate, verifyCallbackSignature } from './vnpay.js';

const IPN_MESSAGES = {
  '00': 'Confirm Success',
  '01': 'Transaction is not confirmed yet',
  '02': 'Transaction was confirmed before',
  '03': 'Transaction is not found',
  '04': 'Invalid transaction amount',
  '97': 'Invalid signature',
  '99': 'Unknown error',
};

function ipnResponse(code) {
  return { RspCode: code, Message: IPN_MESSAGES[code] ?? IPN_MESSAGES['99'] };
}

export function createPaymentsRouter(repository, { now = Date.now, payment } = {}) {
  const router = express.Router();

  async function handleCallback(query) {
    const signatureValid = verifyCallbackSignature(query, payment.hashSecret);
    const txnRef = typeof query.vnp_TxnRef === 'string' && /^[A-Za-z0-9-]{1,50}$/.test(query.vnp_TxnRef) ? query.vnp_TxnRef : null;
    if (txnRef === null) return { invalid: 'txnRef', signatureValid };
    const amountValue = Number(query.vnp_Amount);
    const result = await repository.applyProviderCallback({
      providerCode: 'VNPAY',
      txnRef,
      signatureValid,
      eventType: paymentEventType(query),
      payload: query,
      providerTransactionId: typeof query.vnp_TransactionNo === 'string' ? query.vnp_TransactionNo : null,
      eventAmount: Number.isFinite(amountValue) && amountValue > 0 ? amountValue / 100 : null,
      eventCurrency: typeof query.vnp_CurrCode === 'string' ? query.vnp_CurrCode : null,
      paidAt: vnpayTimestampToDate(query.vnp_PayDate),
    }, now());
    return { result, signatureValid };
  }

  function mapIpnCode({ result, signatureValid, invalid }) {
    if (invalid === 'txnRef') return '03';
    if (!signatureValid) return '97';
    const { processingStatus, isDuplicate, errorMessage } = result.event;
    if (processingStatus === 'PROCESSED') return isDuplicate ? '02' : '00';
    if (processingStatus === 'IGNORED') return '01';
    if (result.payment === null) return '03';
    if (errorMessage?.includes('Số tiền sự kiện không khớp')) return '04';
    return '99';
  }

  router.get('/vnpay/ipn', async (req, res) => {
    const outcome = await handleCallback(req.query);
    res.status(200).json(ipnResponse(mapIpnCode(outcome)));
  });

  router.get('/vnpay/return', async (req, res) => {
    const outcome = await handleCallback(req.query);
    if (outcome.invalid === 'txnRef') throw new HttpError(400, 'INVALID_INPUT', 'The callback is missing a valid vnp_TxnRef.');
    if (!outcome.signatureValid) throw new HttpError(403, 'SIGNATURE_INVALID', 'The payment callback signature is invalid.');
    res.status(200).json({
      payment: outcome.result.payment,
      booking: outcome.result.booking,
      event: {
        processingStatus: outcome.result.event.processingStatus,
        isDuplicate: outcome.result.event.isDuplicate,
      },
    });
  });

  return router;
}
