import { useMemo, useState } from 'react';
import { Ban, CheckCircle2, Edit2, Plus } from 'lucide-react';
import { useAdminStore } from '../../hooks/useAdminStore.jsx';
import { formatCurrency, formatDate, formatNumber } from '../../utils/formatters.js';
import { validatePromotionForm } from '../../utils/validators.js';
import { Button } from '../../components/common/Button.jsx';
import { Modal } from '../../components/common/Modal.jsx';
import { PageHeader } from '../../components/common/PageHeader.jsx';
import { StatusBadge } from '../../components/common/StatusBadge.jsx';
import { DataTable } from '../../components/tables/DataTable.jsx';
import './PromotionsPage.css';

const EMPTY_PROMO = {
  title: '',
  code: '',
  discountType: 'Percentage',
  discountValue: '15',
  startDate: '2026-11-18',
  endDate: '2026-12-18',
  minTickets: '1',
  maxUsage: '2000',
  applicableCinemaIds: [],
  status: 'Active',
};

export function PromotionsPage() {
  const { promotions, cinemas, savePromotion, togglePromotionStatus } = useAdminStore();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const [formOpen, setFormOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState(null);
  const [formValues, setFormValues] = useState(EMPTY_PROMO);
  const [formErrors, setFormErrors] = useState({});

  const cinemaMap = useMemo(
    () => Object.fromEntries(cinemas.map((c) => [c.id, c.name.replace('MARUMO ', '')])),
    [cinemas]
  );

  const filteredPromotions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return promotions.filter((p) => {
      if (statusFilter !== 'All' && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q)
      );
    });
  }, [promotions, search, statusFilter]);

  const openCreateModal = () => {
    setEditingPromo(null);
    setFormValues({
      ...EMPTY_PROMO,
      applicableCinemaIds: cinemas.filter((c) => c.status === 'Active').map((c) => c.id),
    });
    setFormErrors({});
    setFormOpen(true);
  };

  const openEditModal = (promo) => {
    setEditingPromo(promo);
    setFormValues({
      title: promo.title,
      code: promo.code,
      discountType: promo.discountType,
      discountValue: String(promo.discountValue),
      startDate: promo.startDate,
      endDate: promo.endDate,
      minTickets: String(promo.minTickets || 1),
      maxUsage: String(promo.maxUsage || 1000),
      applicableCinemaIds: promo.applicableCinemaIds || [],
      status: promo.status,
    });
    setFormErrors({});
    setFormOpen(true);
  };

  const toggleCinemaSelection = (cinemaId) => {
    setFormValues((prev) => {
      const exists = prev.applicableCinemaIds.includes(cinemaId);
      return {
        ...prev,
        applicableCinemaIds: exists
          ? prev.applicableCinemaIds.filter((id) => id !== cinemaId)
          : [...prev.applicableCinemaIds, cinemaId],
      };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const candidate = {
      title: formValues.title.trim(),
      code: formValues.code.trim().toUpperCase(),
      discountType: formValues.discountType,
      discountValue: Number(formValues.discountValue),
      startDate: formValues.startDate,
      endDate: formValues.endDate,
      minTickets: Number(formValues.minTickets) || 1,
      maxUsage: Number(formValues.maxUsage) || 1000,
      applicableCinemaIds: formValues.applicableCinemaIds,
      status: formValues.status,
    };
    const result = validatePromotionForm(candidate);
    if (!result.valid) {
      setFormErrors(result.errors);
      return;
    }
    savePromotion(candidate, editingPromo?.id || null);
    setFormOpen(false);
  };

  const columns = [
    {
      key: 'title',
      label: 'Promotion Campaign',
      sortable: true,
      sortKey: 'title',
      render: (row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.title}</div>
          <div className="meta-row">
            <span className="mono-code">{row.code}</span>
            <span className="meta-sep">·</span>
            <span>Min {row.minTickets} ticket(s)</span>
          </div>
        </div>
      ),
    },
    {
      key: 'discountValue',
      label: 'Discount',
      sortable: true,
      sortKey: 'discountValue',
      render: (row) => (
        <span className="tabular-nums" style={{ fontWeight: 600 }}>
          {row.discountType === 'Percentage'
            ? `${row.discountValue}% Off`
            : `${formatCurrency(row.discountValue)} Off`}
        </span>
      ),
    },
    {
      key: 'startDate',
      label: 'Campaign Window',
      sortable: true,
      sortKey: 'startDate',
      render: (row) => (
        <span className="tabular-nums">
          {formatDate(row.startDate)} – {formatDate(row.endDate)}
        </span>
      ),
    },
    {
      key: 'applicableCinemaIds',
      label: 'Applicable Cinemas',
      render: (row) => {
        const ids = row.applicableCinemaIds || [];
        if (ids.length === 0 || ids.length >= cinemas.length) {
          return <span>All Branches</span>;
        }
        const names = ids.slice(0, 2).map((id) => cinemaMap[id] || id);
        return (
          <span>
            {names.join(', ')}
            {ids.length > 2 ? ` +${ids.length - 2} more` : ''}
          </span>
        );
      },
    },
    {
      key: 'usageCount',
      label: 'Redemptions',
      align: 'right',
      sortable: true,
      sortKey: 'usageCount',
      render: (row) => (
        <span className="tabular-nums">
          {formatNumber(row.usageCount)} / {formatNumber(row.maxUsage)}
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
        title="Promotions Management"
        subtitle="Configure ticket discount campaigns, promo codes, validity dates, and branch eligibility."
        actions={
          <Button variant="primary" onClick={openCreateModal}>
            <Plus size={16} aria-hidden="true" />
            <span>Create Promotion</span>
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={filteredPromotions}
        searchQuery={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search campaign title or promo code..."
        filters={
          <select
            className="data-table-filter-select"
            aria-label="Filter by promotion status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="All">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Scheduled">Scheduled</option>
            <option value="Expired">Expired</option>
            <option value="Inactive">Inactive</option>
          </select>
        }
        emptyAction={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setSearch('');
              setStatusFilter('All');
            }}
          >
            Reset Filters
          </Button>
        }
        renderActions={(row) => [
          {
            label: 'Edit Promotion',
            icon: Edit2,
            onClick: () => openEditModal(row),
          },
          row.status === 'Active'
            ? {
                label: 'Deactivate',
                icon: Ban,
                danger: true,
                onClick: () => togglePromotionStatus(row.id, 'Inactive'),
              }
            : {
                label: 'Activate',
                icon: CheckCircle2,
                onClick: () => togglePromotionStatus(row.id, 'Active'),
              },
        ]}
      />

      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingPromo ? `Edit Promotion: ${editingPromo.code}` : 'Create New Promotion'}
        subtitle="Set discount terms, active campaign dates, and eligible cinema branches."
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="promo-form">
              {editingPromo ? 'Save Changes' : 'Launch Promotion'}
            </Button>
          </>
        }
      >
        <form id="promo-form" onSubmit={handleSubmit} noValidate>
          <div className="form-section">
            <div className="form-section-title">Campaign &amp; Discount Terms</div>
            <div className="form-grid">
              <div className="form-field form-field--full">
                <label htmlFor="prm-title" className="form-label">
                  Campaign Title <span className="form-required">*</span>
                </label>
                <input
                  id="prm-title"
                  className={`form-input ${formErrors.title ? 'form-input--error' : ''}`.trim()}
                  value={formValues.title}
                  onChange={(e) => setFormValues({ ...formValues, title: e.target.value })}
                  placeholder="e.g. Autumn IMAX Weekdays"
                />
                {formErrors.title ? <span className="form-error">{formErrors.title}</span> : null}
              </div>

              <div className="form-field">
                <label htmlFor="prm-code" className="form-label">
                  Promo Code <span className="form-required">*</span>
                </label>
                <input
                  id="prm-code"
                  className={`form-input mono-code ${formErrors.code ? 'form-input--error' : ''}`.trim()}
                  value={formValues.code}
                  onChange={(e) =>
                    setFormValues({ ...formValues, code: e.target.value.toUpperCase() })
                  }
                  placeholder="IMAXAUTUMN"
                />
                {formErrors.code ? <span className="form-error">{formErrors.code}</span> : null}
              </div>

              <div className="form-field">
                <label htmlFor="prm-status" className="form-label">
                  Campaign Status
                </label>
                <select
                  id="prm-status"
                  className="form-select"
                  value={formValues.status}
                  onChange={(e) => setFormValues({ ...formValues, status: e.target.value })}
                >
                  <option value="Active">Active</option>
                  <option value="Scheduled">Scheduled</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Expired">Expired</option>
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="prm-type" className="form-label">
                  Discount Type
                </label>
                <select
                  id="prm-type"
                  className="form-select"
                  value={formValues.discountType}
                  onChange={(e) => setFormValues({ ...formValues, discountType: e.target.value })}
                >
                  <option value="Percentage">Percentage (%)</option>
                  <option value="Fixed Amount">Fixed Amount ($)</option>
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="prm-value" className="form-label">
                  Discount Value <span className="form-required">*</span>
                </label>
                <input
                  id="prm-value"
                  type="number"
                  step="0.5"
                  className={`form-input ${formErrors.discountValue ? 'form-input--error' : ''}`.trim()}
                  value={formValues.discountValue}
                  onChange={(e) => setFormValues({ ...formValues, discountValue: e.target.value })}
                />
                {formErrors.discountValue ? (
                  <span className="form-error">{formErrors.discountValue}</span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="form-section" style={{ marginTop: 18 }}>
            <div className="form-section-title">Schedule &amp; Branch Eligibility</div>
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="prm-start" className="form-label">
                  Start Date <span className="form-required">*</span>
                </label>
                <input
                  id="prm-start"
                  type="date"
                  className={`form-input ${formErrors.startDate ? 'form-input--error' : ''}`.trim()}
                  value={formValues.startDate}
                  onChange={(e) => setFormValues({ ...formValues, startDate: e.target.value })}
                />
                {formErrors.startDate ? (
                  <span className="form-error">{formErrors.startDate}</span>
                ) : null}
              </div>

              <div className="form-field">
                <label htmlFor="prm-end" className="form-label">
                  End Date <span className="form-required">*</span>
                </label>
                <input
                  id="prm-end"
                  type="date"
                  className={`form-input ${formErrors.endDate ? 'form-input--error' : ''}`.trim()}
                  value={formValues.endDate}
                  onChange={(e) => setFormValues({ ...formValues, endDate: e.target.value })}
                />
                {formErrors.endDate ? (
                  <span className="form-error">{formErrors.endDate}</span>
                ) : null}
              </div>

              <div className="form-field">
                <label htmlFor="prm-min" className="form-label">
                  Minimum Tickets
                </label>
                <input
                  id="prm-min"
                  type="number"
                  min="1"
                  className="form-input"
                  value={formValues.minTickets}
                  onChange={(e) => setFormValues({ ...formValues, minTickets: e.target.value })}
                />
              </div>

              <div className="form-field">
                <label htmlFor="prm-max" className="form-label">
                  Max Redemptions
                </label>
                <input
                  id="prm-max"
                  type="number"
                  min="1"
                  className="form-input"
                  value={formValues.maxUsage}
                  onChange={(e) => setFormValues({ ...formValues, maxUsage: e.target.value })}
                />
              </div>

              <div className="form-field form-field--full">
                <span className="form-label">Applicable Cinema Branches</span>
                <div className="promo-cinema-checklist">
                  {cinemas.map((c) => (
                    <label key={c.id} className="promo-check-item">
                      <input
                        type="checkbox"
                        checked={formValues.applicableCinemaIds.includes(c.id)}
                        onChange={() => toggleCinemaSelection(c.id)}
                      />
                      <span>{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
