import { useMemo, useState } from 'react';
import { Eye, UserCheck, UserX } from 'lucide-react';
import { useAdminStore } from '../../hooks/useAdminStore.jsx';
import { formatCurrency, formatDate, formatNumber } from '../../utils/formatters.js';
import { Button } from '../../components/common/Button.jsx';
import { ConfirmDialog } from '../../components/common/ConfirmDialog.jsx';
import { Modal } from '../../components/common/Modal.jsx';
import { PageHeader } from '../../components/common/PageHeader.jsx';
import { StatusBadge } from '../../components/common/StatusBadge.jsx';
import { DataTable } from '../../components/tables/DataTable.jsx';
import './UsersPage.css';

export function UsersPage() {
  const { users, bookings, movies, toggleUserStatus } = useAdminStore();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [tierFilter, setTierFilter] = useState('All');
  const [detailUser, setDetailUser] = useState(null);
  const [statusTarget, setStatusTarget] = useState(null);

  const movieMap = useMemo(
    () => Object.fromEntries(movies.map((m) => [m.id, m.title])),
    [movies]
  );

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (statusFilter !== 'All' && u.status !== statusFilter) return false;
      if (tierFilter !== 'All' && u.tier !== tierFilter) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.phone.toLowerCase().includes(q)
      );
    });
  }, [users, search, statusFilter, tierFilter]);

  const detailUserBookings = useMemo(() => {
    if (!detailUser) return [];
    return bookings.filter((b) => b.userId === detailUser.id);
  }, [bookings, detailUser]);

  const columns = [
    {
      key: 'name',
      label: 'Customer',
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
      key: 'tier',
      label: 'Membership Tier',
      sortable: true,
      sortKey: 'tier',
    },
    {
      key: 'registeredAt',
      label: 'Registered',
      sortable: true,
      sortKey: 'registeredAt',
      render: (row) => <span className="tabular-nums">{formatDate(row.registeredAt)}</span>,
    },
    {
      key: 'totalBookings',
      label: 'Bookings',
      align: 'right',
      sortable: true,
      sortKey: 'totalBookings',
      render: (row) => <span className="tabular-nums">{formatNumber(row.totalBookings)}</span>,
    },
    {
      key: 'totalSpent',
      label: 'Total Spent',
      align: 'right',
      sortable: true,
      sortKey: 'totalSpent',
      render: (row) => (
        <span className="tabular-nums" style={{ fontWeight: 600 }}>
          {formatCurrency(row.totalSpent)}
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
        title="User Management"
        subtitle="Manage customer accounts, loyalty tiers, registration records, and account access."
      />

      <DataTable
        columns={columns}
        data={filteredUsers}
        searchQuery={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search customer name, email, or phone..."
        filters={
          <>
            <select
              className="data-table-filter-select"
              aria-label="Filter by membership tier"
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
            >
              <option value="All">All Tiers</option>
              <option value="Standard">Standard</option>
              <option value="Gold Member">Gold Member</option>
              <option value="Platinum Member">Platinum Member</option>
            </select>
            <select
              className="data-table-filter-select"
              aria-label="Filter by account status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Suspended">Suspended</option>
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
              setStatusFilter('All');
              setTierFilter('All');
            }}
          >
            Reset Filters
          </Button>
        }
        renderActions={(row) => [
          {
            label: 'Customer Details',
            icon: Eye,
            onClick: () => setDetailUser(row),
          },
          row.status === 'Active'
            ? {
                label: 'Deactivate Account',
                icon: UserX,
                danger: true,
                onClick: () => setStatusTarget({ user: row, nextStatus: 'Inactive' }),
              }
            : {
                label: 'Activate Account',
                icon: UserCheck,
                onClick: () => setStatusTarget({ user: row, nextStatus: 'Active' }),
              },
        ]}
      />

      <Modal
        isOpen={Boolean(detailUser)}
        onClose={() => setDetailUser(null)}
        title={detailUser?.name || 'Customer Profile'}
        subtitle={detailUser ? `${detailUser.tier} · ${detailUser.email}` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDetailUser(null)}>
              Close
            </Button>
            {detailUser ? (
              <Button
                variant={detailUser.status === 'Active' ? 'danger' : 'primary'}
                onClick={() => {
                  const nextStatus = detailUser.status === 'Active' ? 'Inactive' : 'Active';
                  setDetailUser(null);
                  setStatusTarget({ user: detailUser, nextStatus });
                }}
              >
                {detailUser.status === 'Active' ? 'Deactivate Account' : 'Activate Account'}
              </Button>
            ) : null}
          </>
        }
      >
        {detailUser ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="meta-row">Phone: {detailUser.phone}</span>
              <StatusBadge status={detailUser.status} />
            </div>

            <div className="detail-kv-grid">
              <div className="detail-kv">
                <span className="detail-kv-label">Registration Date</span>
                <span className="detail-kv-value">{formatDate(detailUser.registeredAt)}</span>
              </div>
              <div className="detail-kv">
                <span className="detail-kv-label">Last Booking Date</span>
                <span className="detail-kv-value">{formatDate(detailUser.lastBookingAt)}</span>
              </div>
              <div className="detail-kv">
                <span className="detail-kv-label">Lifetime Bookings</span>
                <span className="detail-kv-value tabular-nums">{detailUser.totalBookings} orders</span>
              </div>
              <div className="detail-kv">
                <span className="detail-kv-label">Lifetime Spend</span>
                <span className="detail-kv-value tabular-nums">{formatCurrency(detailUser.totalSpent)}</span>
              </div>
            </div>

            <div>
              <div className="form-section-title" style={{ marginBottom: 8 }}>
                Recent Orders
              </div>
              {detailUserBookings.length > 0 ? (
                <div className="user-history-list">
                  {detailUserBookings.map((b) => (
                    <div key={b.id} className="user-history-row">
                      <div>
                        <div className="mono-code" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                          {b.reference}
                        </div>
                        <div className="meta-row">
                          <span>{movieMap[b.movieId] || 'Film'}</span>
                          <span className="meta-sep">·</span>
                          <span>{b.ticketCount} tickets</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="tabular-nums" style={{ fontWeight: 600 }}>
                          {formatCurrency(b.totalAmount)}
                        </span>
                        <StatusBadge status={b.bookingStatus} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                  No recent transactions recorded in the current ledger window.
                </p>
              )}
            </div>
          </>
        ) : null}
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(statusTarget)}
        onClose={() => setStatusTarget(null)}
        onConfirm={() => {
          if (statusTarget) {
            toggleUserStatus(statusTarget.user.id, statusTarget.nextStatus);
          }
        }}
        title={
          statusTarget?.nextStatus === 'Active'
            ? 'Activate Customer Account'
            : 'Deactivate Customer Account'
        }
        message={
          statusTarget
            ? `Are you sure you want to change ${statusTarget.user.name}'s account status to ${statusTarget.nextStatus}?`
            : ''
        }
        confirmLabel={statusTarget?.nextStatus === 'Active' ? 'Activate' : 'Deactivate'}
        tone={statusTarget?.nextStatus === 'Active' ? 'warning' : 'danger'}
      />
    </div>
  );
}
