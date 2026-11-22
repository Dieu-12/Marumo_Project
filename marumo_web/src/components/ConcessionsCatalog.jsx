import { useCallback, useState } from 'react';
import { formatCurrency } from '../utils/bookingLogic.js';

const LOAD_ERROR = 'Không thể tải thực đơn bắp và nước.';

function parseCards(rows, idKey, priceKey, getName, getDescription) {
  if (!Array.isArray(rows)) throw new Error(LOAD_ERROR);
  return rows.map((row) => {
    const id = row?.[idKey];
    const price = row?.[priceKey];
    if (typeof id !== 'string' || !/^[1-9][0-9]{0,18}$/.test(id) || !Number.isFinite(price) || price < 0) {
      throw new Error(LOAD_ERROR);
    }
    return { id, price, name: getName(row), description: getDescription(row) };
  });
}

function requiredText(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(LOAD_ERROR);
  return value;
}

function optionalText(value) {
  if (value === null) return '';
  if (typeof value !== 'string') throw new Error(LOAD_ERROR);
  return value.trim();
}

function parseCatalog(body) {
  return {
    items: parseCards(body?.items, 'branchProductId', 'sellingPrice',
      (row) => requiredText(row.productName), (row) => requiredText(row.variantName)),
    combos: parseCards(body?.combos, 'comboId', 'comboPrice',
      (row) => requiredText(row.comboName), (row) => optionalText(row.description)),
  };
}

function CatalogGroup({ title, entries }) {
  if (entries.length === 0) return null;
  return (
    <section>
      <h3 className="concessions-heading">{title}</h3>
      <ul className="concessions-list">
        {entries.map(({ id, name, description, price }) => (
          <li key={id} className="concession-item">
            <div>
              <h4 className="concession-name">{name}</h4>
              {description && <p className="concession-desc">{description}</p>}
            </div>
            <div className="concession-bottom concession-price">{formatCurrency(price)}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function ConcessionsCatalog({ showtimeId }) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const current = result?.attempt === attempt ? result : null;

  const loadCatalog = useCallback((node) => {
    if (!node) return undefined;
    const controller = new AbortController();
    const { signal } = controller;
    fetch(`/bookings/showtimes/${encodeURIComponent(showtimeId)}/fnb`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(response.status === 401
            ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
            : LOAD_ERROR);
        }
        try {
          return parseCatalog(await response.json());
        } catch {
          throw new Error(LOAD_ERROR);
        }
      })
      .then((catalog) => {
        if (!signal.aborted) setResult({ attempt, status: 'ready', catalog });
      })
      .catch((error) => {
        if (!signal.aborted) {
          const message = error instanceof TypeError ? LOAD_ERROR : error.message;
          setResult({ attempt, status: 'error', message });
        }
      });
    return () => controller.abort();
  }, [showtimeId, attempt]);

  return (
    <div ref={loadCatalog} className="booking-block">
      <h2 className="booking-block-title">Bắp và nước</h2>
      <p className="booking-step-hint">Thực đơn chỉ để tham khảo. Bạn chưa thể thêm món vào đơn vé.</p>
      {!current && <p role="status">Đang tải thực đơn…</p>}
      {current?.status === 'error' && (
        <div>
          <p role="alert">{current.message}</p>
          <button type="button" className="btn btn-outline" onClick={() => setAttempt(attempt + 1)}>Thử lại</button>
        </div>
      )}
      {current?.status === 'ready' && (
        current.catalog.items.length === 0 && current.catalog.combos.length === 0 ? (
          <p role="status">Rạp này chưa có món hoặc combo đang bán.</p>
        ) : (
          <div className="concessions-menu">
            <CatalogGroup title="Món lẻ" entries={current.catalog.items} />
            <CatalogGroup title="Combo" entries={current.catalog.combos} />
          </div>
        )
      )}
    </div>
  );
}
