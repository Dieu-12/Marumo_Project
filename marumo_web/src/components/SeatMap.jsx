import { formatCurrency } from '../utils/bookingLogic.js';
import './SeatMap.css';

export default function SeatMap({ seatRows, selectedSeatIds, onToggleSeat }) {
  return (
    <div className="seat-map-card">
      <div className="seat-screen-wrap">
        <div className="seat-screen-curve" aria-hidden="true" />
        <span className="seat-screen-label">Màn hình chiếu</span>
      </div>

      <div className="seat-grid-scroll" tabIndex={0} role="region" aria-label="Sơ đồ ghế có thể cuộn ngang">
        <div className="seat-grid" role="group" aria-label="Chọn ghế trong phòng chiếu">
          {seatRows.map((rowObj) => (
            <div key={rowObj.row} className="seat-row">
              <span className="seat-row-label" aria-hidden="true">
                {rowObj.row}
              </span>

              <div className="seat-row-seats">
                {rowObj.seats.map((seat) => {
                  const isSelected = selectedSeatIds.includes(seat.id);
                  const typeLabel =
                    seat.type === 'vip'
                      ? 'VIP'
                      : seat.type === 'couple'
                        ? 'Ghế đôi'
                        : 'Ghế thường';

                  return (
                      <button
                        key={seat.id}
                        type="button"
                        disabled={seat.isOccupied}
                        aria-pressed={isSelected}
                        aria-label={`Ghế ${seat.id}, ${typeLabel}, ${formatCurrency(seat.price)}${seat.isOccupied ? ', đã có người đặt' : isSelected ? ', đang chọn' : ', còn trống'}`}
                        className={`seat-btn seat-btn--${seat.type} ${isSelected ? 'is-selected' : ''} ${seat.isOccupied ? 'is-occupied' : ''}`}
                        onClick={() => onToggleSeat(seat)}
                      >
                        {seat.id}
                      </button>
                  );
                })}
              </div>

              <span className="seat-row-label" aria-hidden="true">
                {rowObj.row}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="seat-entry-marker">
        <span aria-hidden="true">←</span>
        <span>Lối vào · phía sau bên trái</span>
      </div>

      <div className="seat-legend">
        <div className="seat-legend-item">
          <span className="seat-legend-swatch" aria-hidden="true" />
          <span>Ghế trống</span>
        </div>
        <div className="seat-legend-item">
          <span className="seat-legend-swatch seat-legend-swatch--couple" aria-hidden="true" />
          <span>Ghế đôi</span>
        </div>
        <div className="seat-legend-item">
          <span className="seat-legend-swatch seat-legend-swatch--selected" aria-hidden="true" />
          <span>Đang chọn</span>
        </div>
        <div className="seat-legend-item">
          <span className="seat-legend-swatch seat-legend-swatch--occupied" aria-hidden="true" />
          <span>Đã được đặt</span>
        </div>
      </div>
    </div>
  );
}
