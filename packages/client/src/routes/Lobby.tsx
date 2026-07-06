import { useAppStore } from '../store';
import LeaveButton from '../components/LeaveButton';
import SoundToggle from '../components/SoundToggle';
import HouseRuleConfig from '../components/HouseRuleConfig';
import HouseRuleSummary from '../components/HouseRuleSummary';
import { t, sectionLabel } from '../theme/tokens';
import { variationAccent, variationLabel } from '../theme/variations';

// Lobby waiting room
export default function Lobby({ onShowHelp }: { onShowHelp: () => void }) {
  const roomCode = useAppStore((s) => s.roomCode);
  const variant = useAppStore((s) => s.variant);
  const lobbyPlayers = useAppStore((s) => s.lobbyPlayers);
  const hostId = useAppStore((s) => s.hostId);
  const myPlayerId = useAppStore((s) => s.myPlayerId);
  const send = useAppStore((s) => s.send);
  const houseRules = useAppStore((s) => s.houseRules);
  const setHouseRules = useAppStore((s) => s.setHouseRules);

  const isHost = myPlayerId === hostId;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
      }}
    >
      <div
        style={{
          background: t.surfacePanel,
          borderRadius: t.radiusCard,
          padding: 32,
          width: 'min(360px, 92vw)',
        }}
      >
        <img
          src="/rum-runner-logo.png"
          alt="Rum Runner"
          style={{ width: 72, height: 72, display: 'block', margin: '0 auto 16px', borderRadius: '50%' }}
        />
        <h2 style={{ fontSize: 20, marginBottom: 4, textAlign: 'center' }}>Room {roomCode}</h2>
        <div
          style={{
            fontSize: 13,
            marginBottom: 20,
          }}
        >
          {variant && <span style={{ color: variationAccent(variant), fontWeight: 'bold' }}>{variationLabel(variant)}</span>}
          <span style={{ color: t.text60 }}> · share code with friends</span>
        </div>

        <div style={{ marginBottom: 20 }}>
          {lobbyPlayers.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                padding: '6px 0',
                borderBottom: '1px solid rgba(255,255,255,0.08)', // NS-1 one-off: subtle row divider
              }}
            >
              <span style={{ flex: 1 }}>{p.name}</span>
              {p.id === hostId && <span style={{ fontSize: 11, color: t.accentHost }}>host</span>}
              {p.id === myPlayerId && <span style={{ fontSize: 11, color: t.accentSelf }}>you</span>}
            </div>
          ))}
        </div>

        {variant && (
          <div style={{ marginBottom: 20 }}>
            {isHost ? (
              <HouseRuleConfig variant={variant} value={houseRules} onChange={setHouseRules} />
            ) : (
              <>
                <div style={{ ...sectionLabel, marginBottom: 4 }}>House rules</div>
                <HouseRuleSummary variant={variant} houseRules={houseRules} />
              </>
            )}
          </div>
        )}

        {isHost ? (
          <button
            className="primary"
            onClick={() => send({ t: 'start' })}
            disabled={lobbyPlayers.length < 2}
            style={{ width: '100%' }}
          >
            Start Game ({lobbyPlayers.length} players)
          </button>
        ) : (
          <div
            style={{
              textAlign: 'center',
              color: t.text50,
              fontSize: 13,
            }}
          >
            Waiting for host to start…
          </div>
        )}

        <button
          onClick={onShowHelp}
          style={{
            width: '100%',
            marginTop: 12,
            background: 'transparent',
            border: `1px solid ${t.borderModal}`,
            color: t.text60,
            fontSize: 13,
            padding: '8px 0',
            borderRadius: t.radiusControl,
            cursor: 'pointer',
          }}
        >
          How to Play
        </button>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12, gap: 8 }}>
          <SoundToggle />
          <LeaveButton style={{ width: '100%' }} />
        </div>
      </div>
    </div>
  );
}
