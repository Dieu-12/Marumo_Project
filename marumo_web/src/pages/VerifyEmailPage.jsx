import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, MailWarning } from 'lucide-react';
import { authApi } from '../utils/authApi.js';
import './VerifyEmailPage.css';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';
  const verifiedFlag = searchParams.get('verified') === '1';
  const [phase, setPhase] = useState(token ? 'verifying' : verifiedFlag ? 'verified' : 'missing');
  const [error, setError] = useState('');
  const startedToken = useRef('');

  const verifyNow = async () => {
    try {
      const result = await authApi.verifyEmail({ token });
      if (!result.ok) {
        setError(result.error);
        setPhase('failed');
        return;
      }
      setPhase('verified');
      navigate('/xac-thuc-email?verified=1', { replace: true });
    } catch {
      setError('Không thể kết nối máy chủ. Vui lòng thử lại sau.');
      setPhase('failed');
    }
  };

  const bindCard = (node) => {
    if (!node || startedToken.current === token) return;
    startedToken.current = token;
    verifyNow();
  };

  return (
    <main className="verify-page" data-testid="verify-page">
      <section className="verify-card" aria-labelledby="verify-title" ref={token ? bindCard : undefined}>
        {(phase === 'missing' || phase === 'verifying') && (
          <>
            <MailWarning size={40} aria-hidden="true" className="verify-icon" />
            <h1 id="verify-title" className="verify-title">
              {phase === 'missing' ? 'Thiếu mã xác thực' : 'Đang xác thực email...'}
            </h1>
            <p className="verify-text" data-testid={phase === 'missing' ? 'verify-missing' : 'verify-pending'}>
              {phase === 'missing'
                ? 'Liên kết xác thực không có mã. Hãy mở lại đường dẫn trong email xác thực.'
                : 'Hệ thống đang xử lý mã từ liên kết. Vui lòng chờ một giây.'}
            </p>
            {phase === 'missing' && (
              <Link className="btn btn-primary verify-action" to="/dang-nhap">
                Đến trang đăng nhập
              </Link>
            )}
          </>
        )}
        {phase === 'verified' && (
          <>
            <CheckCircle2 size={40} aria-hidden="true" className="verify-icon is-success" />
            <h1 id="verify-title" className="verify-title" data-testid="verify-success">
              Email đã được xác thực
            </h1>
            <p className="verify-text">Tài khoản đã kích hoạt. Bạn có thể đăng nhập ngay.</p>
            <Link className="btn btn-primary verify-action" to="/dang-nhap" data-testid="verify-login-link">
              Đăng nhập
            </Link>
          </>
        )}
        {phase === 'failed' && (
          <>
            <MailWarning size={40} aria-hidden="true" className="verify-icon" />
            <h1 id="verify-title" className="verify-title">Xác thực chưa thành công</h1>
            <p className="verify-text">{error || 'Liên kết xác thực không còn hiệu lực.'}</p>
            <p className="verify-text">
              Liên kết hết hạn hoặc đã dùng? Đăng nhập và yêu cầu gửi lại email xác thực.
            </p>
            <Link className="btn btn-primary verify-action" to="/dang-nhap">
              Đến trang đăng nhập
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
