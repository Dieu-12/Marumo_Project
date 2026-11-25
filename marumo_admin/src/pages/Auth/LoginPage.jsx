import { useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Lock, Mail, AlertCircle } from 'lucide-react';
import { adminApi } from '../../utils/adminApi.js';
import { useAdminStore } from '../../hooks/useAdminStore.jsx';
import { Button } from '../../components/common/Button.jsx';
import { PageHeader } from '../../components/common/PageHeader.jsx';
import './LoginPage.css';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setIsLoggedOut, pushToast, adminProfile } = useAdminStore();

  const from = location.state?.from?.pathname || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      await adminApi.auth.login(email, password);
      pushToast('Đăng nhập thành công');
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.code === 'PERMISSION_DENIED' ? 'Tài khoản không có quyền truy cập trang quản trị' : 'Email hoặc mật khẩu không đúng');
    } finally {
      setLoading(false);
    }
  }, [email, password, navigate, from, pushToast]);

  const handleLogout = useCallback(async () => {
    try {
      await adminApi.auth.logout();
    } catch {
      // Ignore logout errors
    }
    setIsLoggedOut(true);
    navigate('/login', { replace: true });
  }, [navigate, setIsLoggedOut]);

  if (!adminProfile) {
    return null;
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-card">
          <PageHeader
            title="Đăng nhập Quản trị"
            subtitle="Nhập thông tin tài khoản quản trị viên để truy cập hệ thống"
          />

          {error && (
            <div className="login-error" role="alert">
              <AlertCircle size={18} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="login-form">
            <div className="form-field">
              <label htmlFor="admin-email" className="form-label">
                Email <span className="form-required">*</span>
              </label>
              <div className="input-with-icon">
                <Mail size={18} aria-hidden="true" />
                <input
                  id="admin-email"
                  type="email"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@marumo.example"
                  autoComplete="email"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="admin-password" className="form-label">
                Mật khẩu <span className="form-required">*</span>
              </label>
              <div className="input-with-icon">
                <Lock size={18} aria-hidden="true" />
                <input
                  id="admin-password"
                  type="password"
                  className="form-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu"
                  autoComplete="current-password"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              className="login-submit"
              disabled={loading}
            >
              {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </Button>
          </form>

          <div className="login-footer">
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              Đăng xuất khỏi tài khoản hiện tại
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}