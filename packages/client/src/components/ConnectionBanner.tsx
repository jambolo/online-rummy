import { useAppStore } from '../store';
import { t } from '../theme/tokens';

// Fixed banner reporting connection trouble — our own socket dropping (reconnecting /
// gave-up) or an opponent dropping within the server's mid-game grace window. Fixed so it
// sits cleanly over both the centered lobby card and the in-game layout.
export default function ConnectionBanner() {
  const connStatus = useAppStore((s) => s.connStatus);
  const opponentConn = useAppStore((s) => s.opponentConn);

  let text: string | null = null;
  let danger = false;
  let showReload = false;
  if (connStatus === 'reconnecting') {
    text = 'Connection lost — reconnecting…';
  } else if (connStatus === 'disconnected') {
    text = 'Disconnected from the server. The game may have ended.';
    danger = true;
    showReload = true;
  } else if (opponentConn) {
    text = `${opponentConn.name} disconnected — waiting for them to reconnect…`;
  }
  if (text === null) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 90, // below zScoreOverlay(100)/zModal(200) so dialogs stay on top
        maxWidth: '92vw',
        background: danger ? 'rgba(174,42,26,0.92)' : 'rgba(227,163,59,0.95)', // NS-1 one-off: btn-danger / amber accent
        color: danger ? t.text100 : '#1a1205', // NS-1 one-off: dark ink on amber for contrast
        borderRadius: t.radiusControl,
        padding: '8px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontSize: 13,
        fontWeight: 'bold',
        boxShadow: '0 2px 12px rgba(0,0,0,0.4)', // NS-1 one-off: lift banner off content
      }}
      role="status"
    >
      <span>{text}</span>
      {showReload && (
        <button
          onClick={() => window.location.reload()}
          style={{
            background: 'rgba(255,255,255,0.18)', // NS-1 one-off: inset button on danger banner
            border: '1px solid rgba(255,255,255,0.5)',
            color: t.text100,
            fontSize: 12,
            padding: '3px 10px',
            borderRadius: t.radiusControl,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          Reload
        </button>
      )}
    </div>
  );
}
