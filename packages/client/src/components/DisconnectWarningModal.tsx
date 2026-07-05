import { useAppStore } from '../store';
import ConfirmModal from './ConfirmModal';

// Prompt shown when another player has gone silent past the disconnect threshold.
export default function DisconnectWarningModal() {
  const warning = useAppStore((s) => s.disconnectWarning);
  const leaveGame = useAppStore((s) => s.leaveGame);
  const dismiss = useAppStore((s) => s.dismissDisconnectWarning);

  if (!warning) return null;

  return (
    <ConfirmModal
      message={`${warning.name} hasn't sent any messages in over 5 minutes and has probably disconnected. Do you want to cancel the game?`}
      confirmLabel="Cancel Game"
      cancelLabel="Keep Waiting"
      onConfirm={leaveGame}
      onCancel={dismiss}
    />
  );
}
