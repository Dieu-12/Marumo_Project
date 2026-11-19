import { Link } from 'react-router-dom';
import './Footer.css';

const FOOTER_LINKS = [
  { to: '/movies', label: 'Phim đang chiếu' },
  { to: '/cinemas', label: 'Hệ thống rạp' },
  { to: '/promotions', label: 'Ưu đãi' },
  { to: '/membership', label: 'MARUMO Club' },
  { to: '/tickets', label: 'Vé của tôi' },
];

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand-column">
            <Link to="/" className="footer-brand" aria-label="MARUMO Cinema — Trang chủ">
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
            <p className="footer-about">
              Cùng bạn chọn phim hay, tìm suất chiếu phù hợp và đặt chỗ nhanh chóng.
            </p>
          </div>

          <nav aria-label="Liên kết MARUMO">
            <h2 className="footer-heading">Khám phá</h2>
            <ul className="footer-links">
              {FOOTER_LINKS.map((item) => (
                <li key={item.to}>
                  <Link to={item.to} className="footer-link">{item.label}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="footer-booking">
            <h2 className="footer-heading">Sẵn sàng cho buổi xem phim?</h2>
            <p>Chọn bộ phim yêu thích để xem lịch chiếu tại các rạp MARUMO.</p>
            <Link to="/movies" className="btn btn-primary btn-sm footer-booking-link">
              Khám phá phim
            </Link>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© 2026 MARUMO Cinema</span>
          <Link to="/cinemas" className="footer-link">Tìm rạp chiếu</Link>
        </div>
      </div>
    </footer>
  );
}
