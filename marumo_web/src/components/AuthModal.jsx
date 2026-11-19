import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import './Modals.css';

export default function AuthModal() {
  const { authModalOpen, authMode, setAuthMode, closeAuthModal, loginUser } = useApp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authModalOpen) return undefined;
    const handleKey = (e) => {
      if (e.key === 'Escape') closeAuthModal();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [authModalOpen, closeAuthModal]);

  if (!authModalOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (authMode === 'register' && name.trim().length < 2) {
      setError('Vui lòng nhập họ và tên.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Vui lòng nhập địa chỉ email hợp lệ.');
      return;
    }
    if (password.length < 6) {
      setError('Mật khẩu cần có ít nhất 6 ký tự.');
      return;
    }

    loginUser({
      name: authMode === 'register' ? name.trim() : email.split('@')[0],
      email: email.trim(),
    });
    setName('');
    setEmail('');
    setPassword('');
  };

  const handleDemoLogin = () => {
    loginUser({
      name: 'Minh Anh',
      email: 'minh.anh@marumocine.com',
    });
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      onClick={closeAuthModal}
    >
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="auth-modal-title" className="modal-title">
            {authMode === 'login' ? 'Đăng nhập MARUMO' : 'Tạo tài khoản MARUMO Club'}
          </h2>
          <button
            type="button"
            className="modal-close-btn"
            aria-label="Đóng hộp thoại tài khoản"
            onClick={closeAuthModal}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="modal-body">
          <div className="auth-tabs" role="tablist" aria-label="Đăng nhập hoặc đăng ký">
            <button
              type="button"
              role="tab"
              aria-selected={authMode === 'login'}
              className={`auth-tab ${authMode === 'login' ? 'is-active' : ''}`}
              onClick={() => {
                setAuthMode('login');
                setError('');
              }}
            >
              Đăng nhập
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={authMode === 'register'}
              className={`auth-tab ${authMode === 'register' ? 'is-active' : ''}`}
              onClick={() => {
                setAuthMode('register');
                setError('');
              }}
            >
              Đăng ký
            </button>
          </div>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {authMode === 'register' && (
              <div className="form-field">
                <label htmlFor="auth-name" className="form-label">
                  Họ và tên
                </label>
                <input
                  id="auth-name"
                  type="text"
                  className="form-input"
                  placeholder="Nhập họ và tên"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}

            <div className="form-field">
              <label htmlFor="auth-email" className="form-label">
                Địa chỉ email
              </label>
              <input
                id="auth-email"
                type="email"
                className="form-input"
                placeholder="ban@example.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label htmlFor="auth-password" className="form-label">
                Mật khẩu
              </label>
              <input
                id="auth-password"
                type="password"
                className="form-input"
                placeholder="Ít nhất 6 ký tự"
                autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
              {authMode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản miễn phí'}
            </button>
          </form>

          <div className="auth-demo-divider">hoặc</div>

          <button
            type="button"
            className="btn btn-outline"
            style={{ width: '100%' }}
            onClick={handleDemoLogin}
          >
            Dùng thử với tài khoản Minh Anh
          </button>
        </div>
      </div>
    </div>
  );
}
