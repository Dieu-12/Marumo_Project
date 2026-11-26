import { useCallback, useMemo, useRef, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { useAdminStore } from '../../hooks/useAdminStore.jsx';
import { adminApi, apiErrorMessage } from '../../utils/adminApi.js';
import { formatCurrency } from '../../utils/formatters.js';
import { Button } from '../../components/common/Button.jsx';
import { Modal } from '../../components/common/Modal.jsx';
import { PageHeader } from '../../components/common/PageHeader.jsx';
import { StatusBadge } from '../../components/common/StatusBadge.jsx';
import { DataTable } from '../../components/tables/DataTable.jsx';
import './ShowtimesPage.css';

function vietnamDateTime(value) {
  const stamp = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`;
  const date = new Date(stamp);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function CreateShowtime({ onClose }) {
  const { movies, catalogOptions, loading, loadErrors, refreshOptions, saveShowtime, refreshShowtimes, pushToast, expireSession } = useAdminStore();
  const [values, setValues] = useState({ showtimeCode: '', movieId: '', movieVersionId: '', branchId: '', auditoriumId: '', startLocal: `${vietnamDateTime(new Date().toISOString()).slice(0, 10)}T18:00`, baseTicketPrice: '100000', preparationMinutes: '15', cleanupMinutes: '15', status: 'SCHEDULED' });
  const [versions, setVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [versionError, setVersionError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingCode, setPendingCode] = useState(null);
  const [retryCode, setRetryCode] = useState('');
  const versionRequest = useRef(0);
  const versionController = useRef(null);
  const bindShowtime = useCallback((node) => {
    if (!node) return undefined;
    return () => {
      versionRequest.current += 1;
      versionController.current?.abort();
    };
  }, []);
  const movie = movies.find((item) => item.id === values.movieId);
  const version = versions.find((item) => item.id === values.movieVersionId);
  const auditoriums = catalogOptions.auditoriums.filter((item) => item.branchId === values.branchId && (!version || item.formatIds.includes(version.formatId)));
  const auditorium = auditoriums.find((item) => item.id === values.auditoriumId);
  const startStamp = values.startLocal ? `${values.startLocal}:00+07:00` : '';
  const endDate = movie && startStamp ? new Date(Date.parse(startStamp) + movie.durationMinutes * 60000) : null;
  const endLocal = endDate && Number.isFinite(endDate.getTime()) ? vietnamDateTime(endDate.toISOString()) : '';

  async function chooseMovie(movieId) {
    setValues((previous) => ({ ...previous, movieId, movieVersionId: '', auditoriumId: '' }));
    setVersions([]);
    setVersionError('');
    const requestId = ++versionRequest.current;
    versionController.current?.abort();
    if (!movieId) { setLoadingVersions(false); return; }
    const controller = new AbortController();
    versionController.current = controller;
    setLoadingVersions(true);
    try {
      const data = await adminApi.movies.versions(movieId, { signal: controller.signal });
      if (versionRequest.current === requestId) setVersions(data.versions.filter((item) => item.isActive));
    } catch (failure) {
      if (versionRequest.current === requestId) {
        setVersionError(apiErrorMessage(failure));
        expireSession(failure);
      }
    } finally {
      if (versionRequest.current === requestId) setLoadingVersions(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (saving || pendingCode || !endLocal) return;
    setSaving(true);
    setError('');
    try {
      await saveShowtime({ showtimeCode: values.showtimeCode.trim(), branchId: values.branchId, auditoriumId: values.auditoriumId, movieVersionId: values.movieVersionId, startAt: startStamp, endAt: `${endLocal}:00+07:00`, baseTicketPrice: Number(values.baseTicketPrice), preparationMinutes: Number(values.preparationMinutes), cleanupMinutes: Number(values.cleanupMinutes), status: values.status });
      onClose();
    } catch (failure) {
      setError(apiErrorMessage(failure));
      expireSession(failure);
      if (failure.outcomeUnknown) setPendingCode(values.showtimeCode.trim().toUpperCase());
    } finally {
      setSaving(false);
    }
  }

  async function checkShowtime() {
    if (saving) return;
    setSaving(true);
    try {
      const rows = await adminApi.showtimes.listAll();
      if (rows.some((showtime) => showtime.showtimeCode === pendingCode)) {
        await refreshShowtimes();
        pushToast('Đã tìm thấy suất chiếu trên máy chủ.');
        onClose();
      } else {
        setRetryCode(pendingCode);
        setPendingCode(null);
        setError('Chưa tìm thấy suất chiếu. Có thể gửi lại với cùng mã.');
      }
    } catch (failure) {
      setError(apiErrorMessage(failure));
      expireSession(failure);
    } finally {
      setSaving(false);
    }
  }

  return <Modal isOpen onClose={() => { if (!saving) onClose(); }} title="Schedule New Showtime" subtitle="Times use Vietnam time (UTC+07:00). End time follows the film runtime; seats and prices are generated by the server." footer={<><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" form="showtime-form" variant="primary" disabled={saving || Boolean(pendingCode) || loadingVersions || loading.options || Boolean(loadErrors.options) || Boolean(loadErrors.movies)}>{saving ? 'Saving...' : 'Save Showtime'}</Button></>}>
    <form id="showtime-form" onSubmit={submit} ref={bindShowtime}>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {pendingCode ? <Button type="button" variant="secondary" onClick={checkShowtime} disabled={saving}>Kiểm tra kết quả</Button> : null}
      {loadErrors.options ? <p className="form-error" role="alert">{loadErrors.options} <Button type="button" variant="ghost" onClick={refreshOptions}>Retry options</Button></p> : null}
      {loadErrors.movies ? <p className="form-error" role="alert">{loadErrors.movies}</p> : null}
      <fieldset className="form-grid" disabled={saving || Boolean(pendingCode)} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="form-field form-field--full"><label className="form-label" htmlFor="shw-code">Showtime Code *</label><input id="shw-code" className="form-input" disabled={Boolean(retryCode)} value={values.showtimeCode} maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9_-]*" onChange={(event) => setValues({ ...values, showtimeCode: event.target.value })} required /></div>
        <div className="form-field form-field--full"><label className="form-label" htmlFor="shw-movie">Movie *</label><select id="shw-movie" className="form-select" value={values.movieId} onChange={(event) => chooseMovie(event.target.value)} required><option value="">Select a movie</option>{movies.map((item) => <option key={item.id} value={item.id}>{item.title} ({item.durationMinutes} min)</option>)}</select></div>
        <div className="form-field form-field--full"><label className="form-label" htmlFor="shw-version">Movie Version *</label><select id="shw-version" className="form-select" value={values.movieVersionId} onChange={(event) => setValues({ ...values, movieVersionId: event.target.value, auditoriumId: '' })} disabled={!values.movieId || loadingVersions} required><option value="">{loadingVersions ? 'Loading versions...' : 'Select a version'}</option>{versions.map((item) => <option key={item.id} value={item.id}>{item.versionName} ({item.versionCode})</option>)}</select>{versionError ? <p className="form-error" role="alert">{versionError} <Button type="button" variant="ghost" onClick={() => chooseMovie(values.movieId)}>Retry versions</Button></p> : null}{values.movieId && !loadingVersions && !versionError && !versions.length ? <span className="form-error">This movie has no active version. Create one in Movie Management.</span> : null}</div>
        <div className="form-field"><label className="form-label" htmlFor="shw-branch">Cinema Branch *</label><select id="shw-branch" className="form-select" value={values.branchId} onChange={(event) => setValues({ ...values, branchId: event.target.value, auditoriumId: '' })} required><option value="">Select a branch</option>{catalogOptions.branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        <div className="form-field"><label className="form-label" htmlFor="shw-room">Screening Room *</label><select id="shw-room" className="form-select" value={values.auditoriumId} onChange={(event) => setValues({ ...values, auditoriumId: event.target.value })} disabled={!values.branchId || !version} required><option value="">Select a compatible room</option>{auditoriums.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.capacity} seats)</option>)}</select></div>
        <div className="form-field"><label className="form-label" htmlFor="shw-start">Start Time (Vietnam) *</label><input id="shw-start" type="datetime-local" className="form-input" value={values.startLocal} onChange={(event) => setValues({ ...values, startLocal: event.target.value })} required /></div>
        <div className="form-field"><span className="form-label">Calculated End Time (Vietnam)</span><div className="showtime-end-preview">{endLocal.replace('T', ' ') || '—'}</div></div>
        <div className="form-field"><label className="form-label" htmlFor="shw-price">Base Ticket Price (VND) *</label><input id="shw-price" type="number" className="form-input" min="0" max="9999999999.99" step="0.01" value={values.baseTicketPrice} onChange={(event) => setValues({ ...values, baseTicketPrice: event.target.value })} required /></div>
        <div className="form-field"><span className="form-label">Room Seat Capacity</span><div className="showtime-end-preview">{auditorium ? auditorium.capacity : '—'}</div></div>
        <div className="form-field"><label className="form-label" htmlFor="shw-preparation">Preparation (minutes) *</label><input id="shw-preparation" type="number" className="form-input" min="0" max="180" step="1" value={values.preparationMinutes} onChange={(event) => setValues({ ...values, preparationMinutes: event.target.value })} required /></div>
        <div className="form-field"><label className="form-label" htmlFor="shw-cleanup">Cleanup (minutes) *</label><input id="shw-cleanup" type="number" className="form-input" min="0" max="180" step="1" value={values.cleanupMinutes} onChange={(event) => setValues({ ...values, cleanupMinutes: event.target.value })} required /></div>
        <div className="form-field"><label className="form-label" htmlFor="shw-status">Showtime Status</label><select id="shw-status" className="form-select" value={values.status} onChange={(event) => setValues({ ...values, status: event.target.value })}>{catalogOptions.showtimeStatuses.filter((status) => ['DRAFT', 'SCHEDULED', 'OPEN_FOR_BOOKING', 'DELAYED'].includes(status.code)).map((status) => <option key={status.id} value={status.code}>{status.name}</option>)}</select></div>
      </fieldset>
    </form>
  </Modal>;
}

export function ShowtimesPage() {
  const { showtimes, catalogOptions, loading, loadErrors, refreshShowtimes, hasPermission } = useAdminStore();
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const filtered = useMemo(() => showtimes.filter((showtime) => (!branchFilter || showtime.branchId === branchFilter) && (!dateFilter || vietnamDateTime(showtime.startAt).slice(0, 10) === dateFilter) && [showtime.movieTitle, showtime.branchName, showtime.auditoriumName, showtime.showtimeCode, showtime.versionName].some((value) => (value || '').toLowerCase().includes(search.trim().toLowerCase()))), [showtimes, branchFilter, dateFilter, search]);
  const columns = [
    { key: 'movieTitle', label: 'Movie & Version', sortable: true, sortKey: 'movieTitle', render: (showtime) => <div><div className="movie-title">{showtime.movieTitle}</div><div className="meta-row">{showtime.versionName} · {showtime.formatName}</div></div> },
    { key: 'branchName', label: 'Cinema & Room', sortable: true, sortKey: 'branchName', render: (showtime) => <div>{showtime.branchName}<div className="meta-row">{showtime.auditoriumName}</div></div> },
    { key: 'startAt', label: 'Schedule (Vietnam)', sortable: true, sortKey: 'startAt', render: (showtime) => <div className="tabular-nums">{vietnamDateTime(showtime.startAt).replace('T', ' ')}<div className="meta-row">to {vietnamDateTime(showtime.endAt).replace('T', ' ')}</div></div> },
    { key: 'seatCount', label: 'Inventory Seats', align: 'right', sortable: true, sortKey: 'seatCount' },
    { key: 'baseTicketPrice', label: 'Base Price (VND)', align: 'right', sortable: true, sortKey: 'baseTicketPrice', render: (showtime) => formatCurrency(showtime.baseTicketPrice, 'VND') },
    { key: 'statusCode', label: 'Status', render: (showtime) => <StatusBadge status={(showtime.statusCode || showtime.status).replaceAll('_', ' ')} /> },
    { key: 'showtimeCode', label: 'Code' },
  ];
  if (!hasPermission('showtime.create')) return <p role="alert">Bạn không có quyền quản lý suất chiếu.</p>;

  return <div>
    <PageHeader title="Showtimes Management" subtitle="Create screenings with server-generated seats and prices. All times use Vietnam time (UTC+07:00)." actions={<><Button variant="secondary" size="sm" onClick={refreshShowtimes} disabled={loading.showtimes}><RefreshCw size={16} /> Refresh</Button><Button variant="primary" onClick={() => setFormOpen(true)} disabled={loading.movies || loading.options}><Plus size={16} /> Schedule Showtime</Button></>} />
    <DataTable columns={columns} data={filtered} searchQuery={search} onSearchChange={setSearch} searchPlaceholder="Search movie, version, branch, room, or code..." isLoading={loading.showtimes} errorMessage={loadErrors.showtimes} onRetry={refreshShowtimes} filters={<><select className="data-table-filter-select" aria-label="Filter by branch" value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}><option value="">All Branches</option>{catalogOptions.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><input className="data-table-filter-select" type="date" aria-label="Filter by screening date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} /></>} />
    {formOpen ? <CreateShowtime onClose={() => setFormOpen(false)} /> : null}
  </div>;
}
