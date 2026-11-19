import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy } from 'lucide-react';
import { PROMOTIONS } from '../data/cinemaData.js';
import './PromotionsPage.css';

export default function PromotionsPage() {
  const [copiedId, setCopiedId] = useState('');

  const handleCopy = (promo) => {
    setCopiedId(promo.id);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(promo.code).catch(() => {});
    }
    window.setTimeout(() => {
      setCopiedId((prev) => (prev === promo.id ? '' : prev));
    }, 2000);
  };

  return (
    <main>
      <section className="page-banner">
        <div className="container">
          <h1 className="page-banner-title">Khuyến mãi và ưu đãi</h1>
          <p className="page-banner-sub">
            Sao chép mã ưu đãi và áp dụng khi thanh toán vé xem phim.
          </p>
        </div>
      </section>

      <section className="section section-light">
        <div className="container">
          <div className="promos-page-grid">
            {PROMOTIONS.map((promo) => (
              <article key={promo.id} className="promo-card">
                <div className="promo-card-media">
                  <img
                    src={promo.image}
                    alt={promo.title}
                    className="promo-card-img"
                    referrerPolicy="no-referrer"
                  />
                </div>

                <div className="promo-card-body">
                  <span className="promo-card-discount">{promo.discountText}</span>
                  <h2 className="promo-card-title">{promo.title}</h2>
                  <p className="promo-card-desc">{promo.details}</p>

                  <div className="promo-card-footer">
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => handleCopy(promo)}
                    >
                      {copiedId === promo.id ? (
                        <>
                          <Check size={14} aria-hidden="true" />
                          <span>Đã chép {promo.code}</span>
                        </>
                      ) : (
                        <>
                          <Copy size={14} aria-hidden="true" />
                          <span>Mã: {promo.code}</span>
                        </>
                      )}
                    </button>

                    <Link to="/movies?tab=all" className="btn btn-primary btn-sm">
                      Chọn phim để đặt vé
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
