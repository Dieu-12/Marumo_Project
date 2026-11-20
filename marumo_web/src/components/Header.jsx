import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Menu, Search, Ticket, User, X } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import './Header.css';

const NAV_ITEMS = [
  { to: '/movies', label: 'Phim' },
  { to: '/cinemas', label: 'Rạp chiếu' },
  { to: '/promotions', label: 'Ưu đãi' },
  { to: '/membership', label: 'Thành viên' },
];

export default function Header() {
  const { user, logoutUser, openAuthPage, setSearchModalOpen } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawerRef = useRef(null);
  const navigate = useNavigate();

  const closeMobileMenu = () => setMobileOpen(false);

  const handleBookClick = () => {
    closeMobileMenu();
    navigate('/movies');
  };

  useEffect(() => {
    if (!mobileOpen) return undefined;

    const previousFocus = document.activeElement;
    const drawer = drawerRef.current;
    const focusable = () => drawer?.querySelectorAll('a[href], button:not([disabled])') || [];
    focusable()[0]?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeMobileMenu();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = [...focusable()];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [mobileOpen]);

  return (
    <>
      <header className="site-header">
        <div className="container header-inner">
          <Link to="/" className="header-brand" aria-label="MARUMO Cinema — Trang chủ">
            <span className="header-brand-mark" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 18V6L12 13L20 6V18"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span>MARUMO</span>
          </Link>

          <nav className="header-nav" aria-label="Điều hướng chính">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `header-nav-link ${isActive ? 'is-active' : ''}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="header-actions">
            <button
              type="button"
              className="header-icon-btn"
              data-testid="header-search-open"
              aria-label="Tìm phim và rạp chiếu"
              onClick={() => setSearchModalOpen(true)}
            >
              <Search size={19} aria-hidden="true" />
            </button>

            {user ? (
              <div className="header-user-menu">
                <Link to="/membership" className="header-user-link">
                  <User size={16} aria-hidden="true" />
                  <span>{user.name}</span>
                </Link>
                <button
                  type="button"
                  className="header-logout-btn"
                  onClick={logoutUser}
                >
                  Đăng xuất
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="header-auth-btn"
                onClick={() => openAuthPage('login')}
              >
                <User size={17} aria-hidden="true" />
                <span className="header-auth-label">Đăng nhập</span>
              </button>
            )}

            <button
              type="button"
              className="btn btn-primary btn-sm header-book-desktop"
              aria-label="Chọn phim để đặt vé"
              onClick={handleBookClick}
            >
              <Ticket size={16} aria-hidden="true" />
              <span>Chọn phim</span>
            </button>

            <button
              type="button"
              className="header-mobile-toggle"
              aria-label={mobileOpen ? 'Đóng menu điều hướng' : 'Mở menu điều hướng'}
              aria-expanded={mobileOpen}
              aria-controls="mobile-navigation"
              onClick={() => setMobileOpen((open) => !open)}
            >
              {mobileOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </header>

      {mobileOpen && (
        <div
          className="mobile-drawer-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeMobileMenu();
          }}
        >
          <div
            id="mobile-navigation"
            ref={drawerRef}
            className="mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Menu điều hướng MARUMO"
          >
            <div className="mobile-drawer-top">
              <Link
                to="/"
                className="header-brand"
                onClick={closeMobileMenu}
              >
                <span className="header-brand-mark" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M4 18V6L12 13L20 6V18"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span>MARUMO</span>
              </Link>
              <button
                type="button"
                className="header-icon-btn"
                aria-label="Đóng menu điều hướng"
                onClick={closeMobileMenu}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <nav className="mobile-drawer-links" aria-label="Menu chính">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `mobile-drawer-link ${isActive ? 'is-active' : ''}`
                }
                onClick={closeMobileMenu}
              >
                Trang chủ
              </NavLink>
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `mobile-drawer-link ${isActive ? 'is-active' : ''}`
                  }
                  onClick={closeMobileMenu}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <div className="mobile-drawer-footer">
              {user ? (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    logoutUser();
                    closeMobileMenu();
                  }}
                >
                  Đăng xuất ({user.name})
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    closeMobileMenu();
                    openAuthPage('login');
                  }}
                >
                  Đăng nhập / Đăng ký
                </button>
              )}

              <button
                type="button"
                className="btn btn-primary"
                onClick={handleBookClick}
              >
                <Ticket size={16} aria-hidden="true" />
                <span>Chọn phim</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
