import { useCallback, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronRight, Clock, Ticket, XCircle } from 'lucide-react';
import {
  BOOKING_STATUS_LABELS,
  bookingHoldDeadlineLabel,
  bookingPayTotal,
  bookingShowtimeLabels,
} from '../utils/bookingApi.js';
import { bookingStore } from '../utils/bookingStore.js';
import { formatCurrency } from '../utils/bookingLogic.js';
import './TicketsPage.css';

const DEFAULT_POSTER = '/src/assets/images/poster_solar_odyssey_1794993128134.jpg';

const STATUS_TABS = [
  { id: 'all', label: 'Tất cả vé' },
  { id: 'CONFIRMED', label: 'Đã xác nhận' },
  { id: 'PENDING_PAYMENT', label: 'Chờ thanh toán' },
  { id: 'EXPIRED', label: 'Hết hạn' },
  { id: 'CANCELLED', label: 'Đã hủy' },
];

const STATUS_VIEW = {
  CONFIRMED: { icon: CheckCircle2, tone: 'confirmed' },
  PENDING_PAYMENT: { icon: Clock, tone: 'pending' },
  EXPIRED: { icon: XCircle, tone: 'cancelled' },
  CANCELLED: { icon: XCircle, tone: 'cancelled' },
};

export default function TicketsPage() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [query, setQuery] = useState('');

  const snapshot = useSyncExternalStore(
    bookingStore.subscribe,
    bookingStore.getSnapshot,
    bookingStore.getSnapshot
  );
  const list = snapshot.list;

  const bindPage = useCallback((node) => {
    if (!node) return undefined;
    bookingStore.loadList(true);
    return undefined;
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = list.bookings.filter((item) => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    if (!normalizedQuery) return true;
    const haystack = `${item.code} ${item.movieTitle} ${item.showtime?.branchName ?? ''}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  return (
    <main ref={bindPage}>
      <section className="page-banner">
        <div className="container">
          <h1 className="page-banner-title">Vé của tôi</h1>
          <p className="page-banner-sub">
            Xem vé điện tử, mã QR, ghế ngồi, bắp nước và trạng thái đặt vé.
          </p>
        </div>
      </section>

      <section className="section section-light">
        <div className="container">
          <div className="tickets-toolbar">
            <div className="movies-status-tabs" role="tablist" aria-label="Lọc vé theo trạng thái">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === tab.id}
                  className={`movies-status-tab ${statusFilter === tab.id ? 'is-active' : ''}`}
                  onClick={() => setStatusFilter(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="movies-controls">
              <label htmlFor="tickets-search" className="sr-only">
                Tìm theo mã đặt vé hoặc tên phim
              </label>
              <input
                id="tickets-search"
                type="search"
                className="movies-search-input"
                placeholder="Tìm mã vé (ví dụ BKG-…) hoặc phim..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          {list.status === 'error' && list.bookings.length > 0 && (
            <div className="catalog-state">
              <p role="alert">{list.error}</p>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => bookingStore.loadList(true)}>Thử lại</button>
            </div>
          )}

          {list.status === 'loading' && list.bookings.length === 0 ? (
            <div className="catalog-state">Đang tải vé từ hệ thống…</div>
          ) : list.status === 'error' && list.bookings.length === 0 ? (
            <div className="movies-empty-state" style={{ backgroundColor: 'var(--color-white)' }}>
              <p style={{ marginBottom: '14px' }} role="alert">
                {list.error}
              </p>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => bookingStore.loadList(true)}>Thử lại</button>
              <Link to="/movies" className="btn btn-primary btn-sm">
                Đặt vé xem phim
              </Link>
            </div>
          ) : filtered.length === 0 ? (
            <div className="movies-empty-state" style={{ backgroundColor: 'var(--color-white)' }}>
              <Ticket size={28} style={{ margin: '0 auto 10px', color: 'var(--color-primary)' }} aria-hidden="true" />
              <p style={{ marginBottom: '14px' }}>
                Không có vé phù hợp với bộ lọc hiện tại.
              </p>
              <Link to="/movies" className="btn btn-primary btn-sm">
                Đặt vé xem phim
              </Link>
            </div>
          ) : (
            <div className="tickets-list">
              {filtered.map((item) => {
                const statusView = STATUS_VIEW[item.status] ?? STATUS_VIEW.CONFIRMED;
                const StatusIcon = statusView.icon;
                const startLabels = bookingShowtimeLabels(item.showtime);
                const holdDeadline =
                  item.status === 'PENDING_PAYMENT'
                    ? bookingHoldDeadlineLabel(item.expiresAt)
                    : '';
                return (
                  <article key={item.code} className="ticket-list-card">
                    <img
                      src={item.moviePoster || DEFAULT_POSTER}
                      alt={`Áp phích phim ${item.movieTitle || 'MARUMO'}`}
                      className="ticket-list-poster"
                      referrerPolicy="no-referrer"
                    />

                    <div>
                      <div className="ticket-list-top">
                        <span className="ticket-ref-code">{item.code}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={`ticket-status-text ticket-status-text--${statusView.tone}`}
                        >
                          <StatusIcon size={15} aria-hidden="true" />
                          <span>{BOOKING_STATUS_LABELS[item.status] ?? item.status}</span>
                        </span>
                      </div>

                      <h2 className="ticket-list-title">
                        <Link to={`/tickets/${item.code}`}>
                          {item.movieTitle || 'Vé MARUMO'}
                        </Link>
                      </h2>

                      <div className="ticket-list-meta tabular-nums">
                        <span>{item.showtime?.branchName}</span>
                        <span>
                          {startLabels.dateLabel} · {startLabels.timeLabel} (
                          {item.showtime?.formatName})
                        </span>
                        <span>Ghế: {item.seats.map((seat) => seat.code).join(', ')}</span>
                        {holdDeadline && <span>Giữ ghế đến {holdDeadline}</span>}
                      </div>
                    </div>

                    <div className="ticket-list-right">
                      <span className="ticket-list-total tabular-nums">
                        {formatCurrency(bookingPayTotal(item))}
                      </span>
                      <Link to={`/tickets/${item.code}`} className="btn btn-primary btn-sm">
                        <span>Xem chi tiết vé</span>
                        <ChevronRight size={15} aria-hidden="true" />
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
