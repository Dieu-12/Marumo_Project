import { Fragment, useCallback } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AppProvider } from './context/AppContext.jsx';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import SearchModal from './components/SearchModal.jsx';
import TrailerModal from './components/TrailerModal.jsx';
import HomePage from './pages/HomePage.jsx';
import MoviesPage from './pages/MoviesPage.jsx';
import MovieDetailPage from './pages/MovieDetailPage.jsx';
import BookingPage from './pages/BookingPage.jsx';
import CinemasPage from './pages/CinemasPage.jsx';
import CinemaDetailPage from './pages/CinemaDetailPage.jsx';
import PromotionsPage from './pages/PromotionsPage.jsx';
import MembershipPage from './pages/MembershipPage.jsx';
import TicketsPage from './pages/TicketsPage.jsx';
import TicketDetailPage from './pages/TicketDetailPage.jsx';
import AuthPage from './pages/AuthPage.jsx';
import VerifyEmailPage from './pages/VerifyEmailPage.jsx';

function RouteContent({ children }) {
  const { pathname } = useLocation();
  const bindPage = useCallback((node) => {
    if (node) window.scrollTo(0, 0);
  }, [pathname]);
  return <div id="page-content" tabIndex={-1} ref={bindPage} style={{ flex: 1, minWidth: 0 }}><Fragment key={pathname}>{children}</Fragment></div>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          <a className="skip-link" href="#page-content">Đến nội dung chính</a>
          <Header />
          <RouteContent>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/movies" element={<MoviesPage />} />
              <Route path="/movies/:slug" element={<MovieDetailPage />} />
              <Route path="/booking/:movieId" element={<BookingPage />} />
              <Route path="/cinemas" element={<CinemasPage />} />
              <Route path="/cinemas/:cinemaId" element={<CinemaDetailPage />} />
              <Route path="/promotions" element={<PromotionsPage />} />
              <Route path="/membership" element={<MembershipPage />} />
              <Route path="/dang-nhap" element={<AuthPage />} />
              <Route path="/dang-ky" element={<AuthPage />} />
              <Route path="/xac-thuc-email" element={<VerifyEmailPage />} />
              <Route path="/tickets" element={<TicketsPage />} />
              <Route path="/tickets/:bookingId" element={<TicketDetailPage />} />
              <Route path="*" element={<HomePage />} />
            </Routes>
          </RouteContent>
          <Footer />
        </div>

        <SearchModal />
        <TrailerModal />
      </AppProvider>
    </BrowserRouter>
  );
}
