import { formatCurrency } from '../utils/bookingLogic.js';

const LOAD_ERROR = 'Không thể tải thực đơn bắp và nước.';
const MAX_FNB_LINES = 10;

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

export function parseFnbCatalog(body) {
  return {
    items: parseCards(body?.items, 'branchProductId', 'sellingPrice',
      (row) => requiredText(row.productName), (row) => requiredText(row.variantName)),
    combos: parseCards(body?.combos, 'comboId', 'comboPrice',
      (row) => requiredText(row.comboName), (row) => optionalText(row.description)),
  };
}

function CatalogGroup({ title, entries, selectionKey, selection, selectedLineCount, onQuantityChange }) {
  if (entries.length === 0) return null;
  return (
    <section>
      <h3 className="concessions-heading">{title}</h3>
      <ul className="concessions-list">
        {entries.map(({ id, name, description, price }) => {
          const key = `${selectionKey}:${id}`;
          const quantity = Number(selection[key] ?? 0);
          return (
            <li key={id} className="concession-item">
              <div>
                <h4 className="concession-name">{name}</h4>
                {description && <p className="concession-desc">{description}</p>}
              </div>
              <div className="concession-bottom">
                <div className="concession-qty" aria-label={`Số lượng ${name}`}>
                  <button
                    type="button"
                    className="concession-qty-btn"
                    onClick={() => onQuantityChange(key, quantity - 1)}
                    disabled={quantity === 0}
                    aria-label={`Bớt một ${name}`}
                  >
                    −
                  </button>
                  <span className="concession-qty-value tabular-nums">{quantity}</span>
                  <button
                    type="button"
                    className="concession-qty-btn"
                    onClick={() => onQuantityChange(key, quantity + 1)}
                    disabled={quantity >= 50 || (quantity === 0 && selectedLineCount >= MAX_FNB_LINES)}
                    aria-label={`Thêm một ${name}`}
                  >
                    +
                  </button>
                </div>
                <div className="concession-price">{formatCurrency(price)}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function ConcessionsCatalog({ catalogState, selection, onQuantityChange, onRetry }) {
  const current = catalogState?.status === 'ready' ? catalogState.catalog : null;
  const selectedLineCount = Object.values(selection).filter((quantity) => Number(quantity) > 0).length;
  return (
    <div className="booking-block">
      <h2 className="booking-block-title">Bắp và nước</h2>
      <p className="booking-step-hint">Chọn số lượng món muốn đặt kèm vé. Giá lấy từ hệ thống rạp.</p>
      {!current && catalogState?.status !== 'error' && <p role="status">Đang tải thực đơn…</p>}
      {catalogState?.status === 'error' && (
        <div>
          <p role="alert">{catalogState.message}</p>
          <button type="button" className="btn btn-outline" onClick={onRetry}>Thử lại</button>
        </div>
      )}
      {current && (
        current.items.length === 0 && current.combos.length === 0 ? (
          <p role="status">Rạp này chưa có món hoặc combo đang bán.</p>
        ) : (
          <div className="concessions-menu">
            <CatalogGroup
              title="Món lẻ"
              entries={current.items}
              selectionKey="p"
              selection={selection}
              selectedLineCount={selectedLineCount}
              onQuantityChange={onQuantityChange}
            />
            <CatalogGroup
              title="Combo"
              entries={current.combos}
              selectionKey="c"
              selection={selection}
              selectedLineCount={selectedLineCount}
              onQuantityChange={onQuantityChange}
            />
          </div>
        )
      )}
      {current && selectedLineCount >= MAX_FNB_LINES && (
        <p role="status">Bạn đã chọn tối đa {MAX_FNB_LINES} món hoặc combo khác nhau.</p>
      )}
    </div>
  );
}
