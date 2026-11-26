import { useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  Search,
  Settings,
  UserCheck,
  X,
} from 'lucide-react';
import { useAdminStore } from '../../hooks/useAdminStore.jsx';
import { apiErrorMessage } from '../../utils/adminApi.js';
import { Button } from '../common/Button.jsx';
import { Modal } from '../common/Modal.jsx';
import './TopHeader.css';

const ROUTE_TITLES = {
  '/': 'Dashboard Overview',
  '/cinemas': 'Cinema Management',
  '/movies': 'Movie Management',
  '/showtimes': 'Showtimes Management',
  '/bookings': 'Booking Management',
  '/users': 'User Management',
  '/managers': 'Manager Accounts',
  '/promotions': 'Promotions Management',
  '/reports': 'Revenue & Reports',
  '/settings': 'System Settings',
};

export function TopHeader({ onOpenMobileMenu }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const {
    adminProfile,
    cinemas,
    movies,
    users,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    globalSearch,
    setGlobalSearch,
    logout,
    pushToast,
  } = useAdminStore();

  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const unreadCount = notifications.filter((n) => n.unread).length;
  const pageTitle = ROUTE_TITLES[pathname] || 'Admin Panel';

  const attachHeader = useCallback((node) => {
    const handleOutside = (e) => {
      if (!node.contains(e.target)) {
        setNotifOpen(false);
        setProfileOpen(false);
        setSearchFocused(false);
      }
    };
    node.ownerDocument.addEventListener('mousedown', handleOutside);
    return () => node.ownerDocument.removeEventListener('mousedown', handleOutside);
  }, []);

  const searchResults = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return [];
    const results = [];

    cinemas.forEach((c) => {
      if (c.name.toLowerCase().includes(q) || c.city.toLowerCase().includes(q)) {
        results.push({ id: c.id, title: c.name, type: 'Cinema', route: '/cinemas' });
      }
    });
    movies.forEach((m) => {
      if (m.title.toLowerCase().includes(q) || (m.directorDisplay || '').toLowerCase().includes(q)) {
        results.push({ id: m.id, title: m.title, type: 'Movie', route: '/movies' });
      }
    });
    users.forEach((u) => {
      if (u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) {
        results.push({ id: u.id, title: u.name, type: 'Customer', route: '/users' });
      }
    });

    return results.slice(0, 7);
  }, [globalSearch, cinemas, movies, users]);

  return (
    <header className="top-header" ref={attachHeader}>
      <div className="header-left">
        <button
          type="button"
          className="header-menu-btn"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation menu"
        >
          <Menu size={18} />
        </button>

        <div className="header-breadcrumb">
          <span className="header-breadcrumb-root">MARUMO Admin</span>
          <span className="header-breadcrumb-sep" aria-hidden="true">/</span>
          <span className="header-page-title">{pageTitle}</span>
        </div>
      </div>

      <div className="header-right">
        <div className="header-search-wrap">
          <Search size={15} className="header-search-icon" aria-hidden="true" />
          <input
            type="text"
            className="header-search-input"
            value={globalSearch}
            onFocus={() => setSearchFocused(true)}
            onChange={(e) => {
              setGlobalSearch(e.target.value);
              setSearchFocused(true);
            }}
            placeholder="Search branches, movies, customers..."
            aria-label="Global admin search"
          />
          {globalSearch ? (
            <button
              type="button"
              className="header-search-clear"
              onClick={() => setGlobalSearch('')}
              aria-label="Clear global search"
            >
              <X size={14} />
            </button>
          ) : null}

          {searchFocused && globalSearch.trim() ? (
            <div className="header-search-results" role="listbox" aria-label="Search results">
              {searchResults.length > 0 ? (
                searchResults.map((item) => (
                  <button
                    key={`${item.type}-${item.id}`}
                    type="button"
                    className="header-search-item"
                    onClick={() => {
                      setSearchFocused(false);
                      navigate(item.route);
                    }}
                  >
                    <span className="header-search-item-title">{item.title}</span>
                    <span className="header-search-item-type">{item.type}</span>
                  </button>
                ))
              ) : (
                <div className="header-search-empty">
                  No matching cinemas, movies, or users.
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="header-popover-wrap">
          <button
            type="button"
            className="header-bell-btn"
            aria-label={`Notifications (${unreadCount} unread)`}
            aria-expanded={notifOpen}
            onClick={() => {
              setNotifOpen((o) => !o);
              setProfileOpen(false);
            }}
          >
            <Bell size={17} />
            {unreadCount > 0 ? (
              <span className="header-bell-count tabular-nums">{unreadCount}</span>
            ) : null}
          </button>

          {notifOpen ? (
            <div className="header-dropdown" role="dialog" aria-label="Notifications">
              <div className="header-dropdown-head">
                <span className="header-dropdown-title">Operations Alerts</span>
                {unreadCount > 0 ? (
                  <button
                    type="button"
                    className="header-mark-read-btn"
                    onClick={markAllNotificationsRead}
                  >
                    Mark all read
                  </button>
                ) : null}
              </div>
              <div className="header-notif-list">
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className={`header-notif-item ${n.unread ? 'header-notif-item--unread' : ''}`.trim()}
                    onClick={() => {
                      markNotificationRead(n.id);
                      setNotifOpen(false);
                      navigate(n.route);
                    }}
                  >
                    <span className="header-notif-title">{n.title}</span>
                    <span className="header-notif-detail">{n.detail}</span>
                    <span className="header-notif-time">{n.time}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="header-popover-wrap">
          <button
            type="button"
            className="header-profile-btn"
            aria-label="Administrator profile menu"
            aria-expanded={profileOpen}
            onClick={() => {
              setProfileOpen((o) => !o);
              setNotifOpen(false);
            }}
          >
            <img
              src={adminProfile.avatarUrl || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"%3E%3Crect width="40" height="40" fill="%238E1B2C"/%3E%3Cpath d="M10 30v-20l10 10 10-10v20" stroke="white" fill="none" stroke-width="3"/%3E%3C/svg%3E'}
              alt={adminProfile.name}
              className="header-avatar"
              referrerPolicy="no-referrer"
            />
            <div className="header-profile-meta">
              <span className="header-profile-name">{adminProfile.name}</span>
              <span className="header-profile-role">{adminProfile.role}</span>
            </div>
            <ChevronDown size={15} color="#6B7280" aria-hidden="true" />
          </button>

          {profileOpen ? (
            <div className="header-dropdown header-dropdown--profile" role="menu">
              <div className="header-dropdown-head">
                <div>
                  <div className="header-dropdown-title">{adminProfile.name}</div>
                  <div className="header-notif-detail">{adminProfile.email}</div>
                </div>
              </div>
              <div className="header-menu-list">
                <button
                  type="button"
                  role="menuitem"
                  className="header-menu-item"
                  onClick={() => {
                    setProfileOpen(false);
                    setProfileModalOpen(true);
                  }}
                >
                  <UserCheck size={15} aria-hidden="true" />
                  <span>Administrator Profile</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="header-menu-item"
                  onClick={() => {
                    setProfileOpen(false);
                    navigate('/settings');
                  }}
                >
                  <Settings size={15} aria-hidden="true" />
                  <span>System Settings</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="header-menu-item header-menu-item--danger"
                  onClick={() => {
                    setProfileOpen(false);
                    setLogoutConfirmOpen(true);
                  }}
                >
                  <LogOut size={15} aria-hidden="true" />
                  <span>Log Out</span>
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <Modal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        title="Administrator Profile"
        subtitle="Active system administrator credentials and regional access scope"
        size="sm"
        footer={
          <Button variant="primary" onClick={() => setProfileModalOpen(false)}>
            Close
          </Button>
        }
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <img
            src={adminProfile.avatarUrl || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"%3E%3Crect width="40" height="40" fill="%238E1B2C"/%3E%3Cpath d="M10 30v-20l10 10 10-10v20" stroke="white" fill="none" stroke-width="3"/%3E%3C/svg%3E'}
            alt={adminProfile.name}
            style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover' }}
            referrerPolicy="no-referrer"
          />
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{adminProfile.name}</h3>
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
              {adminProfile.role}
            </p>
          </div>
        </div>
        <div className="form-section">
          <div className="meta-row">
            <strong>Email:</strong> <span>{adminProfile.email}</span>
          </div>
          <div className="meta-row">
            <strong>Access Scope:</strong> <span>{adminProfile.branchScope}</span>
          </div>
          <div className="meta-row">
            <strong>Employee ID:</strong> <span className="mono-code">{String(adminProfile.id).toUpperCase()}</span>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={logoutConfirmOpen}
        onClose={() => setLogoutConfirmOpen(false)}
        title="Sign Out of MARUMO Admin"
        subtitle="Confirm ending your current administrative session."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setLogoutConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                try {
                  await logout();
                  setLogoutConfirmOpen(false);
                  navigate('/login', { replace: true });
                } catch (error) {
                  pushToast(apiErrorMessage(error), 'error');
                }
              }}
            >
              Sign Out
            </Button>
          </>
        }
      >
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
          You are signed in as <strong>{adminProfile.name}</strong>. Any unsaved form changes will be discarded upon signing out.
        </p>
      </Modal>
    </header>
  );
}
