import { createHmac, timingSafeEqual } from 'node:crypto';

const SAIGON_OFFSET_MS = 7 * 60 * 60 * 1000;
const UNSIGNED_KEYS = ['vnp_SecureHash', 'vnp_SecureHashType'];

export function signParams(params, secret) {
  const data = Object.keys(params)
    .filter((key) => !UNSIGNED_KEYS.includes(key) && params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort()
    .map((key) => `${key}=${encodeURIComponent(params[key])}`)
    .join('&');
  return createHmac('sha512', secret).update(data, 'utf8').digest('hex');
}

export function verifyCallbackSignature(query, secret) {
  const received = query.vnp_SecureHash;
  if (typeof received !== 'string' || !/^[0-9a-fA-F]{128}$/.test(received)) return false;
  const expected = Buffer.from(signParams(query, secret), 'hex');
  const actual = Buffer.from(received.toLowerCase(), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function vnpayTimestamp(instantMs) {
  return new Date(instantMs + SAIGON_OFFSET_MS).toISOString().replace(/[-:TZ]/g, '').slice(0, 14);
}

export function vnpayTimestampToDate(value) {
  const stamp = String(value ?? '');
  if (!/^[0-9]{14}$/.test(stamp)) return null;
  return new Date(`${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(8, 10)}:${stamp.slice(10, 12)}:${stamp.slice(12, 14)}Z`);
}

export function buildPaymentUrl(config, { txnRef, amount, orderInfo, ipAddr, createDate, expireDate, bankCode }) {
  const params = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: config.tmnCode,
    vnp_Amount: String(Math.round(amount * 100)),
    vnp_CurrCode: 'VND',
    vnp_TxnRef: txnRef,
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: 'other',
    vnp_Locale: 'vn',
    vnp_ReturnUrl: config.returnUrl,
    vnp_IpAddr: ipAddr,
    vnp_CreateDate: createDate,
  };
  if (expireDate) params.vnp_ExpireDate = expireDate;
  if (bankCode) params.vnp_BankCode = bankCode;
  const secureHash = signParams(params, config.hashSecret);
  const query = Object.entries(params).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
  return `${config.paymentUrl}?${query}&vnp_SecureHash=${secureHash}&vnp_SecureHashType=HMACSHA512`;
}

export function paymentEventType(params) {
  if (params.vnp_ResponseCode === '00' && params.vnp_TransactionStatus === '00') return 'PAYMENT_SUCCESS';
  if (params.vnp_ResponseCode === '00') return 'PAYMENT_PENDING';
  return 'PAYMENT_FAILED';
}
