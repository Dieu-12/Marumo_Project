import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatNumber } from '../../utils/formatters.js';
import './Charts.css';

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-row">
        <span>{item.name}</span>
        <span className="chart-tooltip-val">{formatNumber(item.value)} orders</span>
      </div>
    </div>
  );
}

export function BookingStatusChart({ data, height = 220 }) {
  const total = data.reduce((acc, d) => acc + d.value, 0);

  return (
    <div>
      <div className="chart-body" style={{ height, minHeight: height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={56}
              outerRadius={82}
              paddingAngle={3}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} stroke="none" />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-legend-inline">
        {data.map((entry) => {
          const pct = total > 0 ? Math.round((entry.value / total) * 100) : 0;
          return (
            <div key={entry.name} className="chart-legend-item">
              <span
                className="chart-legend-swatch"
                style={{ backgroundColor: entry.color }}
                aria-hidden="true"
              />
              <span>
                {entry.name} <strong className="tabular-nums">{entry.value}</strong> ({pct}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
