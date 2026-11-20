import { Link } from 'react-router-dom';
import { CheckCircle2, Ticket } from 'lucide-react';
import { formatLabels, MEMBERSHIP_TIERS } from '../data/cinemaData.js';
import { formatCurrency } from '../utils/bookingLogic.js';
import { useApp } from '../context/AppContext.jsx';
import './MembershipPage.css';

export default function MembershipPage() {
  const { user, bookings, openAuthPage } = useApp();

  return (
    <main>
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
                <div className="member-points-val tabular-nums">{user.points} điểm</div>
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

          <div className="tiers-grid">
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

          <div className="section-header" style={{ marginBottom: '20px' }}>
            <div className="section-heading-group">
              <span className="section-accent-bar" aria-hidden="true" />
              <h2 className="section-title">Vé của tôi</h2>
            </div>

            <Link to="/tickets" className="btn btn-outline btn-sm">
              Quản lý tất cả vé
            </Link>
          </div>

          {bookings.length === 0 ? (
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
              {bookings.map((item) => (
                <div key={item.id} className="booking-history-item">
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: 'var(--color-primary)', fontWeight: 700 }}>
                        {item.id}
                      </span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: item.status === 'cancelled' ? 'var(--color-text-secondary)' : 'var(--color-success)' }}>
                        {item.status === 'cancelled' ? 'Đã hủy' : 'Đã xác nhận'}
                      </span>
                    </div>
                    <h3 style={{ fontSize: '1.125rem', marginTop: '2px' }}>
                      <Link to={`/tickets/${item.id}`}>{item.movieTitle}</Link>
                    </h3>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                      {item.cinemaName} · {item.dateLabel} lúc {item.time} ({formatLabels[item.format] || item.format}) · Ghế: {item.seats.join(', ')}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.125rem' }}>
                      {formatCurrency(item.grandTotal)}
                    </div>
                    <Link to={`/tickets/${item.id}`} className="btn btn-outline btn-sm">
                      Chi tiết vé
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
