import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import { AdminLayout } from '../components/layout/AdminLayout.jsx';
import { Button } from '../components/common/Button.jsx';
import { EmptyState } from '../components/common/EmptyState.jsx';
import { LoginPage } from '../pages/Auth/LoginPage.jsx';
import { BookingsPage } from '../pages/Bookings/BookingsPage.jsx';
import { CinemasPage } from '../pages/Cinemas/CinemasPage.jsx';
import { DashboardPage } from '../pages/Dashboard/DashboardPage.jsx';
import { ManagersPage } from '../pages/Managers/ManagersPage.jsx';
import { MoviesPage } from '../pages/Movies/MoviesPage.jsx';
import { PromotionsPage } from '../pages/Promotions/PromotionsPage.jsx';
import { ReportsPage } from '../pages/Reports/ReportsPage.jsx';
import { SettingsPage } from '../pages/Settings/SettingsPage.jsx';
import { ShowtimesPage } from '../pages/Showtimes/ShowtimesPage.jsx';
import { UsersPage } from '../pages/Users/UsersPage.jsx';
import { useAdminStore } from '../hooks/useAdminStore.jsx';

function PermissionDenied() {
  return (
    <div className="admin-content" style={{ padding: 24 }}>
      <EmptyState icon={ShieldAlert} title="Bạn không có quyền truy cập trang này." description="Hãy liên hệ quản trị viên nếu bạn cho rằng đây là nhầm lẫn." action={<Button variant="secondary" onClick={() => window.history.back()}>Quay lại</Button>} />
    </div>
  );
}

function PermissionRoute({ allowed, children }) {
  const { sessionStatus } = useAdminStore();
  const location = useLocation();
  if (sessionStatus === 'loading') return <div className="admin-shell verifying"><Loader2 className="spin" size={32} aria-hidden="true" /></div>;
  if (sessionStatus !== 'authenticated') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return allowed ? children : <PermissionDenied />;
}

export function AppRoutes() {
  const { canReadMovies, canReadBookings, canCreateShowtimes, canAccessAdmin } = useAdminStore();
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AdminLayout />}>
        <Route path="/" element={<PermissionRoute allowed={canAccessAdmin}><DashboardPage /></PermissionRoute>} />
        <Route path="/cinemas" element={<PermissionRoute allowed={canAccessAdmin}><CinemasPage /></PermissionRoute>} />
        <Route path="/movies" element={<PermissionRoute allowed={canReadMovies}><MoviesPage /></PermissionRoute>} />
        <Route path="/showtimes" element={<PermissionRoute allowed={canCreateShowtimes}><ShowtimesPage /></PermissionRoute>} />
        <Route path="/bookings" element={<PermissionRoute allowed={canReadBookings}><BookingsPage /></PermissionRoute>} />
        <Route path="/users" element={<PermissionRoute allowed={canAccessAdmin}><UsersPage /></PermissionRoute>} />
        <Route path="/managers" element={<PermissionRoute allowed={canAccessAdmin}><ManagersPage /></PermissionRoute>} />
        <Route path="/promotions" element={<PermissionRoute allowed={canAccessAdmin}><PromotionsPage /></PermissionRoute>} />
        <Route path="/reports" element={<PermissionRoute allowed={canAccessAdmin}><ReportsPage /></PermissionRoute>} />
        <Route path="/settings" element={<PermissionRoute allowed={canAccessAdmin}><SettingsPage /></PermissionRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
