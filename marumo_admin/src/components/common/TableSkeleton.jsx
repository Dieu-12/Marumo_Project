import './TableSkeleton.css';

export function TableSkeleton({ rows = 5 }) {
  return (
    <div className="table-skeleton" aria-busy="true" aria-label="Loading records">
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className="table-skeleton-row">
          <div className="skeleton-bar" style={{ width: '82%' }} />
          <div className="skeleton-bar" style={{ width: '68%' }} />
          <div className="skeleton-bar" style={{ width: '74%' }} />
          <div className="skeleton-bar" style={{ width: '58%' }} />
          <div className="skeleton-bar" style={{ width: '48%' }} />
        </div>
      ))}
    </div>
  );
}
