const CSRF_COOKIE = 'marumo_csrf';
const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const BOOKING_CODE_PATTERN = /^BKG-[A-Z2-9]{16}$/;
const BOOKING_STATUSES = ['PENDING_PAYMENT', 'CONFIRMED', 'EXPIRED', 'CANCELLED'];

export const BOOKING_STATUS_LABELS = {
  CONFIRMED: 'Đã xác nhận',
  PENDING_PAYMENT: 'Chờ thanh toán',
  EXPIRED: 'Hết hạn giữ ghế',
  CANCELLED: 'Đã hủy',
};

export const PAYMENT_METHOD_LABELS = {
  VNPAY: 'Thanh toán qua VNPAY',
  POINTS: 'Marumo Point',
};

const SESSION_ERROR = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
const WRITE_PROOF_ERROR = 'Phiên đã hết hạn. Vui lòng tải lại trang rồi thử lại.';
const INVALID_INPUT_ERROR = 'Dữ liệu gửi đi không hợp lệ. Vui lòng kiểm tra lại.';
const DEFAULT_ERROR = 'Không thể xử lý giao dịch lúc này. Vui lòng thử lại.';
const PAYLOAD_ERROR = 'Phản hồi hệ thống đặt vé không hợp lệ. Vui lòng thử lại.';
const BOOKING_NOT_FOUND_ERROR = 'Không tìm thấy đặt vé của bạn.';

const BOOKING_ERROR_MESSAGES = {
  SEAT_UNAVAILABLE: 'Ghế vừa chọn đã có người đặt hoặc không thể giữ. Vui lòng chọn ghế khác.',
  SHOWTIME_NOT_BOOKABLE: 'Suất chiếu không còn mở bán. Vui lòng chọn suất khác.',
  SHOWTIME_NOT_FOUND: 'Suất chiếu không tồn tại. Vui lòng chọn suất khác.',
  BOOKING_NOT_PENDING: 'Đặt vé này không còn ở trạng thái chờ thanh toán.',
  BOOKING_EXPIRED: 'Hết thời gian giữ ghế. Vui lòng đặt vé lại.',
  BOOKING_NOT_CONFIRMED: 'Vé chưa được xác nhận nên không thể quét.',
  INSUFFICIENT_POINTS: 'Số dư Marumo Point không đủ để thanh toán vé này.',
  FNB_ITEM_UNAVAILABLE: 'Một món hoặc combo vừa chọn không còn bán tại rạp này. Vui lòng chọn lại.',
  FNB_STOCK_INSUFFICIENT: 'Rạp không còn đủ nguyên liệu cho số lượng món vừa chọn. Vui lòng giảm số lượng.',
  FNB_STOCK_BUSY: 'Hệ thống đang khoá tồn kho bắp nước. Vui lòng thử lại sau ít giây.',
  PROMO_NOT_FOUND: 'Mã ưu đãi không tồn tại hoặc đã ngừng áp dụng.',
  PROMO_EXPIRED: 'Mã ưu đãi đã hết hiệu lực hoặc chưa mở.',
  PROMO_BRANCH_MISMATCH: 'Mã ưu đãi không áp dụng cho rạp của suất chiếu này.',
  PROMO_MIN_ORDER: 'Đơn chưa đạt giá trị tối thiểu để dùng mã ưu đãi.',
  PROMO_LIMIT_REACHED: 'Mã ưu đãi đã hết số lượt sử dụng.',
  PROMO_USER_LIMIT_REACHED: 'Tài khoản đã dùng hết số lượt cho phép của mã ưu đãi.',
  PROMO_NOT_APPLICABLE: 'Mã ưu đãi không áp dụng được cho đơn này.',
  PROMO_ALREADY_APPLIED: 'Đơn đã áp dụng một mã ưu đãi rồi.',
};

class BookingPayloadError extends Error {
  constructor() {
    super(PAYLOAD_ERROR);
    this.name = 'BookingPayloadError';
  }
}

class BookingRequestError extends Error {
  constructor(status, body) {
    super(errorMessage(status, body));
    this.name = 'BookingRequestError';
    this.status = status;
    this.body = body;
  }
}

function errorMessage(status, body) {
  if (status === 401) return SESSION_ERROR;
  if (status === 403) return WRITE_PROOF_ERROR;
  if (status === 404) return BOOKING_ERROR_MESSAGES[body?.code] ?? BOOKING_NOT_FOUND_ERROR;
  if (status === 409) return BOOKING_ERROR_MESSAGES[body?.code] ?? DEFAULT_ERROR;
  if (status === 400) return INVALID_INPUT_ERROR;
  return DEFAULT_ERROR;
}

export function bookingErrorMessage(error) {
  if (error instanceof BookingPayloadError || error?.name === 'BookingPayloadError') return PAYLOAD_ERROR;
  if (error instanceof BookingRequestError || error?.name === 'BookingRequestError') return error.message;
  return DEFAULT_ERROR;
}

function readCsrfToken() {
  const pair = document.cookie.split('; ').find((entry) => entry.startsWith(`${CSRF_COOKIE}=`));
  return pair ? decodeURIComponent(pair.slice(CSRF_COOKIE.length + 1)) : '';
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json', 'X-CSRF-Token': readCsrfToken() } : {}),
    },
    credentials: 'same-origin',
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  return { status: response.status, body };
}

function parseBookingShowtime(dto) {
  if (!dto || typeof dto !== 'object') return null;
  return {
    startAt: typeof dto.startAt === 'string' ? dto.startAt : '',
    branchName: typeof dto.branchName === 'string' ? dto.branchName : '',
    auditoriumName: typeof dto.auditoriumName === 'string' ? dto.auditoriumName : '',
    formatName: typeof dto.formatName === 'string' ? dto.formatName : '',
  };
}

function parseBookingMovie(dto) {
  if (!dto || typeof dto !== 'object') return null;
  return {
    title: typeof dto.title === 'string' ? dto.title : '',
    slug: typeof dto.slug === 'string' ? dto.slug : '',
    posterImage: typeof dto.posterImage === 'string' ? dto.posterImage : null,
    ratingCode: typeof dto.ratingCode === 'string' ? dto.ratingCode : '',
  };
}

function parseBookingSeat(dto) {
  if (!dto || typeof dto !== 'object' || typeof dto.code !== 'string' || dto.code.length === 0) {
    throw new BookingPayloadError();
  }
  const price = Number(dto.price);
  const finalPrice = Number(dto.finalPrice);
  const unitCount = Number(dto.unitCount);
  return {
    code: dto.code,
    typeCode: typeof dto.typeCode === 'string' ? dto.typeCode : '',
    typeName: typeof dto.typeName === 'string' ? dto.typeName : '',
    unitCount: Number.isFinite(unitCount) && unitCount > 0 ? unitCount : 1,
    price: Number.isFinite(price) ? price : 0,
    finalPrice: Number.isFinite(finalPrice) ? finalPrice : Number.isFinite(price) ? price : 0,
  };
}

function parseFnbaOrder(dto) {
  if (!dto || typeof dto !== 'object' || !Array.isArray(dto.items)) return null;
  const subtotalAmount = Number(dto.subtotalAmount);
  const totalAmount = Number(dto.totalAmount);
  if (!Number.isFinite(subtotalAmount) || !Number.isFinite(totalAmount)) return null;
  return {
    id: typeof dto.id === 'string' ? dto.id : '',
    code: typeof dto.code === 'string' ? dto.code : '',
    status: typeof dto.status === 'string' ? dto.status : '',
    subtotalAmount,
    discountAmount: Number(dto.discountAmount) || 0,
    totalAmount,
    items: dto.items.map((item) => ({
      kind: item?.kind === 'COMBO' ? 'COMBO' : 'PRODUCT',
      code: typeof item?.code === 'string' ? item.code : '',
      name: typeof item?.name === 'string' ? item.name : '',
      unitPrice: Number(item?.unitPrice) || 0,
      quantity: Number(item?.quantity) || 0,
      lineTotal: Number(item?.lineTotal) || 0,
    })),
  };
}

export function parseBooking(dto) {
  if (!dto || typeof dto !== 'object') throw new BookingPayloadError();
  const code = dto.code;
  const status = dto.status;
  const totalAmount = Number(dto.totalAmount);
  if (typeof code !== 'string' || !BOOKING_CODE_PATTERN.test(code)) throw new BookingPayloadError();
  if (!BOOKING_STATUSES.includes(status)) throw new BookingPayloadError();
  if (!Number.isFinite(totalAmount) || totalAmount < 0) throw new BookingPayloadError();
  if (!Array.isArray(dto.seats) || dto.seats.length === 0) throw new BookingPayloadError();
  if (typeof dto.showtimeId !== 'string' || !/^[1-9][0-9]{0,18}$/.test(dto.showtimeId)) throw new BookingPayloadError();
  const movie = parseBookingMovie(dto.movie);
  return {
    id: typeof dto.id === 'string' ? dto.id : '',
    code,
    status,
    branchId: typeof dto.branchId === 'string' ? dto.branchId : '',
    showtimeId: dto.showtimeId,
    subtotalAmount: Number(dto.subtotalAmount) || 0,
    discountAmount: Number(dto.discountAmount) || 0,
    totalAmount,
    currencyCode: typeof dto.currencyCode === 'string' ? dto.currencyCode : 'VND',
    expiresAt: typeof dto.expiresAt === 'string' ? dto.expiresAt : null,
    createdAt: typeof dto.createdAt === 'string' ? dto.createdAt : '',
    paymentMethod: typeof dto.paymentMethod === 'string' ? dto.paymentMethod : '',
    customerName: typeof dto.customerName === 'string' ? dto.customerName : '',
    customerEmail: typeof dto.customerEmail === 'string' ? dto.customerEmail : '',
    movieTitle: movie?.title ?? '',
    movieSlug: movie?.slug ?? '',
    moviePoster: movie?.posterImage ?? null,
    ageRating: movie?.ratingCode ?? '',
    showtime: parseBookingShowtime(dto.showtime),
    seats: dto.seats.map(parseBookingSeat),
    fnbOrder: parseFnbaOrder(dto.fnbOrder),
  };
}

export function bookingPayTotal(booking) {
  return Number(booking?.totalAmount ?? 0) + Number(booking?.fnbOrder?.totalAmount ?? 0);
}

const DATE_PARTS_FORMATTER = new Intl.DateTimeFormat('vi-VN', {
  timeZone: VIETNAM_TIME_ZONE,
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: VIETNAM_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const DEADLINE_FORMATTER = new Intl.DateTimeFormat('vi-VN', {
  timeZone: VIETNAM_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function toPartsMap(formatter, date) {
  return Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
}

function toValidDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function bookingShowtimeLabels(showtime) {
  const date = toValidDate(showtime?.startAt ?? '');
  if (!date) return { dateLabel: '', timeLabel: '' };
  const parts = toPartsMap(DATE_PARTS_FORMATTER, date);
  return {
    dateLabel: `${parts.weekday}, ${parts.day}/${parts.month}/${parts.year}`,
    timeLabel: TIME_FORMATTER.format(date),
  };
}

export function bookingHoldDeadlineLabel(expiresAt) {
  const date = toValidDate(expiresAt ?? '');
  if (!date) return '';
  const parts = toPartsMap(DEADLINE_FORMATTER, date);
  return `${parts.day}/${parts.month} ${parts.hour}:${parts.minute}`;
}

export function bookingHoldRemainingSeconds(expiresAt, now = Date.now()) {
  const date = toValidDate(expiresAt ?? '');
  if (!date) return null;
  return Math.max(0, Math.round((date.getTime() - now) / 1000));
}

export function formatHoldRemaining(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export async function createBooking({ showtimeId, seatIds, items = [], promoCode }) {
  const payload = {
    showtimeId: String(showtimeId ?? ''),
    seatIds: (Array.isArray(seatIds) ? seatIds : []).map((id) => String(id)),
  };
  const bookingItems = (Array.isArray(items) ? items : []).map((line) => line.branchProductId
      ? { branchProductId: String(line.branchProductId), quantity: line.quantity }
      : { comboId: String(line.comboId), quantity: line.quantity });
  if (bookingItems.length > 0) payload.items = bookingItems;
  if (promoCode) payload.promoCode = String(promoCode);
  const { status, body } = await request('/bookings', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (status !== 201) throw new BookingRequestError(status, body);
  if (!body?.booking) throw new BookingPayloadError();
  return parseBooking(body.booking);
}

export async function payBooking(bookingId, paymentMethod) {
  const { status, body } = await request(`/bookings/${encodeURIComponent(String(bookingId))}/payment`, {
    method: 'POST',
    body: JSON.stringify({ paymentMethod }),
  });
  if (status !== 200 && status !== 201) throw new BookingRequestError(status, body);
  if (paymentMethod === 'VNPAY') {
    if (typeof body?.paymentUrl !== 'string' || body.paymentUrl.length === 0) throw new BookingPayloadError();
    return { kind: 'redirect', paymentUrl: body.paymentUrl };
  }
  if (!body?.booking) throw new BookingPayloadError();
  return { kind: 'confirmed', booking: parseBooking(body.booking) };
}

export async function fetchBookings() {
  const { status, body } = await request('/bookings');
  if (status !== 200) throw new BookingRequestError(status, body);
  if (!Array.isArray(body?.bookings)) throw new BookingPayloadError();
  return body.bookings.map(parseBooking);
}

export async function fetchBookingByCode(bookingCode) {
  const { status, body } = await request(`/bookings/code/${encodeURIComponent(String(bookingCode))}`);
  if (status !== 200) throw new BookingRequestError(status, body);
  if (!body?.booking) throw new BookingPayloadError();
  return parseBooking(body.booking);
}

export async function fetchVnpayReturn(query) {
  const { status, body } = await request(`/payments/vnpay/return${query}`);
  if (status !== 200) throw new BookingRequestError(status, body);
  if (!body?.booking) throw new BookingPayloadError();
  return {
    booking: parseBooking(body.booking),
    processingStatus: typeof body.event?.processingStatus === 'string' ? body.event.processingStatus : '',
  };
}
