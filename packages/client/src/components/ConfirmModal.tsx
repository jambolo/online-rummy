import Modal from './Modal';
import { t } from '../theme/tokens';

// Styled yes/no confirmation modal (avoids the jarring native confirm dialog).
export default function ConfirmModal({
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      ariaLabel={message}
      onClose={onCancel}
      panelStyle={{
        background: t.surfaceModalGreen,
        padding: 28,
        width: 320,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 14, marginBottom: 20 }}>{message}</div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={onCancel}
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.1)', // NS-1 one-off: cancel button bg
            border: `1px solid ${t.borderModal}`,
            color: t.text100,
            padding: '8px 0',
            borderRadius: t.radiusControl,
            cursor: 'pointer',
          }}
        >
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          style={{
            flex: 1,
            background: 'rgba(174,42,26,0.85)', // NS-1 one-off: btn-danger at 85%
            border: '1px solid rgba(174,42,26,1)', // NS-1 one-off: btn-danger solid
            color: t.text100,
            padding: '8px 0',
            borderRadius: t.radiusControl,
            cursor: 'pointer',
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
