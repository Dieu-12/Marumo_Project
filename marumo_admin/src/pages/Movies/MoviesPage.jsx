import { useMemo, useState } from 'react';
import { Edit2, Eye, Plus, Trash2, RefreshCw } from 'lucide-react';
import { useAdminStore } from '../../hooks/useAdminStore.jsx';
import {
  formatCurrency,
  formatDate,
  formatDuration,
  formatNumber,
} from '../../utils/formatters.js';
import { validateMovieForm } from '../../utils/validators.js';
import { Button } from '../../components/common/Button.jsx';
import { ConfirmDialog } from '../../components/common/ConfirmDialog.jsx';
import { Modal } from '../../components/common/Modal.jsx';
import { PageHeader } from '../../components/common/PageHeader.jsx';
import { PosterImage } from '../../components/common/PosterImage.jsx';
import { StatusBadge } from '../../components/common/StatusBadge.jsx';
import { DataTable } from '../../components/tables/DataTable.jsx';
import './MoviesPage.css';

const POSTER_PRESETS = [
  {
    label: 'Midnight Protocol Key Art',
    url: '/src/assets/images/poster_midnight_protocol_1794994701604.jpg',
  },
  {
    label: 'Orbital Horizon Key Art',
    url: '/src/assets/images/poster_orbital_horizon_1794994701228.jpg',
  },
  {
    label: 'Kyoto in Autumn Key Art',
    url: '/src/assets/images/poster_kyoto_autumn_1794994702034.jpg',
  },
  {
    label: 'Velvet Encore Key Art',
    url: '/src/assets/images/poster_velvet_encore_1794994702127.jpg',
  },
  {
    label: 'The Glass Meridian Key Art',
    url: '/src/assets/images/poster_glass_meridian_1794994703505.jpg',
  },
];

const EMPTY_MOVIE = {
  title: '',
  genre: '',
  durationMinutes: '120',
  releaseDate: '2026-12-01',
  ageRating: 'PG-13',
  director: '',
  language: 'English',
  status: 'Upcoming',
  posterUrl: POSTER_PRESETS[0].url,
  synopsis: '',
};

export function MoviesPage() {
  const { movies, saveMovie, deleteMovie, loading, refreshMovies } = useAdminStore();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [ratingFilter, setRatingFilter] = useState('All');

  const [formOpen, setFormOpen] = useState(false);
  const [editingMovie, setEditingMovie] = useState(null);
  const [formValues, setFormValues] = useState(EMPTY_MOVIE);
  const [formErrors, setFormErrors] = useState({});
  const [detailMovie, setDetailMovie] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const filteredMovies = useMemo(() => {
    const q = search.trim().toLowerCase();
    return movies.filter((m) => {
      if (statusFilter !== 'All' && m.status !== statusFilter) return false;
      if (ratingFilter !== 'All' && m.ageRating !== ratingFilter) return false;
      if (!q) return true;
      return (
        m.title.toLowerCase().includes(q) ||
        m.genre.toLowerCase().includes(q) ||
        m.director.toLowerCase().includes(q)
      );
    });
  }, [movies, search, statusFilter, ratingFilter]);

  const openCreateModal = () => {
    setEditingMovie(null);
    setFormValues(EMPTY_MOVIE);
    setFormErrors({});
    setFormOpen(true);
  };

  const openEditModal = (movie) => {
    setEditingMovie(movie);
    setFormValues({
      title: movie.title,
      genre: movie.genre,
      durationMinutes: String(movie.durationMinutes),
      releaseDate: movie.releaseDate,
      ageRating: movie.ageRating,
      director: movie.director,
      language: movie.language,
      status: movie.status,
      posterUrl: movie.posterUrl,
      synopsis: movie.synopsis || '',
    });
    setFormErrors({});
    setFormOpen(true);
  };

  const handleRefresh = () => {
    refreshMovies();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const candidate = {
      title: formValues.title.trim(),
      genre: formValues.genre.trim(),
      durationMinutes: Number(formValues.durationMinutes),
      releaseDate: formValues.releaseDate,
      ageRating: formValues.ageRating,
      director: formValues.director.trim(),
      language: formValues.language.trim() || 'English',
      status: formValues.status,
      posterUrl: formValues.posterUrl,
      synopsis: formValues.synopsis.trim(),
    };
    const result = validateMovieForm(candidate);
    if (!result.valid) {
      setFormErrors(result.errors);
      return;
    }
    saveMovie(candidate, editingMovie?.id || null);
    setFormOpen(false);
  };

  const columns = [
    {
      key: 'title',
      label: 'Movie Title',
      sortable: true,
      sortKey: 'title',
      render: (row) => (
        <div className="movie-cell">
          <PosterImage src={row.posterUrl} alt={row.title} size="sm" />
          <div>
            <div className="movie-title">{row.title}</div>
            <div className="meta-row">
              <span>{row.director}</span>
              <span className="meta-sep">·</span>
              <span>{row.language}</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'genre',
      label: 'Genre',
      sortable: true,
      sortKey: 'genre',
    },
    {
      key: 'durationMinutes',
      label: 'Duration',
      sortable: true,
      sortKey: 'durationMinutes',
      render: (row) => (
        <span className="tabular-nums">{formatDuration(row.durationMinutes)}</span>
      ),
    },
    {
      key: 'releaseDate',
      label: 'Release Date',
      sortable: true,
      sortKey: 'releaseDate',
      render: (row) => <span className="tabular-nums">{formatDate(row.releaseDate)}</span>,
    },
    {
      key: 'ageRating',
      label: 'Rating',
      render: (row) => <span className="mono-code">{row.ageRating}</span>,
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
        title="Movie Management"
        subtitle="Maintain film catalog metadata, age classifications, release schedules, and screening status."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={handleRefresh} disabled={loading.movies}>
              <RefreshCw size={16} aria-hidden="true" className={loading.movies ? 'spin' : ''} />
              <span>Refresh</span>
            </Button>
            <Button variant="primary" onClick={openCreateModal}>
              <Plus size={16} aria-hidden="true" />
              <span>Add Movie</span>
            </Button>
          </>
        }
      />

      <DataTable
        columns={columns}
        data={filteredMovies}
        searchQuery={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search title, genre, or director..."
        isLoading={loading.movies}
        filters={
          <>
            <select
              className="data-table-filter-select"
              aria-label="Filter by movie status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="All">All Statuses</option>
              <option value="Now Showing">Now Showing</option>
              <option value="Upcoming">Upcoming</option>
              <option value="Ended">Ended</option>
            </select>
            <select
              className="data-table-filter-select"
              aria-label="Filter by age classification"
              value={ratingFilter}
              onChange={(e) => setRatingFilter(e.target.value)}
            >
              <option value="All">All Classifications</option>
              <option value="G">G</option>
              <option value="PG">PG</option>
              <option value="PG-13">PG-13</option>
              <option value="R15+">R15+</option>
              <option value="R18+">R18+</option>
            </select>
          </>
        }
        emptyAction={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setSearch('');
              setStatusFilter('All');
              setRatingFilter('All');
            }}
          >
            Clear Filters
          </Button>
        }
        renderActions={(row) => [
          {
            label: 'View Details',
            icon: Eye,
            onClick: () => setDetailMovie(row),
          },
          {
            label: 'Edit Movie',
            icon: Edit2,
            onClick: () => openEditModal(row),
          },
          {
            label: 'Delete Movie',
            icon: Trash2,
            danger: true,
            onClick: () => setDeleteTarget(row),
          },
        ]}
      />

      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingMovie ? `Edit "${editingMovie.title}"` : 'Add New Movie'}
        subtitle="Provide catalog information, runtime, classification, and poster artwork."
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="movie-form">
              {editingMovie ? 'Save Changes' : 'Add Movie'}
            </Button>
          </>
        }
      >
        <form id="movie-form" onSubmit={handleSubmit} noValidate>
          <div className="form-section">
            <div className="form-section-title">Film Details</div>
            <div className="form-grid">
              <div className="form-field form-field--full">
                <label htmlFor="mov-title" className="form-label">
                  Movie Title <span className="form-required">*</span>
                </label>
                <input
                  id="mov-title"
                  className={`form-input ${formErrors.title ? 'form-input--error' : ''}`.trim()}
                  value={formValues.title}
                  onChange={(e) => setFormValues({ ...formValues, title: e.target.value })}
                  placeholder="Enter official film title"
                />
                {formErrors.title ? <span className="form-error">{formErrors.title}</span> : null}
              </div>

              <div className="form-field">
                <label htmlFor="mov-genre" className="form-label">
                  Genre <span className="form-required">*</span>
                </label>
                <input
                  id="mov-genre"
                  className={`form-input ${formErrors.genre ? 'form-input--error' : ''}`.trim()}
                  value={formValues.genre}
                  onChange={(e) => setFormValues({ ...formValues, genre: e.target.value })}
                  placeholder="e.g. Thriller / Neo-Noir"
                />
                {formErrors.genre ? <span className="form-error">{formErrors.genre}</span> : null}
              </div>

              <div className="form-field">
                <label htmlFor="mov-director" className="form-label">
                  Director <span className="form-required">*</span>
                </label>
                <input
                  id="mov-director"
                  className={`form-input ${formErrors.director ? 'form-input--error' : ''}`.trim()}
                  value={formValues.director}
                  onChange={(e) => setFormValues({ ...formValues, director: e.target.value })}
                  placeholder="Director full name"
                />
                {formErrors.director ? (
                  <span className="form-error">{formErrors.director}</span>
                ) : null}
              </div>

              <div className="form-field">
                <label htmlFor="mov-duration" className="form-label">
                  Duration (minutes) <span className="form-required">*</span>
                </label>
                <input
                  id="mov-duration"
                  type="number"
                  min="30"
                  max="360"
                  className={`form-input ${formErrors.durationMinutes ? 'form-input--error' : ''}`.trim()}
                  value={formValues.durationMinutes}
                  onChange={(e) =>
                    setFormValues({ ...formValues, durationMinutes: e.target.value })
                  }
                />
                {formErrors.durationMinutes ? (
                  <span className="form-error">{formErrors.durationMinutes}</span>
                ) : null}
              </div>

              <div className="form-field">
                <label htmlFor="mov-release" className="form-label">
                  Release Date <span className="form-required">*</span>
                </label>
                <input
                  id="mov-release"
                  type="date"
                  className={`form-input ${formErrors.releaseDate ? 'form-input--error' : ''}`.trim()}
                  value={formValues.releaseDate}
                  onChange={(e) => setFormValues({ ...formValues, releaseDate: e.target.value })}
                />
                {formErrors.releaseDate ? (
                  <span className="form-error">{formErrors.releaseDate}</span>
                ) : null}
              </div>

              <div className="form-field">
                <label htmlFor="mov-rating" className="form-label">
                  Age Classification <span className="form-required">*</span>
                </label>
                <select
                  id="mov-rating"
                  className="form-select"
                  value={formValues.ageRating}
                  onChange={(e) => setFormValues({ ...formValues, ageRating: e.target.value })}
                >
                  <option value="G">G</option>
                  <option value="PG">PG</option>
                  <option value="PG-13">PG-13</option>
                  <option value="R15+">R15+</option>
                  <option value="R18+">R18+</option>
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="mov-status" className="form-label">
                  Screening Status
                </label>
                <select
                  id="mov-status"
                  className="form-select"
                  value={formValues.status}
                  onChange={(e) => setFormValues({ ...formValues, status: e.target.value })}
                >
                  <option value="Now Showing">Now Showing</option>
                  <option value="Upcoming">Upcoming</option>
                  <option value="Ended">Ended</option>
                </select>
              </div>
            </div>
          </div>

          <div className="form-section" style={{ marginTop: 18 }}>
            <div className="form-section-title">Poster &amp; Synopsis</div>
            <div className="form-grid">
              <div className="form-field form-field--full">
                <label htmlFor="mov-poster" className="form-label">
                  Poster Artwork
                </label>
                <select
                  id="mov-poster"
                  className="form-select"
                  value={formValues.posterUrl}
                  onChange={(e) => setFormValues({ ...formValues, posterUrl: e.target.value })}
                >
                  {POSTER_PRESETS.map((p) => (
                    <option key={p.url} value={p.url}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field form-field--full">
                <label htmlFor="mov-synopsis" className="form-label">
                  Synopsis
                </label>
                <textarea
                  id="mov-synopsis"
                  className="form-textarea"
                  value={formValues.synopsis}
                  onChange={(e) => setFormValues({ ...formValues, synopsis: e.target.value })}
                  placeholder="Brief editorial summary for booking and operations reference..."
                />
              </div>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(detailMovie)}
        onClose={() => setDetailMovie(null)}
        title={detailMovie?.title || 'Movie Details'}
        subtitle={detailMovie ? `${detailMovie.genre} · ${detailMovie.ageRating}` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDetailMovie(null)}>
              Close
            </Button>
            {detailMovie ? (
              <Button
                variant="primary"
                onClick={() => {
                  const target = detailMovie;
                  setDetailMovie(null);
                  openEditModal(target);
                }}
              >
                Edit Movie
              </Button>
            ) : null}
          </>
        }
      >
        {detailMovie ? (
          <>
            <div className="movie-detail-hero">
              <PosterImage src={detailMovie.posterUrl} alt={detailMovie.title} size="lg" />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <StatusBadge status={detailMovie.status} />
                  <span className="meta-row">
                    Runtime: <strong>{formatDuration(detailMovie.durationMinutes)}</strong>
                  </span>
                </div>
                <p className="movie-detail-synopsis">
                  {detailMovie.synopsis || 'No synopsis recorded for this title.'}
                </p>
                <div className="detail-kv-grid">
                  <div className="detail-kv">
                    <span className="detail-kv-label">Director</span>
                    <span className="detail-kv-value">{detailMovie.director}</span>
                  </div>
                  <div className="detail-kv">
                    <span className="detail-kv-label">Release Date</span>
                    <span className="detail-kv-value">{formatDate(detailMovie.releaseDate)}</span>
                  </div>
                  <div className="detail-kv">
                    <span className="detail-kv-label">Box Office Revenue</span>
                    <span className="detail-kv-value tabular-nums">
                      {formatCurrency(detailMovie.boxOfficeRevenue)}
                    </span>
                  </div>
                  <div className="detail-kv">
                    <span className="detail-kv-label">Tickets Sold</span>
                    <span className="detail-kv-value tabular-nums">
                      {formatNumber(detailMovie.ticketsSold)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteMovie(deleteTarget.id);
        }}
        title="Delete Movie Record"
        message={
          deleteTarget
            ? `Are you sure you want to delete "${deleteTarget.title}"? Any scheduled showtimes linked to this movie will also be removed.`
            : ''
        }
        confirmLabel="Delete Movie"
      />
    </div>
  );
}
