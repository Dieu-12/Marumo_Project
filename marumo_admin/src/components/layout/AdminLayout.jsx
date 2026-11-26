import { useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { X, Loader2 } from 'lucide-react';
import { useAdminStore } from '../../hooks/useAdminStore.jsx';

import { Button } from '../common/Button.jsx';
import { Sidebar } from './Sidebar.jsx';
import { TopHeader } from './TopHeader.jsx';
import './AdminLayout.css';

export function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { toasts, dismissToast, session, sessionStatus, sessionError, restoreSession, canAccessAdmin, bindAdminData } = useAdminStore();
  const location = useLocation();

  if (sessionStatus === 'loading') return <div className="admin-shell verifying"><div className="verify-spinner" role="status"><Loader2 className="spin" size={32} aria-hidden="true" /><p>Đang khôi phục phiên...</p></div></div>;
  if (sessionStatus === 'error') return <div className="login-page"><div className="login-card"><p role="alert">{sessionError}</p><Button onClick={restoreSession}>Thử lại</Button></div></div>;
  if (sessionStatus !== 'authenticated' || !canAccessAdmin) return <Navigate to="/login" replace state={{ from: location.pathname + location.search, message: sessionStatus === 'authenticated' ? 'Tài khoản không có quyền truy cập quản trị.' : '' }} />;
  return (
    <div className="admin-shell" ref={bindAdminData} key={session.customer.id}>
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
