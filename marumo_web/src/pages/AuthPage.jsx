import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, Eye, EyeOff, ShieldCheck, Ticket } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import './AuthPage.css';

const AUTH_ROUTES = ['/dang-nhap', '/dang-ky'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthPage() {
  const { pathname, state } = useLocation();
  const navigate = useNavigate();
  const { user, signIn, signInDemo, registerAccount } = useApp();
  const isRegister = pathname === '/dang-ky';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const requestedFrom = state?.from;
  const redirectTo =
    typeof requestedFrom === 'string' &&
    requestedFrom.startsWith('/') &&
    !AUTH_ROUTES.includes(requestedFrom)
      ? requestedFrom
      : '/';





  const validate = () => {
    if (isRegister && name.trim().length < 2) {
      return 'Vui lòng nhập họ và tên (ít nhất 2 ký tự).';
    }
    if (!EMAIL_PATTERN.test(email.trim())) {
      return 'Vui lòng nhập địa chỉ email hợp lệ.';
    }
    if (password.length < 6) {
      return 'Mật khẩu cần có ít nhất 6 ký tự.';
    }
    if (isRegister && password !== confirmPassword) {
      return 'Mật khẩu xác nhận không khớp.';
    }
    return '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const message = validate();
    if (message) {
      setError(message);
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      const result = isRegister
        ? await registerAccount({ name, email, password })
        : await signIn({ email, password });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      navigate(redirectTo, { replace: true });
    } catch {
      setError('Không thể xác thực trên kết nối này. Vui lòng mở trang bằng localhost hoặc HTTPS.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoLogin = () => {
    signInDemo();
    navigate(redirectTo, { replace: true });
  };

  if (user) return <Navigate to={redirectTo} replace />;

  return (
    <main className="auth-page" data-testid="auth-page">
      <div className="auth-shell">
        <aside className="auth-visual">
          <img
            src="/src/assets/images/cinema_imax_auditorium_1794993133276.jpg"
            alt=""
            className="auth-visual-img"
          />
          <div className="auth-visual-scrim" aria-hidden="true" />
          <div className="auth-visual-content">
            <span className="auth-eyebrow">MARUMO Club</span>
            <p className="auth-visual-title">Một tài khoản cho mọi suất chiếu.</p>
            <ul className="auth-perk-list">
              <li>
                <Ticket size={17} aria-hidden="true" />
                <span>Vé điện tử lưu ngay trong tài khoản</span>
              </li>
              <li>
                <CheckCircle2 size={17} aria-hidden="true" />
                <span>Tích điểm mỗi lần mua vé và bắp nước</span>
              </li>
              <li>
                <ShieldCheck size={17} aria-hidden="true" />
                <span>Ưu đãi riêng dành cho thành viên</span>
              </li>
            </ul>
          </div>
        </aside>

        <section className="auth-panel" aria-labelledby="auth-title">
          <header className="auth-panel-head">
            <h1 id="auth-title" className="auth-title">
              {isRegister ? 'Tạo tài khoản MARUMO' : 'Đăng nhập MARUMO'}
            </h1>
            <p className="auth-subtitle">
              {isRegister
                ? 'Đăng ký miễn phí để đặt vé nhanh hơn và nhận ưu đãi thành viên.'
                : 'Chào mừng bạn trở lại. Đăng nhập để tiếp tục đặt vé.'}
            </p>
          </header>

          <nav className="auth-switch" aria-label="Chọn hình thức xác thực">
            <Link
              to="/dang-nhap"
              state={requestedFrom ? { from: requestedFrom } : undefined}
              className={`auth-switch-link ${!isRegister ? 'is-active' : ''}`}
              aria-current={!isRegister ? 'page' : undefined}
            >
              Đăng nhập
            </Link>
            <Link
              to="/dang-ky"
              state={requestedFrom ? { from: requestedFrom } : undefined}
              className={`auth-switch-link ${isRegister ? 'is-active' : ''}`}
              data-testid="auth-switch-register"
              aria-current={isRegister ? 'page' : undefined}
            >
              Đăng ký
            </Link>
          </nav>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {isRegister && (
              <div className="form-field">
                <label htmlFor="auth-name" className="form-label">
                  Họ và tên
                </label>
                <input
                  id="auth-name"
                  data-testid="auth-name"
                  type="text"
                  className="form-input"
                  placeholder="Nhập họ và tên"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
            )}

            <div className="form-field">
              <label htmlFor="auth-email" className="form-label">
                Địa chỉ email
              </label>
              <input
                id="auth-email"
                data-testid="auth-email"
                type="email"
                className="form-input"
                placeholder="ban@example.com"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            <div className="form-field">
              <label htmlFor="auth-password" className="form-label">
                Mật khẩu
              </label>
              <div className="auth-password-wrap">
                <input
                  id="auth-password"
                  data-testid="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Ít nhất 6 ký tự"
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? (
                    <EyeOff size={18} aria-hidden="true" />
                  ) : (
                    <Eye size={18} aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {isRegister && (
              <div className="form-field">
                <label htmlFor="auth-confirm-password" className="form-label">
                  Xác nhận mật khẩu
                </label>
                <input
                  id="auth-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Nhập lại mật khẩu"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </div>
            )}

            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-lg auth-submit"
              data-testid="auth-submit"
              disabled={submitting}
            >
              {submitting
                ? 'Đang xử lý...'
                : isRegister
                  ? 'Tạo tài khoản miễn phí'
                  : 'Đăng nhập'}
            </button>
          </form>

          <div className="auth-divider">hoặc</div>

          <button
            type="button"
            className="btn btn-outline auth-demo-btn"
            onClick={handleDemoLogin}
          >
            Dùng thử với tài khoản Minh Anh
          </button>

          <p className="auth-footnote">
            {isRegister ? (
              <>
                Đã có tài khoản?{' '}
                <Link to="/dang-nhap" state={requestedFrom ? { from: requestedFrom } : undefined}>
                  Đăng nhập
                </Link>
              </>
            ) : (
              <>
                Chưa có tài khoản?{' '}
                <Link to="/dang-ky" state={requestedFrom ? { from: requestedFrom } : undefined}>
                  Đăng ký miễn phí
                </Link>
              </>
            )}
          </p>
        </section>
      </div>
    </main>
  );
}
