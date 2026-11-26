import { useState } from 'react';
import { useLocation, Navigate } from 'react-router-dom';
import { Lock, Mail, AlertCircle } from 'lucide-react';
import { apiErrorMessage } from '../../utils/adminApi.js';
import { useAdminStore } from '../../hooks/useAdminStore.jsx';
import { Button } from '../../components/common/Button.jsx';
import { PageHeader } from '../../components/common/PageHeader.jsx';
import './LoginPage.css';

export function LoginPage() {
  const location = useLocation();
  const { login, logout, canAccessAdmin, canReadMovies, sessionStatus } = useAdminStore();
  const from = location.state?.from || (canReadMovies ? '/movies' : '/bookings');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(location.state?.message || '');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (failure) {
      setError(failure.code === 'PERMISSION_DENIED' ? 'Tài khoản không có quyền truy cập quản trị.' : apiErrorMessage(failure));
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    setLoading(true);
    try {
      await logout();
      setError('');
    } catch (failure) {
      setError(apiErrorMessage(failure));
    } finally {
      setLoading(false);
    }
  }

  if (sessionStatus === 'authenticated' && canAccessAdmin) return <Navigate to={from} replace />;

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-card">
          <PageHeader title="Đăng nhập Quản trị" subtitle="Đăng nhập bằng tài khoản có quyền quản lý catalog hoặc booking." />
          {error ? <div className="login-error" role="alert"><AlertCircle size={18} aria-hidden="true" /><span>{error}</span></div> : null}
          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-field">
              <label htmlFor="admin-email" className="form-label">Email <span className="form-required">*</span></label>
              <div className="input-with-icon"><Mail size={18} aria-hidden="true" /><input id="admin-email" type="email" className="form-input" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required disabled={loading} /></div>
            </div>
            <div className="form-field">
              <label htmlFor="admin-password" className="form-label">Mật khẩu <span className="form-required">*</span></label>
              <div className="input-with-icon"><Lock size={18} aria-hidden="true" /><input id="admin-password" type="password" className="form-input" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required disabled={loading} /></div>
            </div>
            <Button type="submit" variant="primary" className="login-submit" disabled={loading || sessionStatus === 'loading'}>{loading ? 'Đang đăng nhập...' : 'Đăng nhập'}</Button>
          </form>
          <div className="login-footer"><Button variant="ghost" size="sm" onClick={handleLogout} disabled={loading}>Đăng xuất khỏi tài khoản hiện tại</Button></div>
        </div>
      </div>
    </div>
  );
}
