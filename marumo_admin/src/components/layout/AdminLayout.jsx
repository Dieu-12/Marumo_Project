import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAdminStore } from '../../hooks/useAdminStore.jsx';
import { Button } from '../common/Button.jsx';
import { Sidebar } from './Sidebar.jsx';
import { TopHeader } from './TopHeader.jsx';
import './AdminLayout.css';

export function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { toasts, dismissToast, isLoggedOut, setIsLoggedOut, adminProfile } = useAdminStore();

  if (isLoggedOut) {
    return (
      <div className="signed-out-screen">
        <div className="signed-out-card">
          <div className="sidebar-logo-mark" aria-hidden="true" style={{ width: 42, height: 42 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 18V6L12 13L20 6V18"
                stroke="#FFFFFF"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 style={{ fontSize: '1.25rem' }}>Session Signed Out</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            You have signed out of the MARUMO Cinema Operations Console. Sign back in as{' '}
            <strong>{adminProfile.name}</strong> to resume management.
          </p>
          <Button variant="primary" size="lg" onClick={() => setIsLoggedOut(false)}>
            Sign Back In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className={`admin-main-wrap ${collapsed ? 'admin-main-wrap--collapsed' : ''}`.trim()}>
        <TopHeader onOpenMobileMenu={() => setMobileOpen(true)} />
        <main className="admin-content">
          <Outlet />
        </main>
      </div>

      {toasts.length > 0 ? (
        <div className="toast-container" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast-item toast-item--${t.variant}`}>
              <span>{t.message}</span>
              <button
                type="button"
                className="toast-close"
                onClick={() => dismissToast(t.id)}
                aria-label="Dismiss notification"
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
