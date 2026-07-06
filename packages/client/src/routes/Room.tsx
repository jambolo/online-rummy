import { useState } from 'react';
import { useAppStore } from '../store';
import Hand from '../components/Hand';
import Table from '../components/Table';
import MeldZone from '../components/MeldZone';
import ActionBar from '../components/ActionBar';
import Chat from '../components/Chat';
import HowToPlayModal from '../components/HowToPlayModal';
import { HouseRuleChip } from '../components/HouseRuleSummary';
import ConnectionBanner from '../components/ConnectionBanner';
import DisconnectWarningModal from '../components/DisconnectWarningModal';
import OpponentStrip from '../components/OpponentStrip';
import LeaveButton from '../components/LeaveButton';
import SoundToggle from '../components/SoundToggle';
import ScoreOverlay from '../components/ScoreOverlay';
import Lobby from './Lobby';
import { t } from '../theme/tokens';
import { variationAccent, variationLabel } from '../theme/variations';
import { useBreakpoint } from '../theme/useBreakpoint';

export default function Room() {
  const publicState = useAppStore((s) => s.publicState);
  const variant = useAppStore((s) => s.variant);
  const lastError = useAppStore((s) => s.lastError);
  const dismissError = useAppStore((s) => s.dismissError);
  const [showHelp, setShowHelp] = useState(false);
  const isMobile = useBreakpoint() === 'mobile';

  const helpVariant = publicState?.variant ?? variant;

  // No publicState yet → still in lobby
  if (!publicState)
    return (
      <>
        <ConnectionBanner />
        <Lobby onShowHelp={() => setShowHelp(true)} />
        {showHelp && helpVariant && <HowToPlayModal variant={helpVariant} onClose={() => setShowHelp(false)} />}
        <DisconnectWarningModal />
      </>
    );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        padding: 12,
        gap: 10,
        overflow: 'hidden',
      }}
    >
      {showHelp && helpVariant && <HowToPlayModal variant={helpVariant} onClose={() => setShowHelp(false)} />}
      <ConnectionBanner />
      <DisconnectWarningModal />
      <ScoreOverlay />

      {/* Error banner */}
      {lastError && (
        <div
          style={{
            background: 'rgba(174,42,26,0.8)', // NS-1 one-off: btn-danger at 80%
            borderRadius: t.radiusControl,
            padding: '8px 12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          <span>{lastError}</span>
          <button onClick={dismissError} style={{ background: 'transparent', padding: '2px 8px', fontSize: 16 }}>
            ×
          </button>
        </div>
      )}

      {/* Header row: logo + opponents + How to Play */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <img src="/rum-runner-logo.png" alt="Rum Runner" style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }} />
        {/* NS-7: game-variation identity chip (friendly label + accent). */}
        <span
          style={{
            alignSelf: 'center',
            flexShrink: 0,
            fontSize: 12,
            fontWeight: 'bold',
            color: variationAccent(publicState.variant),
            border: `1px solid ${variationAccent(publicState.variant)}`,
            borderRadius: t.radiusChip,
            padding: '3px 8px',
          }}
        >
          {variationLabel(publicState.variant)}
        </span>
        <HouseRuleChip variant={publicState.variant} houseRules={publicState.houseRules} />
        <div style={{ flex: 1 }}>
          <OpponentStrip />
        </div>
        <SoundToggle />
        <button
          onClick={() => setShowHelp(true)}
          style={{
            background: 'transparent',
            border: `1px solid ${t.borderModal}`,
            color: t.text60,
            fontSize: 12,
            padding: '4px 10px',
            borderRadius: 5, // NS-1 one-off: between chip(4) and control(6)
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          How to Play
        </button>
        <LeaveButton />
      </div>

      {/* Main area. On mobile Chat becomes a bottom-sheet drawer (out of flow); the
          table column takes full width. [E6] desktop row layout unchanged at >900. */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: 10,
          minHeight: 0,
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            overflow: 'auto',
            minWidth: 0,
          }}
        >
          <Table />
          <MeldZone />
        </div>
        <Chat />
      </div>

      {/* Bottom: action bar + hand */}
      <div style={{ flexShrink: 0 }}>
        <ActionBar />
        <Hand />
      </div>
    </div>
  );
}
