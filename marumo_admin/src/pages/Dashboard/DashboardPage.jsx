import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  DollarSign,
  ShieldCheck,
  Ticket,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react';
import { useAdminStore } from '../../hooks/useAdminStore.jsx';
import {
  computeBookingStatusDistribution,
  computeCinemaPerformance,
  computeDashboardKpis,
} from '../../utils/analytics.js';
import { formatCompactCurrency, formatCurrency, formatNumber } from '../../utils/formatters.js';
import { BookingStatusChart } from '../../components/charts/BookingStatusChart.jsx';
import { BookingVolumeChart } from '../../components/charts/BookingVolumeChart.jsx';
import { CinemaRevenueChart } from '../../components/charts/CinemaRevenueChart.jsx';
import { RevenueLineChart } from '../../components/charts/RevenueLineChart.jsx';
import { Button } from '../../components/common/Button.jsx';
import { PageHeader } from '../../components/common/PageHeader.jsx';
import './DashboardPage.css';

const PERIOD_OPTIONS = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
];

export function DashboardPage() {
  const { cinemas, bookings, users, activities, revenueSeries } = useAdminStore();
  const [period, setPeriod] = useState('month');

  const liveKpis = useMemo(
    () => computeDashboardKpis({ bookings, cinemas, users }),
    [bookings, cinemas, users]
  );

  // Combine network baseline totals with live order mutations
  const networkRevenue = 1516100 + liveKpis.totalRevenue;
  const networkBookings = 37200 + liveKpis.totalBookings;
  const networkTickets = 81400 + liveKpis.totalTicketsSold;
  const networkCustomers = 14820 + liveKpis.registeredCustomers;

  const activeSeries = revenueSeries[period] || revenueSeries.month;
  const periodRevenueTotal = activeSeries.reduce((s, p) => s + p.revenue, 0);

  const statusDist = useMemo(
    () => computeBookingStatusDistribution(bookings),
    [bookings]
  );

  const cinemaPerformance = useMemo(
    () => computeCinemaPerformance(cinemas, bookings),
    [cinemas, bookings]
  );

  const maxBranchRevenue = Math.max(1, ...cinemaPerformance.map((c) => c.revenue));

  const kpiCards = [
    {
      title: 'Total Revenue',
      value: formatCompactCurrency(networkRevenue),
      delta: '+10.3%',
      vs: 'vs last month',
      positive: true,
      icon: DollarSign,
      primary: true,
    },
    {
      title: 'Total Bookings',
      value: formatNumber(networkBookings),
      delta: '+8.1%',
      vs: 'vs last month',
      positive: true,
      icon: Ticket,
    },
    {
      title: 'Total Tickets Sold',
      value: formatNumber(networkTickets),
      delta: '+9.4%',
      vs: 'vs last month',
      positive: true,
      icon: TrendingUp,
    },
    {
      title: 'Active Cinemas',
      value: `${liveKpis.activeCinemas} / ${cinemas.length}`,
      delta: `${cinemas.filter((c) => c.status === 'Maintenance').length} in maintenance`,
      vs: '',
      trendTone: 'warning',
      icon: Building2,
    },
    {
      title: 'Registered Customers',
      value: formatNumber(networkCustomers),
      delta: '+6.7%',
      vs: '30d growth',
      trendTone: 'up',
      icon: Users,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Operations Overview"
        subtitle="Multi-branch box office performance, ticket volume, and live cinema operations."
        actions={
          <Link to="/reports">
            <Button variant="secondary">
              <span>View Full Reports</span>
              <ArrowRight size={15} aria-hidden="true" />
            </Button>
          </Link>
        }
      />

      <section className="kpi-grid" aria-label="Key performance indicators">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          const tone = card.trendTone || (card.positive ? 'up' : 'down');
          return (
            <article key={card.title} className="kpi-card">
              <div className="kpi-card-top">
                <span className="kpi-title">{card.title}</span>
                <span className={`kpi-icon-box ${card.primary ? 'kpi-icon-box--primary' : ''}`.trim()}>
                  <Icon size={16} aria-hidden="true" />
                </span>
              </div>
              <div className="kpi-value tabular-nums">{card.value}</div>
              <div className="kpi-trend-row">
                <span className={`kpi-trend-badge kpi-trend-badge--${tone}`}>
                  {card.delta}
                </span>
                {card.vs ? <span>{card.vs}</span> : null}
              </div>
            </article>
          );
        })}
      </section>

      <section className="dashboard-grid-main">
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <h2 className="chart-card-title">Revenue Analytics</h2>
              <p className="chart-card-subtitle tabular-nums">
                Selected window total: <strong>{formatCurrency(periodRevenueTotal)}</strong>
              </p>
            </div>
            <div className="segmented-control" role="group" aria-label="Revenue timeframe">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  className={`segmented-btn ${period === opt.key ? 'segmented-btn--active' : ''}`.trim()}
                  onClick={() => setPeriod(opt.key)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <RevenueLineChart data={activeSeries} height={275} />
        </div>

        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <h2 className="chart-card-title">Booking Status Distribution</h2>
              <p className="chart-card-subtitle">Current booking ledger breakdown</p>
            </div>
          </div>
          <BookingStatusChart data={statusDist} height={215} />
        </div>
      </section>

      <section className="dashboard-grid-secondary">
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <h2 className="chart-card-title">Booking Volume &amp; Ticket Sales</h2>
              <p className="chart-card-subtitle">
                Order volume compared against total seats issued ({period})
              </p>
            </div>
          </div>
          <BookingVolumeChart data={activeSeries} height={260} />
        </div>

        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <h2 className="chart-card-title">Cinema Branch Revenue</h2>
              <p className="chart-card-subtitle">Top-performing locations highlighted in red</p>
            </div>
            <Link to="/cinemas" style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-primary)' }}>
              All Branches
            </Link>
          </div>
          <CinemaRevenueChart data={cinemaPerformance.slice(0, 6)} height={260} />
        </div>
      </section>

      <section className="dashboard-grid-bottom">
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <h2 className="chart-card-title">Branch Occupancy &amp; Volume</h2>
              <p className="chart-card-subtitle">Monthly revenue share and booking throughput by location</p>
            </div>
          </div>
          <div className="branch-list">
            {cinemaPerformance.slice(0, 5).map((branch, idx) => {
              const pct = Math.round((branch.revenue / maxBranchRevenue) * 100);
              return (
                <div key={branch.id} className="branch-item">
                  <div className="branch-item-head">
                    <div>
                      <div className="branch-item-name">
                        {idx === 0 ? `1. ${branch.fullName} (Top Location)` : `${idx + 1}. ${branch.fullName}`}
                      </div>
                      <div className="meta-row">
                        <span>{branch.city}</span>
                        <span className="meta-sep">·</span>
                        <span className="tabular-nums">{formatNumber(branch.bookings)} bookings</span>
                        <span className="meta-sep">·</span>
                        <span className="tabular-nums">{branch.occupancyRate}% occupancy</span>
                      </div>
                    </div>
                    <span className="branch-item-rev">{formatCurrency(branch.revenue)}</span>
                  </div>
                  <div className="branch-progress-track">
                    <div
                      className={`branch-progress-fill ${idx === 0 ? 'branch-progress-fill--top' : ''}`.trim()}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <h2 className="chart-card-title">Recent Operations Activity</h2>
              <p className="chart-card-subtitle">Bookings, registrations, and administrative actions</p>
            </div>
          </div>
          <div className="activity-list">
            {activities.slice(0, 5).map((act) => {
              const Icon =
                act.type === 'booking'
                  ? Ticket
                  : act.type === 'user'
                    ? UserPlus
                    : ShieldCheck;
              return (
                <div key={act.id} className="activity-item">
                  <div className={`activity-icon activity-icon--${act.type}`}>
                    <Icon size={15} aria-hidden="true" />
                  </div>
                  <div>
                    <div className="activity-title">{act.title}</div>
                    <div className="activity-detail">{act.detail}</div>
                    <div className="activity-time">{act.timestamp}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
