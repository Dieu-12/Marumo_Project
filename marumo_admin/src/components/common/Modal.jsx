import { useCallback } from 'react';
import { X } from 'lucide-react';
import './Modal.css';

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
}) {
  const attachModal = useCallback((node) => {
    const ownerWindow = node.ownerDocument.defaultView;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    ownerWindow.addEventListener('keydown', handleKey);
    return () => ownerWindow.removeEventListener('keydown', handleKey);
  }, [onClose]);

  if (!isOpen) return null;

  const sizeClass = size === 'sm' ? 'modal-panel--sm' : size === 'lg' ? 'modal-panel--lg' : '';

  return (
    <div
      className="modal-backdrop"
      ref={attachModal}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal-panel ${sizeClass}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-heading"
      >
        <div className="modal-header">
          <div>
            <h2 id="modal-heading" className="modal-title">
              {title}
            </h2>
            {subtitle ? <p className="modal-subtitle">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">{children}</div>

        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}
