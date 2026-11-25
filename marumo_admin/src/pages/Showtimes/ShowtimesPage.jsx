import { useMemo, useState } from 'react';
import { Ban, CheckCircle2, Edit2, Plus, RefreshCw } from 'lucide-react';
import { useAdminStore } from '../../hooks/useAdminStore.jsx';
import {
  calculateEndTime,
  formatCurrency,
  formatDate,
} from '../../utils/formatters.js';
import { validateShowtimeForm } from '../../utils/validators.js';
import { Button } from '../../components/common/Button.jsx';
import { Modal } from '../../components/common/Modal.jsx';
import { PageHeader } from '../../components/common/PageHeader.jsx';
import { StatusBadge } from '../../components/common/StatusBadge.jsx';
import { DataTable } from '../../components/tables/DataTable.jsx';
import './ShowtimesPage.css';

export function ShowtimesPage() {
  const { showtimes, movies, cinemas, saveShowtime, updateShowtimeStatus, loading, refreshShowtimes } = useAdminStore();

  const [search, setSearch] = useState('');
  const [cinemaFilter, setCinemaFilter] = useState('All');
  const [movieFilter, setMovieFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const [formOpen, setFormOpen] = useState(false);
  const [editingShowtime, setEditingShowtime] = useState(null);
  const [formValues, setFormValues] = useState({
    movieId: '',
    cinemaId: '',
    room: '',
    format: 'Standard',
    date: '2026-11-18',
    startTime: '18:00',
    ticketPrice: '18',
    capacity: '180',
    status: 'Scheduled',
  });
  const [formErrors, setFormErrors] = useState({});

  const movieMap = useMemo(
    () => Object.fromEntries(movies.map((m) => [m.id, m])),
    [movies]
  );
  const cinemaMap = useMemo(
    () => Object.fromEntries(cinemas.map((c) => [c.id, c])),
    [cinemas]
  );

  const enrichedShowtimes = useMemo(
    () =>
      showtimes.map((s) => ({
        ...s,
        movieTitle: movieMap[s.movieId]?.title || 'Unknown Film',
        movieDuration: movieMap[s.movieId]?.durationMinutes || 120,
        cinemaName: cinemaMap[s.cinemaId]?.name || 'Unknown Branch',
      })),
    [showtimes, movieMap, cinemaMap]
  );

  const filteredShowtimes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enrichedShowtimes.filter((s) => {
      if (cinemaFilter !== 'All' && s.cinemaId !== cinemaFilter) return false;
      if (movieFilter !== 'All' && s.movieId !== movieFilter) return false;
      if (dateFilter && s.date !== dateFilter) return false;
      if (statusFilter !== 'All' && s.status !== statusFilter) return false;
      if (!q) return true;
      return (
        s.movieTitle.toLowerCase().includes(q) ||
        s.cinemaName.toLowerCase().includes(q) ||
        s.room.toLowerCase().includes(q)
      );
    });
  }, [enrichedShowtimes, search, cinemaFilter, movieFilter, dateFilter, statusFilter]);

  const selectedMovieDuration = movieMap[formValues.movieId]?.durationMinutes || 120;
  const previewEndTime = calculateEndTime(formValues.startTime, selectedMovieDuration) || '—';

  const handleRefresh = () => {
    refreshShowtimes();
  };

  const openCreateModal = () => {
    setEditingShowtime(null);
    setFormValues({
      movieId: movies[0]?.id || '',
      cinemaId: cinemas[0]?.id || '',
      room: 'IMAX Hall 1',
      format: 'IMAX Laser',
      date: '2026-11-18',
      startTime: '18:00',
      ticketPrice: '20',
      capacity: '220',
      status: 'Scheduled',
    });
    setFormErrors({});
    setFormOpen(true);
  };

  const openEditModal = (showtime) => {
    setEditingShowtime(showtime);
    setFormValues({
      movieId: showtime.movieId,
      cinemaId: showtime.cinemaId,
      room: showtime.room,
      format: showtime.format,
      date: showtime.date,
      startTime: showtime.startTime,
      ticketPrice: String(showtime.ticketPrice),
      capacity: String(showtime.capacity),
      status: showtime.status,
    });
    setFormErrors({});
    setFormOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const candidate = {
      movieId: formValues.movieId,
      cinemaId: formValues.cinemaId,
      room: formValues.room.trim(),
      format: formValues.format,
      date: formValues.date,
      startTime: formValues.startTime,
      ticketPrice: Number(formValues.ticketPrice),
      capacity: Number(formValues.capacity),
      status: formValues.status,
    };
    const result = validateShowtimeForm(candidate);
    if (!result.valid) {
      setFormErrors(result.errors);
      return;
    }
    saveShowtime(candidate, editingShowtime?.id || null);
    setFormOpen(false);
  };

  const columns = [
    {
      key: 'movieTitle',
      label: 'Movie & Format',
      sortable: true,
      sortKey: 'movieTitle',
      render: (row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.movieTitle}</div>
          <div className="meta-row">
            <span>{row.format}</span>
            <span className="meta-sep">·</span>
            <span className="tabular-nums">{row.movieDuration} mins</span>
          </div>
        </div>
      ),
    },
    {
      key: 'cinemaName',
      label: 'Cinema & Room',
      sortable: true,
      sortKey: 'cinemaName',
      render: (row) => (
        <div>
          <div style={{ fontWeight: 500 }}>{row.cinemaName}</div>
          <div className="meta-row">{row.room}</div>
        </div>
      ),
    },
    {
      key: 'date',
      label: 'Schedule',
      sortable: true,
      sortKey: 'date',
      render: (row) => (
        <div>
          <div className="tabular-nums" style={{ fontWeight: 500 }}>
            {formatDate(row.date)}
          </div>
          <div className="meta-row mono-code">
            {row.startTime} – {row.endTime}
          </div>
        </div>
      ),
    },
    {
      key: 'bookedSeats',
      label: 'Seats Booked',
      align: 'right',
      sortable: true,
      sortKey: 'bookedSeats',
      render: (row) => {
        const pct = row.capacity > 0 ? Math.min(100, Math.round((row.bookedSeats / row.capacity) * 100)) : 0;
        return (
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span className="tabular-nums">
              {row.bookedSeats} / {row.capacity}
            </span>
            <div className="showtime-seat-bar">
              <div className="showtime-seat-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      },
    },
    {
      key: 'ticketPrice',
      label: 'Price',
      align: 'right',
      sortable: true,
      sortKey: 'ticketPrice',
      render: (row) => <span className="tabular-nums">{formatCurrency(row.ticketPrice)}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      sortKey: 'status',
      render: (row) => <StatusBadge status={row.status} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Showtimes Management"
        subtitle="Schedule screenings across cinema auditoriums, manage room capacities, and monitor seat fill."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={handleRefresh} disabled={loading.showtimes}>
              <RefreshCw size={16} aria-hidden="true" className={loading.showtimes ? 'spin' : ''} />
              <span>Refresh</span>
            </Button>
            <Button variant="primary" onClick={openCreateModal}>
              <Plus size={16} aria-hidden="true" />
              <span>Schedule Showtime</span>
            </Button>
          </>
        }
      />

      <DataTable
        columns={columns}
        data={filteredShowtimes}
        searchQuery={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search movie, cinema, or room..."
        isLoading={loading.showtimes}
        filters={
          <>
            <select
              className="data-table-filter-select"
              aria-label="Filter by cinema branch"
              value={cinemaFilter}
              onChange={(e) => setCinemaFilter(e.target.value)}
            >
              <option value="All">All Cinemas</option>
              {cinemas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className="data-table-filter-select"
              aria-label="Filter by movie"
              value={movieFilter}
              onChange={(e) => setMovieFilter(e.target.value)}
            >
              <option value="All">All Movies</option>
              {movies.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
            <input
              type="date"
              className="data-table-filter-select"
              aria-label="Filter by date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
            <select
              className="data-table-filter-select"
              aria-label="Filter by showtime status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="All">All Statuses</option>
              <option value="Scheduled">Scheduled</option>
              <option value="Sold Out">Sold Out</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </>
        }
        emptyAction={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setSearch('');
              setCinemaFilter('All');
              setMovieFilter('All');
              setDateFilter('');
              setStatusFilter('All');
            }}
          >
            Reset Filters
          </Button>
        }
        renderActions={(row) => [
          {
            label: 'Edit Showtime',
            icon: Edit2,
            onClick: () => openEditModal(row),
          },
          row.status !== 'Scheduled'
            ? {
                label: 'Mark Scheduled',
                icon: CheckCircle2,
                onClick: () => updateShowtimeStatus(row.id, 'Scheduled'),
              }
            : {
                label: 'Mark Sold Out',
                icon: CheckCircle2,
                onClick: () => updateShowtimeStatus(row.id, 'Sold Out'),
              },
          row.status !== 'Cancelled'
            ? {
                label: 'Cancel Screening',
                icon: Ban,
                danger: true,
                onClick: () => updateShowtimeStatus(row.id, 'Cancelled'),
              }
            : null,
        ].filter(Boolean)}
      />

      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingShowtime ? 'Edit Showtime Schedule' : 'Schedule New Showtime'}
        subtitle="End time is automatically calculated from the selected film runtime."
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="showtime-form">
              {editingShowtime ? 'Update Showtime' : 'Save Showtime'}
            </Button>
          </>
        }
      >
        <form id="showtime-form" onSubmit={handleSubmit} noValidate>
          <div className="form-section">
            <div className="form-section-title">Film &amp; Auditorium</div>
            <div className="form-grid">
              <div className="form-field form-field--full">
                <label htmlFor="shw-movie" className="form-label">
                  Movie <span className="form-required">*</span>
                </label>
                <select
                  id="shw-movie"
                  className={`form-select ${formErrors.movieId ? 'form-select--error' : ''}`.trim()}
                  value={formValues.movieId}
                  onChange={(e) => setFormValues({ ...formValues, movieId: e.target.value })}
                >
                  <option value="">Select a movie</option>
                  {movies.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title} ({m.durationMinutes} min)
                    </option>
                  ))}
                </select>
                {formErrors.movieId ? <span className="form-error">{formErrors.movieId}</span> : null}
              </div>

              <div className="form-field form-field--full">
                <label htmlFor="shw-cinema" className="form-label">
                  Cinema Branch <span className="form-required">*</span>
                </label>
                <select
                  id="shw-cinema"
                  className={`form-select ${formErrors.cinemaId ? 'form-select--error' : ''}`.trim()}
                  value={formValues.cinemaId}
                  onChange={(e) => setFormValues({ ...formValues, cinemaId: e.target.value })}
                >
                  <option value="">Select a branch</option>
                  {cinemas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.city})
                    </option>
                  ))}
                </select>
                {formErrors.cinemaId ? (
                  <span className="form-error">{formErrors.cinemaId}</span>
                ) : null}
              </div>

              <div className="form-field">
                <label htmlFor="shw-room" className="form-label">
                  Screening Room <span className="form-required">*</span>
                </label>
                <input
                  id="shw-room"
                  className={`form-input ${formErrors.room ? 'form-input--error' : ''}`.trim()}
                  value={formValues.room}
                  onChange={(e) => setFormValues({ ...formValues, room: e.target.value })}
                  placeholder="e.g. Dolby Atmos Hall 3"
                />
                {formErrors.room ? <span className="form-error">{formErrors.room}</span> : null}
              </div>

              <div className="form-field">
                <label htmlFor="shw-format" className="form-label">
                  Projection Format
                </label>
                <select
                  id="shw-format"
                  className="form-select"
                  value={formValues.format}
                  onChange={(e) => setFormValues({ ...formValues, format: e.target.value })}
                >
                  <option value="Standard">Standard</option>
                  <option value="IMAX Laser">IMAX Laser</option>
                  <option value="Dolby Atmos">Dolby Atmos</option>
                  <option value="Dolby Cinema">Dolby Cinema</option>
                  <option value="VIP Recliner">VIP Recliner</option>
                  <option value="4DX">4DX</option>
                </select>
              </div>
            </div>
          </div>

          <div className="form-section" style={{ marginTop: 18 }}>
            <div className="form-section-title">Timing, Pricing &amp; Capacity</div>
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="shw-date" className="form-label">
                  Screening Date <span className="form-required">*</span>
                </label>
                <input
                  id="shw-date"
                  type="date"
                  className={`form-input ${formErrors.date ? 'form-input--error' : ''}`.trim()}
                  value={formValues.date}
                  onChange={(e) => setFormValues({ ...formValues, date: e.target.value })}
                />
                {formErrors.date ? <span className="form-error">{formErrors.date}</span> : null}
              </div>

              <div className="form-field">
                <label htmlFor="shw-start" className="form-label">
                  Start Time <span className="form-required">*</span>
                </label>
                <input
                  id="shw-start"
                  type="time"
                  className={`form-input ${formErrors.startTime ? 'form-input--error' : ''}`.trim()}
                  value={formValues.startTime}
                  onChange={(e) => setFormValues({ ...formValues, startTime: e.target.value })}
                />
                {formErrors.startTime ? (
                  <span className="form-error">{formErrors.startTime}</span>
                ) : null}
              </div>

              <div className="form-field">
                <span className="form-label">Calculated End Time</span>
                <div className="showtime-end-preview">{previewEndTime}</div>
              </div>

              <div className="form-field">
                <label htmlFor="shw-status" className="form-label">
                  Showtime Status
                </label>
                <select
                  id="shw-status"
                  className="form-select"
                  value={formValues.status}
                  onChange={(e) => setFormValues({ ...formValues, status: e.target.value })}
                >
                  <option value="Scheduled">Scheduled</option>
                  <option value="Sold Out">Sold Out</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="shw-price" className="form-label">
                  Base Ticket Price ($) <span className="form-required">*</span>
                </label>
                <input
                  id="shw-price"
                  type="number"
                  step="0.5"
                  className={`form-input ${formErrors.ticketPrice ? 'form-input--error' : ''}`.trim()}
                  value={formValues.ticketPrice}
                  onChange={(e) => setFormValues({ ...formValues, ticketPrice: e.target.value })}
                />
                {formErrors.ticketPrice ? (
                  <span className="form-error">{formErrors.ticketPrice}</span>
                ) : null}
              </div>

              <div className="form-field">
                <label htmlFor="shw-capacity" className="form-label">
                  Room Seat Capacity <span className="form-required">*</span>
                </label>
                <input
                  id="shw-capacity"
                  type="number"
                  className={`form-input ${formErrors.capacity ? 'form-input--error' : ''}`.trim()}
                  value={formValues.capacity}
                  onChange={(e) => setFormValues({ ...formValues, capacity: e.target.value })}
                />
                {formErrors.capacity ? (
                  <span className="form-error">{formErrors.capacity}</span>
                ) : null}
              </div>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
