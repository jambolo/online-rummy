import { useState } from 'react';
import { useAppStore } from '../store';
import ConfirmModal from './ConfirmModal';

// Leave-game button with a confirmation step. Leaving cancels the game for everyone.
export default function LeaveButton({ style }: { style?: React.CSSProperties }) {
  const leaveGame = useAppStore((s) => s.leaveGame);
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        style={{
          background: 'transparent',
          border: '1px solid rgba(255,127,127,0.4)', // NS-1 one-off: accent-negative at 40%
          color: 'rgba(255,127,127,0.85)', // NS-1 one-off: accent-negative at 85%
          fontSize: 12,
          padding: '4px 10px',
          borderRadius: 5, // NS-1 one-off: between chip(4) and control(6)
          cursor: 'pointer',
          flexShrink: 0,
          ...style,
        }}
      >
        Leave Game
      </button>
      {confirming && (
        <ConfirmModal
          message="Leave the game? This cancels the game for everyone and returns all players to the start page."
          confirmLabel="Leave Game"
          onConfirm={leaveGame}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
