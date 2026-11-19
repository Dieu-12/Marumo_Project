import { useMemo, useState } from 'react';
import { Edit2, Eye, MapPin, Plus, Power, Wrench } from 'lucide-react';
import { useAdminStore } from '../../hooks/useAdminStore.jsx';
import { formatCurrency, formatDate, formatNumber } from '../../utils/formatters.js';
import { validateCinemaForm } from '../../utils/validators.js';
import { Button } from '../../components/common/Button.jsx';
import { Modal } from '../../components/common/Modal.jsx';
import { PageHeader } from '../../components/common/PageHeader.jsx';
import { StatusBadge } from '../../components/common/StatusBadge.jsx';
import { DataTable } from '../../components/tables/DataTable.jsx';
import './CinemasPage.css';

const EMPTY_FORM = {
  name: '',
  city: '',
  region: 'Kanto',
  address: '',
  phone: '',
  screens: '8',
  totalSeats: '1400',
  formatsText: 'IMAX, Dolby Atmos, Standard',
  status: 'Active',
};

export function CinemasPage() {
  const { cinemas, saveCinema, toggleCinemaStatus } = useAdminStore();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [cityFilter, setCityFilter] = useState('All');

  const [formOpen, setFormOpen] = useState(false);
  const [editingCinema, setEditingCinema] = useState(null);
  const [formValues, setFormValues] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [detailCinema, setDetailCinema] = useState(null);

  const cities = useMemo(
    () => ['All', ...Array.from(new Set(cinemas.map((c) => c.city)))],
    [cinemas]
  );

  const filteredCinemas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cinemas.filter((c) => {
      if (statusFilter !== 'All' && c.status !== statusFilter) return false;
      if (cityFilter !== 'All' && c.city !== cityFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q)
      );
    });
  }, [cinemas, search, statusFilter, cityFilter]);

  const totals = useMemo(() => {
    const active = cinemas.filter((c) => c.status === 'Active').length;
    const screens = cinemas.reduce((s, c) => s + Number(c.screens || 0), 0);
    const seats = cinemas.reduce((s, c) => s + Number(c.totalSeats || 0), 0);
    return { total: cinemas.length, active, screens, seats };
  }, [cinemas]);

  const openCreateModal = () => {
    setEditingCinema(null);
    setFormValues(EMPTY_FORM);
    setFormErrors({});
    setFormOpen(true);
  };

  const openEditModal = (cinema) => {
    setEditingCinema(cinema);
    setFormValues({
      name: cinema.name,
      city: cinema.city,
      region: cinema.region || 'Kanto',
      address: cinema.address,
      phone: cinema.phone,
      screens: String(cinema.screens),
      totalSeats: String(cinema.totalSeats),
      formatsText: (cinema.formats || []).join(', '),
      status: cinema.status,
    });
    setFormErrors({});
    setFormOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const candidate = {
      name: formValues.name.trim(),
      city: formValues.city.trim(),
      region: formValues.region,
      address: formValues.address.trim(),
      phone: formValues.phone.trim(),
      screens: Number(formValues.screens),
      totalSeats: Number(formValues.totalSeats),
      formats: formValues.formatsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      status: formValues.status,
    };
    const result = validateCinemaForm(candidate);
    if (!result.valid) {
      setFormErrors(result.errors);
      return;
    }
    saveCinema(candidate, editingCinema?.id || null);
    setFormOpen(false);
  };

  const columns = [
    {
      key: 'name',
      label: 'Cinema Branch',
      sortable: true,
      sortKey: 'name',
      render: (row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.name}</div>
          <div className="meta-row">
            <span className="mono-code">{row.code}</span>
            <span className="meta-sep">·</span>
            <span>{row.city}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'address',
      label: 'Location',
      render: (row) => (
        <div>
          <div>{row.address}</div>
          <div className="meta-row">{row.phone}</div>
        </div>
      ),
    },
    {
      key: 'screens',
      label: 'Screens / Seats',
      align: 'right',
      sortable: true,
      sortKey: 'totalSeats',
      render: (row) => (
        <span className="tabular-nums">
          {row.screens} halls · {formatNumber(row.totalSeats)}
        </span>
      ),
    },
    {
      key: 'monthlyRevenue',
      label: 'Monthly Revenue',
      align: 'right',
      sortable: true,
      sortKey: 'monthlyRevenue',
      render: (row) => (
        <span className="tabular-nums" style={{ fontWeight: 600 }}>
          {formatCurrency(row.monthlyRevenue)}
        </span>
      ),
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
        title="Cinema Management"
        subtitle="Manage multi-branch locations, screening room capacities, and operational status."
        actions={
          <Button variant="primary" onClick={openCreateModal}>
            <Plus size={16} aria-hidden="true" />
            <span>Add Cinema</span>
          </Button>
        }
      />

      <div className="cinema-summary-strip">
        <div className="summary-tile">
          <span className="summary-tile-label">Total Branches</span>
          <span className="summary-tile-value tabular-nums">{totals.total}</span>
        </div>
        <div className="summary-tile">
          <span className="summary-tile-label">Active Locations</span>
          <span className="summary-tile-value tabular-nums">{totals.active}</span>
        </div>
        <div className="summary-tile">
          <span className="summary-tile-label">Total Screening Rooms</span>
          <span className="summary-tile-value tabular-nums">{totals.screens}</span>
        </div>
        <div className="summary-tile">
          <span className="summary-tile-label">Network Seat Capacity</span>
          <span className="summary-tile-value tabular-nums">{formatNumber(totals.seats)}</span>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filteredCinemas}
        searchQuery={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search branch name, code, or city..."
        filters={
          <>
            <select
              className="data-table-filter-select"
              aria-label="Filter by city"
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
            >
              {cities.map((city) => (
                <option key={city} value={city}>
                  {city === 'All' ? 'All Cities' : city}
                </option>
              ))}
            </select>
            <select
              className="data-table-filter-select"
              aria-label="Filter by cinema status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Maintenance">Maintenance</option>
              <option value="Inactive">Inactive</option>
            </select>
          </>
        }
        emptyAction={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setSearch('');
              setCityFilter('All');
              setStatusFilter('All');
            }}
          >
            Reset Filters
          </Button>
        }
        renderActions={(row) => [
          {
            label: 'View Details',
            icon: Eye,
            onClick: () => setDetailCinema(row),
          },
          {
            label: 'Edit Branch',
            icon: Edit2,
            onClick: () => openEditModal(row),
          },
          row.status !== 'Active'
            ? {
                label: 'Mark Active',
                icon: Power,
                onClick: () => toggleCinemaStatus(row.id, 'Active'),
              }
            : {
                label: 'Set Maintenance',
                icon: Wrench,
                onClick: () => toggleCinemaStatus(row.id, 'Maintenance'),
              },
        ]}
      />

      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingCinema ? `Edit ${editingCinema.name}` : 'Add Cinema Branch'}
        subtitle="Configure branch identity, address details, and screening hall capacity."
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="cinema-form">
              {editingCinema ? 'Save Changes' : 'Create Cinema'}
            </Button>
          </>
        }
      >
        <form id="cinema-form" onSubmit={handleSubmit} noValidate>
          <div className="form-section">
            <div className="form-section-title">Branch Identity &amp; Location</div>
            <div className="form-grid">
              <div className="form-field form-field--full">
                <label htmlFor="cin-name" className="form-label">
                  Cinema Name <span className="form-required">*</span>
                </label>
                <input
                  id="cin-name"
                  className={`form-input ${formErrors.name ? 'form-input--error' : ''}`.trim()}
                  value={formValues.name}
                  onChange={(e) => setFormValues({ ...formValues, name: e.target.value })}
                  placeholder="e.g. MARUMO Nagoya Central"
                />
                {formErrors.name ? <span className="form-error">{formErrors.name}</span> : null}
              </div>

              <div className="form-field">
                <label htmlFor="cin-city" className="form-label">
                  City <span className="form-required">*</span>
                </label>
                <input
                  id="cin-city"
                  className={`form-input ${formErrors.city ? 'form-input--error' : ''}`.trim()}
                  value={formValues.city}
                  onChange={(e) => setFormValues({ ...formValues, city: e.target.value })}
                  placeholder="e.g. Tokyo"
                />
                {formErrors.city ? <span className="form-error">{formErrors.city}</span> : null}
              </div>

              <div className="form-field">
                <label htmlFor="cin-region" className="form-label">
                  Region
                </label>
                <select
                  id="cin-region"
                  className="form-select"
                  value={formValues.region}
                  onChange={(e) => setFormValues({ ...formValues, region: e.target.value })}
                >
                  <option value="Kanto">Kanto</option>
                  <option value="Kansai">Kansai</option>
                  <option value="Kyushu">Kyushu</option>
                  <option value="Hokkaido">Hokkaido</option>
                  <option value="Chubu">Chubu</option>
                </select>
              </div>

              <div className="form-field form-field--full">
                <label htmlFor="cin-address" className="form-label">
                  Street Address <span className="form-required">*</span>
                </label>
                <input
                  id="cin-address"
                  className={`form-input ${formErrors.address ? 'form-input--error' : ''}`.trim()}
                  value={formValues.address}
                  onChange={(e) => setFormValues({ ...formValues, address: e.target.value })}
                  placeholder="Street, district, and postal address"
                />
                {formErrors.address ? <span className="form-error">{formErrors.address}</span> : null}
              </div>

              <div className="form-field">
                <label htmlFor="cin-phone" className="form-label">
                  Contact Phone <span className="form-required">*</span>
                </label>
                <input
                  id="cin-phone"
                  className={`form-input ${formErrors.phone ? 'form-input--error' : ''}`.trim()}
                  value={formValues.phone}
                  onChange={(e) => setFormValues({ ...formValues, phone: e.target.value })}
                  placeholder="+81 3-5555-0100"
                />
                {formErrors.phone ? <span className="form-error">{formErrors.phone}</span> : null}
              </div>

              <div className="form-field">
                <label htmlFor="cin-status" className="form-label">
                  Operational Status
                </label>
                <select
                  id="cin-status"
                  className="form-select"
                  value={formValues.status}
                  onChange={(e) => setFormValues({ ...formValues, status: e.target.value })}
                >
                  <option value="Active">Active</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>
          </div>

          <div className="form-section" style={{ marginTop: 18 }}>
            <div className="form-section-title">Capacity &amp; Projection Formats</div>
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="cin-screens" className="form-label">
                  Screening Rooms <span className="form-required">*</span>
                </label>
                <input
                  id="cin-screens"
                  type="number"
                  min="1"
                  max="40"
                  className={`form-input ${formErrors.screens ? 'form-input--error' : ''}`.trim()}
                  value={formValues.screens}
                  onChange={(e) => setFormValues({ ...formValues, screens: e.target.value })}
                />
                {formErrors.screens ? <span className="form-error">{formErrors.screens}</span> : null}
              </div>

              <div className="form-field">
                <label htmlFor="cin-seats" className="form-label">
                  Total Seat Capacity <span className="form-required">*</span>
                </label>
                <input
                  id="cin-seats"
                  type="number"
                  min="40"
                  max="10000"
                  className={`form-input ${formErrors.totalSeats ? 'form-input--error' : ''}`.trim()}
                  value={formValues.totalSeats}
                  onChange={(e) => setFormValues({ ...formValues, totalSeats: e.target.value })}
                />
                {formErrors.totalSeats ? (
                  <span className="form-error">{formErrors.totalSeats}</span>
                ) : null}
              </div>

              <div className="form-field form-field--full">
                <label htmlFor="cin-formats" className="form-label">
                  Supported Formats
                </label>
                <input
                  id="cin-formats"
                  className="form-input"
                  value={formValues.formatsText}
                  onChange={(e) => setFormValues({ ...formValues, formatsText: e.target.value })}
                  placeholder="IMAX Laser, Dolby Atmos, 4DX"
                />
                <span className="form-hint">Separate multiple screening formats with commas.</span>
              </div>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(detailCinema)}
        onClose={() => setDetailCinema(null)}
        title={detailCinema?.name || 'Cinema Details'}
        subtitle={detailCinema ? `${detailCinema.code} · ${detailCinema.city}, ${detailCinema.region}` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDetailCinema(null)}>
              Close
            </Button>
            {detailCinema ? (
              <Button
                variant="primary"
                onClick={() => {
                  const target = detailCinema;
                  setDetailCinema(null);
                  openEditModal(target);
                }}
              >
                Edit Cinema
              </Button>
            ) : null}
          </>
        }
      >
        {detailCinema ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="meta-row">
                <MapPin size={14} aria-hidden="true" />
                <span>{detailCinema.address}</span>
              </div>
              <StatusBadge status={detailCinema.status} />
            </div>

            <div className="detail-kv-grid">
              <div className="detail-kv">
                <span className="detail-kv-label">Contact Phone</span>
                <span className="detail-kv-value">{detailCinema.phone}</span>
              </div>
              <div className="detail-kv">
                <span className="detail-kv-label">Opened Date</span>
                <span className="detail-kv-value">{formatDate(detailCinema.openedDate)}</span>
              </div>
              <div className="detail-kv">
                <span className="detail-kv-label">Screening Rooms</span>
                <span className="detail-kv-value tabular-nums">{detailCinema.screens} halls</span>
              </div>
              <div className="detail-kv">
                <span className="detail-kv-label">Total Seats</span>
                <span className="detail-kv-value tabular-nums">{formatNumber(detailCinema.totalSeats)}</span>
              </div>
              <div className="detail-kv">
                <span className="detail-kv-label">Monthly Revenue</span>
                <span className="detail-kv-value tabular-nums">{formatCurrency(detailCinema.monthlyRevenue)}</span>
              </div>
              <div className="detail-kv">
                <span className="detail-kv-label">Average Occupancy</span>
                <span className="detail-kv-value tabular-nums">{detailCinema.occupancyRate}%</span>
              </div>
              <div className="detail-kv" style={{ gridColumn: '1 / -1' }}>
                <span className="detail-kv-label">Projection &amp; Audio Formats</span>
                <span className="detail-kv-value">
                  {(detailCinema.formats || []).join(' · ') || 'Standard'}
                </span>
              </div>
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  );
}
