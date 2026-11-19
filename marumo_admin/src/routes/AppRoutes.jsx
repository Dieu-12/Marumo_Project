import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from '../components/layout/AdminLayout.jsx';
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

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/cinemas" element={<CinemasPage />} />
        <Route path="/movies" element={<MoviesPage />} />
        <Route path="/showtimes" element={<ShowtimesPage />} />
        <Route path="/bookings" element={<BookingsPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/managers" element={<ManagersPage />} />
        <Route path="/promotions" element={<PromotionsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
