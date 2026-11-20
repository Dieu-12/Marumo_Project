import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, CheckCircle2, Copy } from 'lucide-react';
import { PROMOTIONS } from '../data/cinemaData.js';
import { useApp } from '../context/AppContext.jsx';
import './PromotionsSection.css';

export default function PromotionsSection() {
  const { user, openAuthPage } = useApp();
  const [copiedCode, setCopiedCode] = useState('');

  const handleCopyCode = (code) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(() => setCopiedCode(code)).catch(() => setCopiedCode(''));
    } else {
      setCopiedCode(code);
    }
    window.setTimeout(() => {
      setCopiedCode((previous) => (previous === code ? '' : previous));
    }, 2000);
  };

  return (
    <section className="section" aria-labelledby="promotions-heading">
      <div className="container">
        <div className="section-header">
          <div>
            <div className="section-heading-group">
              <span className="section-accent-bar" aria-hidden="true" />
              <h2 id="promotions-heading" className="section-title">Ưu đãi &amp; MARUMO Club</h2>
            </div>
            <p className="section-subtitle">
              Quyền lợi thành viên, vé ưu đãi và các món ăn nhẹ tại rạp.
            </p>
          </div>

          <Link to="/promotions" className="btn btn-outline btn-sm">
            Xem tất cả ưu đãi
          </Link>
        </div>

        <div className="promotions-grid">
          <div className="membership-spotlight">
            <div>
              <h3 className="membership-title">Tích điểm từ mỗi vé xem phim</h3>
              <p className="membership-desc">
                Tham gia MARUMO Club để xem các ưu đãi thành viên và quản lý quyền lợi của bạn.
              </p>

              <ul className="membership-perks">
                <li className="membership-perk-item">
                  <CheckCircle2 size={17} className="membership-perk-icon" aria-hidden="true" />
                  <span>Điểm thưởng theo giao dịch</span>
                </li>
                <li className="membership-perk-item">
                  <CheckCircle2 size={17} className="membership-perk-icon" aria-hidden="true" />
                  <span>Ưu đãi thành viên được cập nhật tại mục khuyến mãi</span>
                </li>
                <li className="membership-perk-item">
                  <CheckCircle2 size={17} className="membership-perk-icon" aria-hidden="true" />
                  <span>Vé điện tử lưu trong tài khoản</span>
                </li>
              </ul>
            </div>

            <div className="membership-actions">
              {user ? (
                <Link to="/membership" className="btn btn-primary">Xem thẻ thành viên</Link>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => openAuthPage('register')}
                >
                  Tham gia MARUMO Club
                </button>
              )}
              <Link to="/membership" className="btn btn-outline">Tìm hiểu hội viên</Link>
            </div>
          </div>

          <div className="promo-stack">
            {PROMOTIONS.map((promo) => (
              <article key={promo.id} className="promo-row-card">
                <div className="promo-row-media">
                  <img
                    src={promo.image}
                    alt={promo.title}
                    className="promo-row-img"
                    referrerPolicy="no-referrer"
                  />
                </div>

                <div className="promo-row-body">
                  <div>
                    <div className="promo-row-code">{promo.discountText}</div>
                    <h3 className="promo-row-title">{promo.title}</h3>
                    <p className="promo-row-subtitle">{promo.subtitle}</p>
                  </div>

                  <div className="promo-row-footer">
                    <span className="promo-valid-text">{promo.validUntil}</span>
                    <button
                      type="button"
                      className="promo-copy-btn"
                      onClick={() => handleCopyCode(promo.code)}
                      aria-label={`Sao chép mã ưu đãi ${promo.code}`}
                      aria-live="polite"
                    >
                      {copiedCode === promo.code ? (
                        <>
                          <Check size={16} aria-hidden="true" />
                          <span>Đã sao chép</span>
                        </>
                      ) : (
                        <>
                          <Copy size={16} aria-hidden="true" />
                          <span>{promo.code}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
