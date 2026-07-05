import { useAppStore } from '../store';
import { t } from '../theme/tokens';

// Compact opponent info strip shown above the table
export default function OpponentStrip() {
  const publicState = useAppStore((s) => s.publicState);
  const myPlayerId = useAppStore((s) => s.myPlayerId);

  if (!publicState) return null;

  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {publicState.players.map((p) => (
        <div
          key={p.id}
          style={{
            background: t.surfacePanelMuted,
            borderRadius: t.radiusControl,
            padding: '6px 12px',
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            opacity: p.status === 'forfeited' ? 0.45 : 1,
            outline: publicState.turnPlayerId === p.id ? `2px solid ${t.accentPositive}` : 'none',
          }}
        >
          <span style={{ fontWeight: 'bold', fontSize: 14 }}>{p.name}</span>
          {p.id === myPlayerId && <span style={{ fontSize: 11, color: t.accentSelf }}>you</span>}
          {/* Non-color turn cue [V7]: ▶ marker beside the green outline. */}
          {publicState.turnPlayerId === p.id && <span style={{ fontSize: 11, color: t.accentPositive }}>▶ turn</span>}
          <span style={{ fontSize: 12, color: t.text60 }}>{p.handCount} cards</span>
          <span style={{ fontSize: 12, color: t.text60 }}>{p.score}pts</span>
          {p.status === 'forfeited' && <span style={{ fontSize: 11, color: t.accentNegative }}>forfeited</span>}
        </div>
      ))}
    </div>
  );
}
