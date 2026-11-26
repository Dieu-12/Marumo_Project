import { useCallback, useMemo, useRef, useState } from 'react';
import { Archive, Edit2, Eye, Layers, Plus, RefreshCw } from 'lucide-react';
import { useAdminStore } from '../../hooks/useAdminStore.jsx';
import { adminApi, apiErrorMessage } from '../../utils/adminApi.js';
import { formatDate, formatDuration } from '../../utils/formatters.js';
import { Button } from '../../components/common/Button.jsx';
import { Modal } from '../../components/common/Modal.jsx';
import { PageHeader } from '../../components/common/PageHeader.jsx';
import { StatusBadge } from '../../components/common/StatusBadge.jsx';
import { DataTable } from '../../components/tables/DataTable.jsx';
import './MoviesPage.css';

const STATUSES = ['DRAFT', 'PUBLISHED', 'COMING_SOON', 'NOW_SHOWING', 'ENDED', 'ARCHIVED'];
const EMPTY_MOVIE = { movieCode: '', title: '', slug: '', durationMinutes: '120', directorDisplay: '', originalLanguageCode: '', releaseDate: '', endDate: '', status: 'DRAFT', synopsis: '', isFeatured: false };
const EMPTY_VERSION = { versionCode: '', versionName: '', audioLanguageId: '', subtitleLanguageId: '', formatId: '', isOriginalAudio: false, isActive: true };
const statusLabel = (status) => status.replaceAll('_', ' ');

function MovieVersions({ movie, onClose }) {
  const { catalogOptions, loading, loadErrors, refreshOptions, hasPermission, pushToast, expireSession } = useAdminStore();
  const [versions, setVersions] = useState([]);
  const [values, setValues] = useState(EMPTY_VERSION);
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [loadingVersions, setLoadingVersions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingVersion, setPendingVersion] = useState(null);
  const [retryVersionCode, setRetryVersionCode] = useState('');
  const versionRequest = useRef(null);

  const loadVersions = useCallback(async () => {
    versionRequest.current?.abort();
    const controller = new AbortController();
    versionRequest.current = controller;
    setLoadingVersions(true);
    setListError('');
    try {
      const data = await adminApi.movies.versions(movie.id, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setVersions(data.versions);
    } catch (failure) {
      if (controller.signal.aborted) return;
      setListError(apiErrorMessage(failure));
      expireSession(failure);
    } finally {
      if (versionRequest.current === controller && !controller.signal.aborted) setLoadingVersions(false);
    }
  }, [movie.id, expireSession]);

  const bindVersions = useCallback((node) => {
    if (!node) return undefined;
    loadVersions();
    return () => versionRequest.current?.abort();
  }, [loadVersions]);

  async function checkVersion() {
    if (saving) return;
    setSaving(true);
    try {
      const data = await adminApi.movies.versions(movie.id);
      setVersions(data.versions);
      const found = data.versions.some((version) => version.versionCode === pendingVersion.versionCode.trim().toUpperCase());
      setPendingVersion(null);
      if (found) {
        setValues(EMPTY_VERSION);
        setRetryVersionCode('');
      } else setRetryVersionCode(pendingVersion.versionCode);
      setError(found ? 'Đã tìm thấy phiên bản trên máy chủ. Danh sách đã cập nhật.' : 'Chưa tìm thấy phiên bản. Có thể gửi lại với cùng mã.');
    } catch (failure) {
      setError(apiErrorMessage(failure));
      expireSession(failure);
    } finally {
      setSaving(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (saving || pendingVersion) return;
    setError('');
    setSaving(true);
    try {
      const result = await adminApi.movies.createVersion(movie.id, {
        ...values,
        versionCode: values.versionCode.trim(),
        versionName: values.versionName.trim(),
        audioLanguageId: Number(values.audioLanguageId),
        subtitleLanguageId: values.subtitleLanguageId ? Number(values.subtitleLanguageId) : null,
        formatId: Number(values.formatId),
      });
      setVersions((previous) => [...previous, result.version]);
      setValues(EMPTY_VERSION);
      setRetryVersionCode('');
      pushToast('Đã tạo phiên bản phim.');
    } catch (failure) {
      setError(apiErrorMessage(failure));
      if (failure.outcomeUnknown) setPendingVersion(values);
      expireSession(failure);
    } finally {
      setSaving(false);
    }
  }

  const languageName = (id) => catalogOptions.languages.find((language) => language.id === id)?.name || id || '—';
  const columns = [
    { key: 'versionCode', label: 'Version Code' },
    { key: 'versionName', label: 'Name' },
    { key: 'audioLanguageId', label: 'Audio', render: (version) => languageName(version.audioLanguageId) },
    { key: 'subtitleLanguageId', label: 'Subtitles', render: (version) => languageName(version.subtitleLanguageId) },
    { key: 'formatId', label: 'Format', render: (version) => catalogOptions.formats.find((format) => format.id === version.formatId)?.name || version.formatId },
    { key: 'isActive', label: 'Status', render: (version) => version.isActive ? 'Active' : 'Inactive' },
  ];

  return <Modal isOpen onClose={() => { if (!saving) onClose(); }} title={`Versions: ${movie.title}`} size="lg" footer={<Button variant="secondary" onClick={onClose} disabled={saving}>Close</Button>}>
    <div ref={bindVersions}>
    <DataTable columns={columns} data={versions} isLoading={loadingVersions} errorMessage={listError} onRetry={loadVersions} emptyTitle="No movie versions" emptyDescription="Create a version before scheduling this film." />
    {hasPermission('movie.create') ? <form id="version-form" onSubmit={submit} className="form-section" style={{ marginTop: 20 }}>
      <h3 className="form-section-title">Add Movie Version</h3>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {pendingVersion ? <Button type="button" variant="secondary" onClick={checkVersion} disabled={saving}>Kiểm tra kết quả</Button> : null}
      {loadErrors.options ? <p className="form-error" role="alert">{loadErrors.options} <Button type="button" variant="ghost" onClick={refreshOptions}>Retry options</Button></p> : null}
      <fieldset className="form-grid" disabled={saving || Boolean(pendingVersion)} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="form-field"><label className="form-label" htmlFor="version-code">Version Code *</label><input id="version-code" className="form-input" disabled={Boolean(retryVersionCode)} value={values.versionCode} maxLength={50} pattern="[A-Za-z0-9][A-Za-z0-9_-]*" onChange={(event) => setValues({ ...values, versionCode: event.target.value })} required /></div>
        <div className="form-field"><label className="form-label" htmlFor="version-name">Version Name *</label><input id="version-name" className="form-input" value={values.versionName} maxLength={150} onChange={(event) => setValues({ ...values, versionName: event.target.value })} required /></div>
        <div className="form-field"><label className="form-label" htmlFor="version-audio">Audio Language *</label><select id="version-audio" className="form-select" value={values.audioLanguageId} onChange={(event) => setValues({ ...values, audioLanguageId: event.target.value })} required><option value="">Select language</option>{catalogOptions.languages.map((language) => <option key={language.id} value={language.id}>{language.name}</option>)}</select></div>
        <div className="form-field"><label className="form-label" htmlFor="version-subtitle">Subtitle Language</label><select id="version-subtitle" className="form-select" value={values.subtitleLanguageId} onChange={(event) => setValues({ ...values, subtitleLanguageId: event.target.value })}><option value="">None</option>{catalogOptions.languages.map((language) => <option key={language.id} value={language.id}>{language.name}</option>)}</select></div>
        <div className="form-field"><label className="form-label" htmlFor="version-format">Screening Format *</label><select id="version-format" className="form-select" value={values.formatId} onChange={(event) => setValues({ ...values, formatId: event.target.value })} required><option value="">Select format</option>{catalogOptions.formats.map((format) => <option key={format.id} value={format.id}>{format.name}</option>)}</select></div>
        <div className="form-field"><label className="form-label"><input type="checkbox" checked={values.isOriginalAudio} onChange={(event) => setValues({ ...values, isOriginalAudio: event.target.checked })} /> Original Audio</label><label className="form-label"><input type="checkbox" checked={values.isActive} onChange={(event) => setValues({ ...values, isActive: event.target.checked })} /> Active Version</label></div>
      </fieldset>
      <Button type="submit" variant="primary" disabled={saving || Boolean(pendingVersion) || loadingVersions || loading.options || Boolean(loadErrors.options)}>{saving ? 'Saving...' : 'Add Version'}</Button>
    </form> : null}
    </div>
  </Modal>;
}

export function MoviesPage() {
  const { movies, saveMovie, loading, loadErrors, refreshMovies, hasPermission, expireSession, pushToast } = useAdminStore();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingMovie, setEditingMovie] = useState(null);
  const [values, setValues] = useState(EMPTY_MOVIE);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingMovie, setPendingMovie] = useState(null);
  const [retryMovieCode, setRetryMovieCode] = useState('');
  const [detailMovie, setDetailMovie] = useState(null);
  const [versionMovie, setVersionMovie] = useState(null);
  const [archiveMovie, setArchiveMovie] = useState(null);
  const [pendingArchive, setPendingArchive] = useState(false);
  const canCreate = hasPermission('movie.create');
  const canUpdate = hasPermission('movie.update');
  const canRead = canCreate || canUpdate || hasPermission('showtime.create');
  const filteredMovies = useMemo(() => movies.filter((movie) => (!statusFilter || movie.status === statusFilter) && [movie.title, movie.movieCode, movie.directorDisplay, movie.slug].some((value) => (value || '').toLowerCase().includes(search.trim().toLowerCase()))), [movies, statusFilter, search]);

  function openForm(movie = null) {
    setEditingMovie(movie);
    setValues(movie ? Object.fromEntries(Object.keys(EMPTY_MOVIE).map((key) => [key, movie[key] ?? EMPTY_MOVIE[key]])) : EMPTY_MOVIE);
    setError('');
    setPendingMovie(null);
    setRetryMovieCode('');
    setFormOpen(true);
  }

  async function checkMovie() {
    if (saving) return;
    setSaving(true);
    try {
      const record = pendingMovie.id
        ? (await adminApi.movies.get(pendingMovie.id)).movie
        : (await adminApi.movies.listAll()).find((movie) => movie.movieCode === pendingMovie.values.movieCode.trim().toUpperCase());
      if (record && !pendingMovie.id) {
        setFormOpen(false);
        pushToast('Đã tìm thấy phim trên máy chủ.');
      } else if (!record) setRetryMovieCode(pendingMovie.values.movieCode);
      setPendingMovie(null);
      setError(record ? 'Đã kiểm tra dữ liệu máy chủ. Có thể gửi lại thay đổi cho cùng phim.' : 'Chưa tìm thấy phim. Có thể gửi lại với cùng mã.');
      await refreshMovies();
    } catch (failure) {
      setError(apiErrorMessage(failure));
      expireSession(failure);
    } finally {
      setSaving(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (saving || pendingMovie) return;
    setError('');
    setSaving(true);
    try {
      await saveMovie({ ...values, movieCode: values.movieCode.trim(), title: values.title.trim(), slug: values.slug.trim(), durationMinutes: Number(values.durationMinutes), directorDisplay: values.directorDisplay.trim() || null, originalLanguageCode: values.originalLanguageCode.trim() || null, synopsis: values.synopsis.trim() || null, releaseDate: values.releaseDate || null, endDate: values.endDate || null }, editingMovie?.id);
      setFormOpen(false);
    } catch (failure) {
      setError(apiErrorMessage(failure));
      if (failure.outcomeUnknown) setPendingMovie({ id: editingMovie?.id, values });
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (saving || pendingArchive) return;
    setSaving(true);
    setError('');
    try {
      await saveMovie({ status: 'ARCHIVED' }, archiveMovie.id);
      setArchiveMovie(null);
    } catch (failure) {
      setError(apiErrorMessage(failure));
      if (failure.outcomeUnknown) setPendingArchive(true);
    } finally {
      setSaving(false);
    }
  }

  async function checkArchive() {
    if (saving) return;
    setSaving(true);
    try {
      const { movie } = await adminApi.movies.get(archiveMovie.id);
      setPendingArchive(false);
      if (movie.status === 'ARCHIVED') {
        setArchiveMovie(null);
        pushToast('Phim đã được lưu trữ trên máy chủ.');
      } else {
        setArchiveMovie(movie);
        setError('Đã kiểm tra phim trên máy chủ. Có thể thử lưu trữ lại.');
      }
      await refreshMovies();
    } catch (failure) {
      setError(apiErrorMessage(failure));
      expireSession(failure);
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    { key: 'title', label: 'Movie Title', sortable: true, sortKey: 'title', render: (movie) => <div><div className="movie-title">{movie.title}</div><div className="meta-row">{movie.movieCode} · {movie.directorDisplay || '—'}</div></div> },
    { key: 'slug', label: 'Slug' },
    { key: 'durationMinutes', label: 'Duration', sortable: true, sortKey: 'durationMinutes', render: (movie) => formatDuration(movie.durationMinutes) },
    { key: 'releaseDate', label: 'Release Date', sortable: true, sortKey: 'releaseDate', render: (movie) => formatDate(movie.releaseDate) },
    { key: 'status', label: 'Status', sortable: true, sortKey: 'status', render: (movie) => <StatusBadge status={statusLabel(movie.status)} /> },
  ];

  if (!canRead) return <p role="alert">Bạn không có quyền xem catalog phim.</p>;

  return <div>
    <PageHeader title="Movie Management" subtitle="Manage the shared SQL movie catalog and screening versions." actions={<><Button variant="secondary" size="sm" onClick={refreshMovies} disabled={loading.movies}><RefreshCw size={16} /> Refresh</Button>{canCreate ? <Button variant="primary" onClick={() => openForm()}><Plus size={16} /> Add Movie</Button> : null}</>} />
    <DataTable columns={columns} data={filteredMovies} searchQuery={search} onSearchChange={setSearch} searchPlaceholder="Search title, code, slug, or director..." isLoading={loading.movies} errorMessage={loadErrors.movies} onRetry={refreshMovies} filters={<select className="data-table-filter-select" aria-label="Filter by movie status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All Statuses</option>{STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select>} renderActions={(movie) => [
      { label: 'View Details', icon: Eye, onClick: () => setDetailMovie(movie) },
      { label: 'Movie Versions', icon: Layers, onClick: () => setVersionMovie(movie) },
      ...(canUpdate ? [{ label: 'Edit Movie', icon: Edit2, onClick: () => openForm(movie) }, ...(movie.status === 'ARCHIVED' ? [] : [{ label: 'Archive Movie', icon: Archive, onClick: () => { setArchiveMovie(movie); setPendingArchive(false); setError(''); } }])] : []),
    ]} />
    <Modal isOpen={formOpen} onClose={() => { if (!saving) setFormOpen(false); }} title={editingMovie ? `Edit "${editingMovie.title}"` : 'Add New Movie'} subtitle="Changes are saved to the shared movie catalog." footer={<><Button variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button><Button type="submit" form="movie-form" variant="primary" disabled={saving || Boolean(pendingMovie)}>{saving ? 'Saving...' : editingMovie ? 'Save Changes' : 'Add Movie'}</Button></>}>
      <form id="movie-form" onSubmit={submit}>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {pendingMovie ? <Button type="button" variant="secondary" onClick={checkMovie} disabled={saving}>Kiểm tra kết quả</Button> : null}
        <fieldset className="form-grid" disabled={saving || Boolean(pendingMovie)} style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="form-field"><label className="form-label" htmlFor="mov-code">Movie Code *</label><input id="mov-code" className="form-input" disabled={Boolean(retryMovieCode)} value={values.movieCode} maxLength={30} pattern="[A-Za-z0-9][A-Za-z0-9_-]*" onChange={(event) => setValues({ ...values, movieCode: event.target.value })} required /></div>
          <div className="form-field"><label className="form-label" htmlFor="mov-slug">Slug *</label><input id="mov-slug" className="form-input" value={values.slug} maxLength={280} pattern="[A-Za-z0-9]+(-[A-Za-z0-9]+)*" placeholder="movie-title" onChange={(event) => setValues({ ...values, slug: event.target.value })} required /></div>
          <div className="form-field form-field--full"><label className="form-label" htmlFor="mov-title">Movie Title *</label><input id="mov-title" className="form-input" value={values.title} maxLength={250} onChange={(event) => setValues({ ...values, title: event.target.value })} required /></div>
          <div className="form-field"><label className="form-label" htmlFor="mov-duration">Duration (minutes) *</label><input id="mov-duration" type="number" className="form-input" min="1" max="600" step="1" value={values.durationMinutes} onChange={(event) => setValues({ ...values, durationMinutes: event.target.value })} required /></div>
          <div className="form-field"><label className="form-label" htmlFor="mov-director">Director</label><input id="mov-director" className="form-input" value={values.directorDisplay} maxLength={250} onChange={(event) => setValues({ ...values, directorDisplay: event.target.value })} /></div>
          <div className="form-field"><label className="form-label" htmlFor="mov-language">Original Language Code</label><input id="mov-language" className="form-input" value={values.originalLanguageCode} maxLength={10} pattern="[A-Za-z0-9-]+" placeholder="vi" onChange={(event) => setValues({ ...values, originalLanguageCode: event.target.value })} /></div>
          <div className="form-field"><label className="form-label" htmlFor="mov-status">Screening Status</label><select id="mov-status" className="form-select" value={values.status} onChange={(event) => setValues({ ...values, status: event.target.value })}>{STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></div>
          <div className="form-field"><label className="form-label" htmlFor="mov-release">Release Date</label><input id="mov-release" type="date" className="form-input" value={values.releaseDate} onChange={(event) => setValues({ ...values, releaseDate: event.target.value })} /></div>
          <div className="form-field"><label className="form-label" htmlFor="mov-end">End Date</label><input id="mov-end" type="date" className="form-input" min={values.releaseDate || undefined} value={values.endDate} onChange={(event) => setValues({ ...values, endDate: event.target.value })} /></div>
          <div className="form-field form-field--full"><label className="form-label" htmlFor="mov-synopsis">Synopsis</label><textarea id="mov-synopsis" className="form-textarea" value={values.synopsis} maxLength={8000} onChange={(event) => setValues({ ...values, synopsis: event.target.value })} /></div>
          <div className="form-field"><label className="form-label"><input type="checkbox" checked={values.isFeatured} onChange={(event) => setValues({ ...values, isFeatured: event.target.checked })} /> Featured Movie</label></div>
        </fieldset>
      </form>
    </Modal>
    <Modal isOpen={Boolean(detailMovie)} onClose={() => setDetailMovie(null)} title={detailMovie?.title || 'Movie Details'} footer={<Button onClick={() => setDetailMovie(null)}>Close</Button>}>
      {detailMovie ? <div className="form-section"><p className="movie-detail-synopsis">{detailMovie.synopsis || 'No synopsis recorded.'}</p><div className="detail-kv-grid" style={{ marginTop: 16 }}>{[['Movie Code', detailMovie.movieCode], ['Slug', detailMovie.slug], ['Director', detailMovie.directorDisplay || '—'], ['Duration', formatDuration(detailMovie.durationMinutes)], ['Release Date', formatDate(detailMovie.releaseDate)], ['Status', statusLabel(detailMovie.status)]].map(([label, value]) => <div className="detail-kv" key={label}><span className="detail-kv-label">{label}</span><span className="detail-kv-value">{value}</span></div>)}</div></div> : null}
    </Modal>
    <Modal isOpen={Boolean(archiveMovie)} onClose={() => { if (!saving) setArchiveMovie(null); }} title="Archive Movie" size="sm" footer={<><Button variant="secondary" onClick={() => setArchiveMovie(null)} disabled={saving}>Cancel</Button>{pendingArchive ? <Button variant="secondary" onClick={checkArchive} disabled={saving}>Kiểm tra kết quả</Button> : <Button variant="danger" onClick={archive} disabled={saving}>{saving ? 'Saving...' : 'Archive Movie'}</Button>}</>}><p>Archive “{archiveMovie?.title}”? Existing showtimes and booking history are retained.</p>{error ? <p className="form-error" role="alert">{error}</p> : null}</Modal>
    {versionMovie ? <MovieVersions key={versionMovie.id} movie={versionMovie} onClose={() => setVersionMovie(null)} /> : null}
  </div>;
}
