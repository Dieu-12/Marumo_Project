import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { X, Loader2 } from 'lucide-react';
import { useAdminStore } from '../../hooks/useAdminStore.jsx';
import { adminApi } from '../../utils/adminApi.js';
import { Button } from '../common/Button.jsx';
import { Sidebar } from './Sidebar.jsx';
import { TopHeader } from './TopHeader.jsx';
import './AdminLayout.css';

export function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const { toasts, dismissToast, isLoggedOut, setIsLoggedOut, adminProfile, pushToast, setGlobalSearch } = useAdminStore();
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    async function verifySession() {
      try {
        const session = await adminApi.auth.session();
        if (mounted) {
          setGlobalSearch('');
          pushToast('Phiên làm việc đã khôi phục');
        }
      } catch (error) {
        if (mounted) {
          setIsLoggedOut(true);
          navigate('/login', { replace: true });
        }
      } finally {
        if (mounted) setVerifying(false);
      }
    }
    if (!isLoggedOut) {
      verifySession();
    } else {
      setVerifying(false);
    }
    return () => { mounted = false; };
  }, [isLoggedOut, navigate, pushToast, setGlobalSearch]);

  if (verifying) {
    return (
      <div className="admin-shell verifying">
        <div className="verify-spinner" aria-label="Đang xác thực phiên">
          <Loader2 className="spin" size={32} aria-hidden="true" />
          <p>Đang khôi phục phiên...</p>
        </div>
      </div>
    );
  }

  if (isLoggedOut) {
    return null;
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
