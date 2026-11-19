import { useMemo, useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { useAdminStore } from '../../hooks/useAdminStore.jsx';
import { downloadCsvFile } from '../../services/adminService.js';
import { computeCinemaPerformance } from '../../utils/analytics.js';
import { formatCurrency, formatNumber } from '../../utils/formatters.js';
import { CinemaRevenueChart } from '../../components/charts/CinemaRevenueChart.jsx';
import { RevenueLineChart } from '../../components/charts/RevenueLineChart.jsx';
import { Button } from '../../components/common/Button.jsx';
import { PageHeader } from '../../components/common/PageHeader.jsx';
import { StatusBadge } from '../../components/common/StatusBadge.jsx';
import { DataTable } from '../../components/tables/DataTable.jsx';
import './ReportsPage.css';

const PERIODS = [
  { key: 'day', label: 'Daily' },
  { key: 'week', label: 'Weekly' },
  { key: 'month', label: 'Monthly' },
  { key: 'year', label: 'Annual' },
];

export function ReportsPage() {
  const { cinemas, movies, bookings, revenueSeries, pushToast } = useAdminStore();
  const [period, setPeriod] = useState('year');
  const [branchFilter, setBranchFilter] = useState('All');
  const [search, setSearch] = useState('');

  const cinemaPerformance = useMemo(
    () => computeCinemaPerformance(cinemas, bookings),
    [cinemas, bookings]
  );

  const selectedSeries = useMemo(() => {
    const base = revenueSeries[period] || revenueSeries.year;
    if (branchFilter === 'All') return base;
    const branch = cinemas.find((c) => c.id === branchFilter);
    const totalRev = cinemas.reduce((s, c) => s + Math.max(c.monthlyRevenue, 1), 0);
    const share = branch ? Math.max(branch.monthlyRevenue, 25000) / totalRev : 0.2;
    return base.map((pt) => ({
      ...pt,
      revenue: Math.round(pt.revenue * share),
      previous: Math.round(pt.previous * share),
      bookings: Math.round(pt.bookings * share),
      tickets: Math.round(pt.tickets * share),
    }));
  }, [revenueSeries, period, branchFilter, cinemas]);

  const periodTotals = useMemo(() => {
    const revenue = selectedSeries.reduce((s, r) => s + r.revenue, 0);
    const orderCount = selectedSeries.reduce((s, r) => s + r.bookings, 0);
    const tickets = selectedSeries.reduce((s, r) => s + r.tickets, 0);
    const avgOrder = orderCount > 0 ? revenue / orderCount : 0;
    return { revenue, orderCount, tickets, avgOrder };
  }, [selectedSeries]);

  const movieSalesRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return movies
      .map((m) => ({
        ...m,
        avgTicketPrice: m.ticketsSold > 0 ? m.boxOfficeRevenue / m.ticketsSold : 0,
      }))
      .filter((m) => !q || m.title.toLowerCase().includes(q) || m.genre.toLowerCase().includes(q));
  }, [movies, search]);

  const handleExportFullReport = () => {
    downloadCsvFile(
      `marumo-revenue-report-${period}.csv`,
      ['Period Segment', 'Revenue (USD)', 'Previous Period (USD)', 'Bookings', 'Tickets Sold'],
      selectedSeries.map((pt) => [pt.label, pt.revenue, pt.previous, pt.bookings, pt.tickets])
    );
    pushToast(`Downloaded ${period} revenue & ticket sales report`);
  };

  const handleExportCinemaReport = () => {
    downloadCsvFile(
      'marumo-branch-performance.csv',
      ['Cinema Branch', 'City', 'Status', 'Occupancy %', 'Monthly Bookings', 'Monthly Revenue'],
      cinemaPerformance.map((c) => [
        c.fullName,
        c.city,
        c.status,
        `${c.occupancyRate}%`,
        c.bookings,
        c.revenue,
      ])
    );
    pushToast('Downloaded cinema branch revenue breakdown CSV');
  };

  const movieColumns = [
    {
      key: 'title',
      label: 'Film Title',
      sortable: true,
      sortKey: 'title',
      render: (row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.title}</div>
          <div className="meta-row">{row.genre}</div>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Release Status',
      sortable: true,
      sortKey: 'status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'ticketsSold',
      label: 'Tickets Sold',
      align: 'right',
      sortable: true,
      sortKey: 'ticketsSold',
      render: (row) => <span className="tabular-nums">{formatNumber(row.ticketsSold)}</span>,
    },
    {
      key: 'avgTicketPrice',
      label: 'Avg Ticket',
      align: 'right',
      sortable: true,
      sortKey: 'avgTicketPrice',
      render: (row) => <span className="tabular-nums">{formatCurrency(row.avgTicketPrice)}</span>,
    },
    {
      key: 'boxOfficeRevenue',
      label: 'Gross Box Office',
      align: 'right',
      sortable: true,
      sortKey: 'boxOfficeRevenue',
      render: (row) => (
        <span className="tabular-nums" style={{ fontWeight: 600 }}>
          {formatCurrency(row.boxOfficeRevenue)}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Revenue & Reports"
        subtitle="Box office revenue breakdowns, branch comparisons, ticket sales statistics, and CSV exports."
        actions={
          <>
            <Button variant="secondary" onClick={handleExportCinemaReport}>
              <FileSpreadsheet size={15} aria-hidden="true" />
              <span>Export Branch CSV</span>
            </Button>
            <Button variant="primary" onClick={handleExportFullReport}>
              <Download size={15} aria-hidden="true" />
              <span>Export Period Report</span>
            </Button>
          </>
        }
      />

      <div className="reports-filter-bar">
        <div className="reports-filter-group">
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            Reporting Window:
          </span>
          <div className="segmented-control" role="group" aria-label="Report period">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`segmented-btn ${period === p.key ? 'segmented-btn--active' : ''}`.trim()}
                onClick={() => setPeriod(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="reports-filter-group">
          <label htmlFor="report-branch-select" style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            Cinema Branch:
          </label>
          <select
            id="report-branch-select"
            className="data-table-filter-select"
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
          >
            <option value="All">All Cinema Branches</option>
            {cinemas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="reports-kpi-grid">
        <div className="summary-tile">
          <span className="summary-tile-label">Period Revenue</span>
          <span className="summary-tile-value tabular-nums">{formatCurrency(periodTotals.revenue)}</span>
        </div>
        <div className="summary-tile">
          <span className="summary-tile-label">Period Bookings</span>
          <span className="summary-tile-value tabular-nums">{formatNumber(periodTotals.orderCount)}</span>
        </div>
        <div className="summary-tile">
          <span className="summary-tile-label">Tickets Issued</span>
          <span className="summary-tile-value tabular-nums">{formatNumber(periodTotals.tickets)}</span>
        </div>
        <div className="summary-tile">
          <span className="summary-tile-label">Avg Revenue / Booking</span>
          <span className="summary-tile-value tabular-nums">{formatCurrency(periodTotals.avgOrder)}</span>
        </div>
      </div>

      <div className="reports-charts-grid">
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <h2 className="chart-card-title">
                Revenue by Period ({PERIODS.find((p) => p.key === period)?.label || period})
              </h2>
              <p className="chart-card-subtitle">Comparison against prior reporting cycle</p>
            </div>
          </div>
          <RevenueLineChart data={selectedSeries} height={280} />
        </div>

        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <h2 className="chart-card-title">Revenue by Cinema Branch</h2>
              <p className="chart-card-subtitle">Monthly gross revenue across locations</p>
            </div>
          </div>
          <CinemaRevenueChart data={cinemaPerformance} height={280} />
        </div>
      </div>

      <DataTable
        columns={movieColumns}
        data={movieSalesRows}
        searchQuery={search}
        onSearchChange={setSearch}
        searchPlaceholder="Filter ticket sales report by film..."
        pageSize={6}
      />
    </div>
  );
}
