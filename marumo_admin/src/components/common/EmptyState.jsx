import { Inbox } from 'lucide-react';
import './EmptyState.css';

export function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <Icon size={22} aria-hidden="true" />
      </div>
      <h3 className="empty-state-title">{title}</h3>
      {description ? <p className="empty-state-description">{description}</p> : null}
      {action ? <div className="empty-state-actions">{action}</div> : null}
    </div>
  );
}
