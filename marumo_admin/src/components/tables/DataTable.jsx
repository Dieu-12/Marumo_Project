import { useCallback, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Search,
  X,
} from 'lucide-react';
import { paginateRecords, sortRecords } from '../../utils/analytics.js';
import { Button } from '../common/Button.jsx';
import { EmptyState } from '../common/EmptyState.jsx';
import { TableSkeleton } from '../common/TableSkeleton.jsx';
import './DataTable.css';

function TablePagination({ data, pageSize, children }) {
  const [page, setPage] = useState(1);
  const paged = useMemo(() => paginateRecords(data, page, pageSize), [data, page, pageSize]);
  return children({ paged, setPage });
}

export function DataTable({
  columns,
  data,
  rowKey = 'id',
  searchQuery = '',
  onSearchChange,
  searchPlaceholder = 'Search records...',
  filters = null,
  pageSize = 6,
  isLoading = false,
  errorMessage = '',
  onRetry,
  emptyTitle = 'No matching records',
  emptyDescription = 'Try adjusting your search or filter criteria, or create a new record.',
  emptyAction = null,
  renderActions,
  toolbarExtra = null,
}) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [openMenuId, setOpenMenuId] = useState(null);
  const attachTable = useCallback((node) => {
    const handleDocClick = (e) => {
      if (!node.contains(e.target)) {
        setOpenMenuId(null);
      }
    };
    node.ownerDocument.addEventListener('mousedown', handleDocClick);
    return () => node.ownerDocument.removeEventListener('mousedown', handleDocClick);
  }, []);

  const sorted = useMemo(
    () => sortRecords(data, sortKey, sortDir),
    [data, sortKey, sortDir]
  );

  const handleSort = (colKey) => {
    if (sortKey === colKey) setSortDir((previous) => previous === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(colKey);
      setSortDir('asc');
    }
  };

  return (
    <div className="data-table-card" ref={attachTable}>
      <div className="data-table-toolbar">
        {onSearchChange ? (
          <div className="data-table-search-wrap">
            <Search size={15} className="data-table-search-icon" aria-hidden="true" />
            <input
              type="text"
              className="data-table-search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
            />
            {searchQuery ? (
              <button
                type="button"
                className="data-table-clear-search"
                onClick={() => onSearchChange('')}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="data-table-filters">
          {filters}
          {toolbarExtra}
        </div>
      </div>

      <TablePagination key={JSON.stringify([searchQuery, data.length])} data={sorted} pageSize={pageSize}>
      {({ paged, setPage }) => isLoading ? (
        <TableSkeleton rows={Math.min(pageSize, 6)} />
      ) : errorMessage ? (
        <div className="data-table-error">
          <div className="data-table-error-title">Unable to load records</div>
          <p className="data-table-error-text">{errorMessage}</p>
          {onRetry ? (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
        </div>
      ) : paged.totalItems === 0 ? (
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
        />
      ) : (
        <>
          <div className="data-table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  {columns.map((col) => {
                    const isSorted = sortKey === col.sortKey;
                    const alignClass = col.align === 'right' ? 'is-right' : '';
                    return (
                      <th
                        key={col.key}
                        className={alignClass}
                        style={col.width ? { width: col.width } : undefined}
                      >
                        {col.sortable && col.sortKey ? (
                          <button
                            type="button"
                            className="data-table-sort-btn"
                            onClick={() => handleSort(col.sortKey)}
                          >
                            <span>{col.label}</span>
                            {isSorted ? (
                              sortDir === 'asc' ? (
                                <ArrowUp size={13} aria-hidden="true" />
                              ) : (
                                <ArrowDown size={13} aria-hidden="true" />
                              )
                            ) : (
                              <ArrowUpDown size={13} opacity={0.45} aria-hidden="true" />
                            )}
                          </button>
                        ) : (
                          col.label
                        )}
                      </th>
                    );
                  })}
                  {renderActions ? (
                    <th className="is-right" style={{ width: '80px' }}>
                      Actions
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {paged.items.map((row, rowIdx) => {
                  const id = row[rowKey];
                  const actions = renderActions ? renderActions(row) : [];
                  const openUpward = paged.items.length >= 3 && rowIdx >= paged.items.length - 2;
                  return (
                    <tr key={id}>
                      {columns.map((col) => {
                        const alignClass = col.align === 'right' ? 'is-right' : '';
                        return (
                          <td key={col.key} className={alignClass}>
                            {col.render ? col.render(row) : row[col.key]}
                          </td>
                        );
                      })}
                      {renderActions ? (
                        <td className="is-right">
                          <div className="row-actions-cell">
                            <button
                              type="button"
                              className="btn-icon"
                              aria-label={`Actions for ${row.name || row.title || row.reference || id}`}
                              aria-expanded={openMenuId === id}
                              onClick={() =>
                                setOpenMenuId((prev) => (prev === id ? null : id))
                              }
                            >
                              <MoreVertical size={16} />
                            </button>
                            {openMenuId === id && actions.length > 0 ? (
                              <div
                                className={`row-action-menu ${openUpward ? 'row-action-menu--up' : ''}`.trim()}
                                role="menu"
                              >
                                {actions.map((act) => {
                                  const Icon = act.icon;
                                  return (
                                    <button
                                      key={act.label}
                                      type="button"
                                      role="menuitem"
                                      className={`row-action-item ${act.danger ? 'row-action-item--danger' : ''}`.trim()}
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        act.onClick(row);
                                      }}
                                    >
                                      {Icon ? <Icon size={14} aria-hidden="true" /> : null}
                                      <span>{act.label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="data-table-footer">
            <div className="data-table-count tabular-nums">
              Showing {paged.startIndex}–{paged.endIndex} of {paged.totalItems} records
            </div>
            <div className="data-table-pagination">
              <button
                type="button"
                className="page-btn"
                disabled={paged.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft size={15} />
              </button>
              {Array.from({ length: paged.totalPages }).map((_, idx) => {
                const pageNum = idx + 1;
                return (
                  <button
                    key={pageNum}
                    type="button"
                    className={`page-btn tabular-nums ${paged.page === pageNum ? 'page-btn--active' : ''}`.trim()}
                    onClick={() => setPage(pageNum)}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                type="button"
                className="page-btn"
                disabled={paged.page >= paged.totalPages}
                onClick={() => setPage((p) => Math.min(paged.totalPages, p + 1))}
                aria-label="Next page"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </>
      )}
      </TablePagination>
    </div>
  );
}
