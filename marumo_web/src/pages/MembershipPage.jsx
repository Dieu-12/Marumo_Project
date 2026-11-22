import { useCallback, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Ticket } from 'lucide-react';
import { MEMBERSHIP_TIERS } from '../data/cinemaData.js';
import {
  BOOKING_STATUS_LABELS,
  bookingShowtimeLabels,
} from '../utils/bookingApi.js';
import { bookingStore } from '../utils/bookingStore.js';
import { loyaltyStore } from '../utils/loyaltyStore.js';
import { formatCurrency } from '../utils/bookingLogic.js';
import { useApp } from '../context/AppContext.jsx';
import './MembershipPage.css';

const LEDGER_TYPE_LABELS = {
  EARN: 'Tích điểm',
  REDEEM: 'Dùng điểm',
  ADJUST: 'Điều chỉnh',
};

const LEDGER_DATE_FORMATTER = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function ledgerDateLabel(createdAt) {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? '' : LEDGER_DATE_FORMATTER.format(date);
}

export default function MembershipPage() {
  const { user, openAuthPage } = useApp();

  const loyalty = useSyncExternalStore(
    loyaltyStore.subscribe,
    loyaltyStore.getSnapshot,
    loyaltyStore.getSnapshot
  );
  const bookingSnapshot = useSyncExternalStore(
    bookingStore.subscribe,
    bookingStore.getSnapshot,
    bookingStore.getSnapshot
  );
  const ticketList = bookingSnapshot.list;

  const bindPage = useCallback((node) => {
    if (!node) return undefined;
    loyaltyStore.ensure();
    bookingStore.loadList(true);
    return undefined;
  }, []);

  return (
    <main ref={bindPage}>
      <section className="page-banner">
        <div className="container">
          <h1 className="page-banner-title">Thành viên MARUMO Club</h1>
          <p className="page-banner-sub">
            Tích điểm khi mua vé và bắp nước tại mọi rạp MARUMO.
          </p>
        </div>
      </section>

      <section className="section section-light">
        <div className="container">
          {user ? (
            <div className="member-card-banner">
              <div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                  Mã thành viên · {user.memberId}
                </div>
                <h2 style={{ fontSize: '1.625rem', color: 'var(--color-text-primary)', marginTop: '4px' }}>
                  {user.name} — {user.tier}
                </h2>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                  {user.email}
                </p>
              </div>

              <div className="member-points-box">
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                  Điểm thưởng hiện có
                </div>
                <div className="member-points-val tabular-nums">
                  {loyalty.status === 'ready'
                    ? `${loyalty.balancePoints.toLocaleString('vi-VN')} điểm`
                    : loyalty.status === 'loading' || loyalty.status === 'idle'
                      ? 'Đang tải…'
                      : 'Không khả dụng'}
                </div>
                {loyalty.status === 'error' && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }} role="alert">
                    {loyalty.error}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="member-card-banner">
              <div>
                <h2 style={{ fontSize: '1.5rem', color: 'var(--color-text-primary)', marginBottom: '6px' }}>
                  Gia nhập MARUMO Club
                </h2>
                <p style={{ fontSize: '0.9375rem', color: 'var(--color-text-secondary)' }}>
                  Tạo tài khoản miễn phí để quản lý vé và tận hưởng ưu đãi thành viên.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => openAuthPage('register')}
              >
                Đăng ký miễn phí
              </button>
            </div>
          )}

          {user && (
            <div style={{ marginTop: '24px' }}>
              <div className="section-header" style={{ marginBottom: '16px' }}>
                <div className="section-heading-group">
                  <span className="section-accent-bar" aria-hidden="true" />
                  <h2 className="section-title">Lịch sử điểm gần đây</h2>
                </div>
              </div>

              {loyalty.status === 'loading' || loyalty.status === 'idle' ? (
                <div className="catalog-state">Đang tải lịch sử điểm…</div>
              ) : loyalty.status === 'error' ? (
                <div className="catalog-state" role="alert">{loyalty.error}</div>
              ) : loyalty.ledger.length === 0 ? (
                <div className="movies-empty-state" style={{ backgroundColor: 'var(--color-white)' }}>
                  <p style={{ marginBottom: '0' }}>Chưa có giao dịch điểm nào gần đây.</p>
                </div>
              ) : (
                <div className="bookings-history-list">
                  {loyalty.ledger.map((entry, index) => (
                    <div key={`${entry.createdAt}-${index}`} className="booking-history-item">
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                            {LEDGER_TYPE_LABELS[entry.changeType] || 'Giao dịch điểm'}
                          </span>
                          {entry.description && (
                            <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                              {entry.description}
                            </span>
                          )}
                        </div>
                        <p className="tabular-nums" style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                          {ledgerDateLabel(entry.createdAt)}
                        </p>
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.125rem', color: entry.points > 0 ? 'var(--color-success)' : 'var(--color-text-primary)' }}>
                        {entry.points > 0 ? `+${entry.points.toLocaleString('vi-VN')}` : entry.points.toLocaleString('vi-VN')} điểm
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="tiers-grid" style={{ marginTop: '32px' }}>
            {MEMBERSHIP_TIERS.map((tier, idx) => (
              <div
                key={tier.id}
                className={`tier-card ${idx === 2 ? 'is-featured' : ''}`}
              >
                <div>
                  <h3 className="tier-name">{tier.name}</h3>
                  <div className="tier-req">{tier.requirement}</div>
                </div>

                <div className="tier-earn">{tier.earnRate}</div>

                <ul style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9375rem' }}>
                  {tier.perks.map((perk) => (
                    <li key={perk} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                      <CheckCircle2
                        size={16}
                        color="var(--color-primary)"
                        style={{ marginTop: '3px', flexShrink: 0 }}
                        aria-hidden="true"
                      />
                      <span>{perk}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="section-header" style={{ marginBottom: '20px', marginTop: '32px' }}>
            <div className="section-heading-group">
              <span className="section-accent-bar" aria-hidden="true" />
              <h2 className="section-title">Vé của tôi</h2>
            </div>

            <Link to="/tickets" className="btn btn-outline btn-sm">
              Quản lý tất cả vé
            </Link>
          </div>

          {ticketList.status === 'loading' && ticketList.bookings.length === 0 ? (
            <div className="catalog-state">Đang tải vé từ hệ thống…</div>
          ) : ticketList.status === 'error' && ticketList.bookings.length === 0 ? (
            <div className="movies-empty-state" style={{ backgroundColor: 'var(--color-white)' }}>
              <p style={{ marginBottom: '0' }} role="alert">{ticketList.error}</p>
            </div>
          ) : ticketList.bookings.length === 0 ? (
            <div className="movies-empty-state" style={{ backgroundColor: 'var(--color-white)' }}>
              <Ticket size={28} style={{ margin: '0 auto 10px', color: 'var(--color-primary)' }} aria-hidden="true" />
              <p style={{ marginBottom: '14px' }}>
                Bạn chưa có vé được xác nhận trong phiên này.
              </p>
              <Link to="/movies" className="btn btn-primary btn-sm">
                Khám phá phim
              </Link>
            </div>
          ) : (
            <div className="bookings-history-list">
              {ticketList.bookings.map((item) => {
                const startLabels = bookingShowtimeLabels(item.showtime);
                return (
                  <div key={item.code} className="booking-history-item">
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: 'var(--color-primary)', fontWeight: 700 }}>
                          {item.code}
                        </span>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: item.status === 'CONFIRMED' ? 'var(--color-success)' : 'var(--color-text-secondary)',
                          }}
                        >
                          {BOOKING_STATUS_LABELS[item.status] ?? item.status}
                        </span>
                      </div>
                      <h3 style={{ fontSize: '1.125rem', marginTop: '2px' }}>
                        <Link to={`/tickets/${item.code}`}>{item.movieTitle || 'Vé MARUMO'}</Link>
                      </h3>
                      <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                        {item.showtime?.branchName} · {startLabels.dateLabel} lúc {startLabels.timeLabel} (
                        {item.showtime?.formatName}) · Ghế: {item.seats.map((seat) => seat.code).join(', ')}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.125rem' }}>
                        {formatCurrency(item.totalAmount)}
                      </div>
                      <Link to={`/tickets/${item.code}`} className="btn btn-outline btn-sm">
                        Chi tiết vé
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
