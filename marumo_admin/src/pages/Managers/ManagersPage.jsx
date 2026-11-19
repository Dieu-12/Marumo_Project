import { useMemo, useState } from 'react';
import { Edit2, Plus, Power, UserX } from 'lucide-react';
import { useAdminStore } from '../../hooks/useAdminStore.jsx';
import { validateManagerForm } from '../../utils/validators.js';
import { Button } from '../../components/common/Button.jsx';
import { Modal } from '../../components/common/Modal.jsx';
import { PageHeader } from '../../components/common/PageHeader.jsx';
import { StatusBadge } from '../../components/common/StatusBadge.jsx';
import { DataTable } from '../../components/tables/DataTable.jsx';
import './ManagersPage.css';

const EMPTY_MANAGER = {
  name: '',
  email: '',
  phone: '',
  role: 'Branch Manager',
  department: 'Branch Operations',
  cinemaId: '',
  status: 'Active',
};

export function ManagersPage() {
  const { managers, cinemas, saveManager, toggleManagerStatus } = useAdminStore();

  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  const [formOpen, setFormOpen] = useState(false);
  const [editingManager, setEditingManager] = useState(null);
  const [formValues, setFormValues] = useState(EMPTY_MANAGER);
  const [formErrors, setFormErrors] = useState({});

  const cinemaMap = useMemo(
    () => Object.fromEntries(cinemas.map((c) => [c.id, c])),
    [cinemas]
  );

  const enrichedManagers = useMemo(
    () =>
      managers.map((m) => ({
        ...m,
        cinemaName: cinemaMap[m.cinemaId]?.name || 'Unassigned',
        cinemaCity: cinemaMap[m.cinemaId]?.city || '',
      })),
    [managers, cinemaMap]
  );

  const filteredManagers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enrichedManagers.filter((m) => {
      if (branchFilter !== 'All' && m.cinemaId !== branchFilter) return false;
      if (statusFilter !== 'All' && m.status !== statusFilter) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q) ||
        m.cinemaName.toLowerCase().includes(q)
      );
    });
  }, [enrichedManagers, search, branchFilter, statusFilter]);

  const openCreateModal = () => {
    setEditingManager(null);
    setFormValues({
      ...EMPTY_MANAGER,
      cinemaId: cinemas[0]?.id || '',
    });
    setFormErrors({});
    setFormOpen(true);
  };

  const openEditModal = (manager) => {
    setEditingManager(manager);
    setFormValues({
      name: manager.name,
      email: manager.email,
      phone: manager.phone,
      role: manager.role,
      department: manager.department || 'Branch Operations',
      cinemaId: manager.cinemaId,
      status: manager.status,
    });
    setFormErrors({});
    setFormOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const candidate = {
      name: formValues.name.trim(),
      email: formValues.email.trim(),
      phone: formValues.phone.trim(),
      role: formValues.role,
      department: formValues.department.trim() || 'Branch Operations',
      cinemaId: formValues.cinemaId,
      status: formValues.status,
    };
    const result = validateManagerForm(candidate);
    if (!result.valid) {
      setFormErrors(result.errors);
      return;
    }
    saveManager(candidate, editingManager?.id || null);
    setFormOpen(false);
  };

  const columns = [
    {
      key: 'name',
      label: 'Manager Account',
      sortable: true,
      sortKey: 'name',
      render: (row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.name}</div>
          <div className="meta-row">
            <span>{row.email}</span>
            <span className="meta-sep">·</span>
            <span>{row.phone}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      label: 'Role & Department',
      sortable: true,
      sortKey: 'role',
      render: (row) => (
        <div>
          <div style={{ fontWeight: 500 }}>{row.role}</div>
          <div className="meta-row">{row.department}</div>
        </div>
      ),
    },
    {
      key: 'cinemaName',
      label: 'Assigned Cinema',
      sortable: true,
      sortKey: 'cinemaName',
      render: (row) => (
        <div className="manager-branch-cell">
          <span style={{ fontWeight: 500 }}>{row.cinemaName}</span>
          {row.cinemaCity ? <span className="meta-row">{row.cinemaCity}</span> : null}
        </div>
      ),
    },
    {
      key: 'lastActive',
      label: 'Last Active',
      render: (row) => <span className="mono-code">{row.lastActive}</span>,
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
        title="Manager Accounts"
        subtitle="Administer branch managers, shift supervisors, and cinema branch assignments."
        actions={
          <Button variant="primary" onClick={openCreateModal}>
            <Plus size={16} aria-hidden="true" />
            <span>Add Manager</span>
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={filteredManagers}
        searchQuery={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search manager name, email, or branch..."
        filters={
          <>
            <select
              className="data-table-filter-select"
              aria-label="Filter by assigned branch"
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
            >
              <option value="All">All Branches</option>
              {cinemas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className="data-table-filter-select"
              aria-label="Filter by manager status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="On Leave">On Leave</option>
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
              setBranchFilter('All');
              setStatusFilter('All');
            }}
          >
            Reset Filters
          </Button>
        }
        renderActions={(row) => [
          {
            label: 'Edit & Reassign',
            icon: Edit2,
            onClick: () => openEditModal(row),
          },
          row.status === 'Active'
            ? {
                label: 'Deactivate Account',
                icon: UserX,
                danger: true,
                onClick: () => toggleManagerStatus(row.id, 'Inactive'),
              }
            : {
                label: 'Activate Account',
                icon: Power,
                onClick: () => toggleManagerStatus(row.id, 'Active'),
              },
        ]}
      />

      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingManager ? `Edit Manager: ${editingManager.name}` : 'Create Manager Account'}
        subtitle="Assign role permissions and target cinema branch responsibility."
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="manager-form">
              {editingManager ? 'Save Changes' : 'Create Manager'}
            </Button>
          </>
        }
      >
        <form id="manager-form" onSubmit={handleSubmit} noValidate>
          <div className="form-section">
            <div className="form-section-title">Account Information</div>
            <div className="form-grid">
              <div className="form-field form-field--full">
                <label htmlFor="mgr-name" className="form-label">
                  Full Name <span className="form-required">*</span>
                </label>
                <input
                  id="mgr-name"
                  className={`form-input ${formErrors.name ? 'form-input--error' : ''}`.trim()}
                  value={formValues.name}
                  onChange={(e) => setFormValues({ ...formValues, name: e.target.value })}
                  placeholder="e.g. Kenji Sato"
                />
                {formErrors.name ? <span className="form-error">{formErrors.name}</span> : null}
              </div>

              <div className="form-field">
                <label htmlFor="mgr-email" className="form-label">
                  Work Email <span className="form-required">*</span>
                </label>
                <input
                  id="mgr-email"
                  type="email"
                  className={`form-input ${formErrors.email ? 'form-input--error' : ''}`.trim()}
                  value={formValues.email}
                  onChange={(e) => setFormValues({ ...formValues, email: e.target.value })}
                  placeholder="name@marumo-cinemas.com"
                />
                {formErrors.email ? <span className="form-error">{formErrors.email}</span> : null}
              </div>

              <div className="form-field">
                <label htmlFor="mgr-phone" className="form-label">
                  Contact Phone <span className="form-required">*</span>
                </label>
                <input
                  id="mgr-phone"
                  className={`form-input ${formErrors.phone ? 'form-input--error' : ''}`.trim()}
                  value={formValues.phone}
                  onChange={(e) => setFormValues({ ...formValues, phone: e.target.value })}
                  placeholder="+81 3-5555-0100"
                />
                {formErrors.phone ? <span className="form-error">{formErrors.phone}</span> : null}
              </div>
            </div>
          </div>

          <div className="form-section" style={{ marginTop: 18 }}>
            <div className="form-section-title">Role &amp; Branch Assignment</div>
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="mgr-role" className="form-label">
                  Role <span className="form-required">*</span>
                </label>
                <select
                  id="mgr-role"
                  className="form-select"
                  value={formValues.role}
                  onChange={(e) => setFormValues({ ...formValues, role: e.target.value })}
                >
                  <option value="Branch Manager">Branch Manager</option>
                  <option value="Senior Branch Manager">Senior Branch Manager</option>
                  <option value="Regional Coordinator">Regional Coordinator</option>
                  <option value="Shift Supervisor">Shift Supervisor</option>
                  <option value="Facilities Manager">Facilities Manager</option>
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="mgr-dept" className="form-label">
                  Department
                </label>
                <input
                  id="mgr-dept"
                  className="form-input"
                  value={formValues.department}
                  onChange={(e) => setFormValues({ ...formValues, department: e.target.value })}
                />
              </div>

              <div className="form-field">
                <label htmlFor="mgr-cinema" className="form-label">
                  Assigned Cinema Branch <span className="form-required">*</span>
                </label>
                <select
                  id="mgr-cinema"
                  className={`form-select ${formErrors.cinemaId ? 'form-select--error' : ''}`.trim()}
                  value={formValues.cinemaId}
                  onChange={(e) => setFormValues({ ...formValues, cinemaId: e.target.value })}
                >
                  <option value="">Select branch</option>
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
                <label htmlFor="mgr-status" className="form-label">
                  Account Status
                </label>
                <select
                  id="mgr-status"
                  className="form-select"
                  value={formValues.status}
                  onChange={(e) => setFormValues({ ...formValues, status: e.target.value })}
                >
                  <option value="Active">Active</option>
                  <option value="On Leave">On Leave</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
