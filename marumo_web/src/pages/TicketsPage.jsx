import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronRight, Ticket, XCircle } from 'lucide-react';
import { formatLabels } from '../data/cinemaData.js';
import { useApp } from '../context/AppContext.jsx';
import { filterBookings, formatCurrency } from '../utils/bookingLogic.js';
import './TicketsPage.css';

const STATUS_TABS = [
  { id: 'all', label: 'Tất cả vé' },
  { id: 'confirmed', label: 'Đã xác nhận' },
  { id: 'cancelled', label: 'Đã hủy' },
];

export default function TicketsPage() {
  const { bookings } = useApp();
  const [statusFilter, setStatusFilter] = useState('all');
  const [query, setQuery] = useState('');

  const filtered = filterBookings(bookings, { status: statusFilter, query });

  return (
    <main>
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
                placeholder="Tìm mã vé (ví dụ MRM-742810) hoặc phim..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          {filtered.length === 0 ? (
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
                const isCancelled = item.status === 'cancelled';
                return (
                  <article key={item.id} className="ticket-list-card">
                    <img
                      src={item.moviePoster || '/src/assets/images/poster_solar_odyssey_1794993128134.jpg'}
                      alt={`Áp phích phim ${item.movieTitle}`}
                      className="ticket-list-poster"
                      referrerPolicy="no-referrer"
                    />

                    <div>
                      <div className="ticket-list-top">
                        <span className="ticket-ref-code">{item.id}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={`ticket-status-text ${
                            isCancelled
                              ? 'ticket-status-text--cancelled'
                              : 'ticket-status-text--confirmed'
                          }`}
                        >
                          {isCancelled ? (
                            <>
                              <XCircle size={15} aria-hidden="true" />
                              <span>Đã hủy</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 size={15} aria-hidden="true" />
                              <span>Đã xác nhận</span>
                            </>
                          )}
                        </span>
                      </div>

                      <h2 className="ticket-list-title">
                        <Link to={`/tickets/${item.id}`}>{item.movieTitle}</Link>
                      </h2>

                      <div className="ticket-list-meta tabular-nums">
                        <span>{item.cinemaName}</span>
                        <span>
                          {item.dateLabel} · {item.time} ({formatLabels[item.format] || item.format})
                        </span>
                        <span>Ghế: {item.seats.join(', ')}</span>
                      </div>
                    </div>

                    <div className="ticket-list-right">
                      <span className="ticket-list-total tabular-nums">
                        {formatCurrency(item.grandTotal)}
                      </span>
                      <Link to={`/tickets/${item.id}`} className="btn btn-primary btn-sm">
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
