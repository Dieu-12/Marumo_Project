import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCompactCurrency, formatCurrency, formatNumber } from '../../utils/formatters.js';
import './Charts.css';

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{row.fullName || row.name}</div>
      <div className="chart-tooltip-row">
        <span>Revenue</span>
        <span className="chart-tooltip-val">{formatCurrency(row.revenue)}</span>
      </div>
      <div className="chart-tooltip-row">
        <span>Bookings</span>
        <span className="chart-tooltip-val">{formatNumber(row.bookings)}</span>
      </div>
    </div>
  );
}

export function CinemaRevenueChart({ data, height = 270 }) {
  return (
    <div className="chart-body" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 18, left: 10, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={(v) => formatCompactCurrency(v)}
            tick={{ fill: '#6B7280', fontSize: 12 }}
            axisLine={{ stroke: '#E5E7EB' }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={130}
            tick={{ fill: '#171717', fontSize: 12, fontWeight: 500 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="revenue" radius={[0, 4, 4, 0]} maxBarSize={22}>
            {data.map((entry, idx) => (
              <Cell key={entry.id} fill={idx === 0 ? '#E51B35' : '#60A5FA'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
