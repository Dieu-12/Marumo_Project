import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Info,
  XCircle,
} from 'lucide-react';
import './StatusBadge.css';

const STATUS_MAP = {
  Active: { tone: 'success', Icon: CheckCircle2 },
  'Now Showing': { tone: 'success', Icon: CheckCircle2 },
  Confirmed: { tone: 'info', Icon: CheckCircle2 },
  Completed: { tone: 'success', Icon: CheckCircle2 },
  Paid: { tone: 'success', Icon: CheckCircle2 },
  Scheduled: { tone: 'info', Icon: Clock },
  Upcoming: { tone: 'info', Icon: Info },
  Pending: { tone: 'warning', Icon: Clock },
  Maintenance: { tone: 'warning', Icon: AlertTriangle },
  'On Leave': { tone: 'warning', Icon: Clock },
  'Sold Out': { tone: 'warning', Icon: AlertTriangle },
  Inactive: { tone: 'neutral', Icon: Ban },
  Ended: { tone: 'neutral', Icon: Ban },
  Expired: { tone: 'neutral', Icon: Ban },
  Cancelled: { tone: 'danger', Icon: XCircle },
  Suspended: { tone: 'danger', Icon: Ban },
  Refunded: { tone: 'danger', Icon: XCircle },
};

export function StatusBadge({ status }) {
  const entry = STATUS_MAP[status] || { tone: 'neutral', Icon: Info };
  const { tone, Icon } = entry;
  return (
    <span className={`status-badge status-badge--${tone}`}>
      <Icon size={12} strokeWidth={2.2} aria-hidden="true" />
      <span>{status}</span>
    </span>
  );
}
