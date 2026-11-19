import { AlertTriangle } from 'lucide-react';
import { Button } from './Button.jsx';
import { Modal } from './Modal.jsx';
import './ConfirmDialog.css';

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="confirm-dialog-content">
        <div className={`confirm-dialog-icon confirm-dialog-icon--${tone}`}>
          <AlertTriangle size={20} />
        </div>
        <p className="confirm-dialog-message">{message}</p>
      </div>
    </Modal>
  );
}
