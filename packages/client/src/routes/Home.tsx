import { useState } from 'react';
import type { Variant } from '@online-rummy/shared';
import { useAppStore } from '../store';
import { t } from '../theme/tokens';
import { variationLabel } from '../theme/variations';
import { copy } from '../content/copy';

const VARIANTS: Variant[] = ['basic', 'gin', 'rum500'];

export default function Home() {
  const connected = useAppStore((s) => s.connected);
  const send = useAppStore((s) => s.send);
  const lastError = useAppStore((s) => s.lastError);
  const dismissError = useAppStore((s) => s.dismissError);
  const notice = useAppStore((s) => s.notice);
  const dismissNotice = useAppStore((s) => s.dismissNotice);

  const [name, setName] = useState(() => sessionStorage.getItem('playerName') ?? localStorage.getItem('playerName') ?? '');
  const [variant, setVariant] = useState<Variant>('basic');
  const [joinCode, setJoinCode] = useState('');
  const [mode, setMode] = useState<'create' | 'join'>('create');

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n || !connected) return;
    sessionStorage.setItem('playerName', n);
    localStorage.setItem('playerName', n);
    send({ t: 'create', variant, name: n });
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    const code = joinCode.trim().toUpperCase();
    if (!n || !code || !connected) return;
    sessionStorage.setItem('playerName', n);
    localStorage.setItem('playerName', n);
    send({ t: 'join', roomCode: code, name: n });
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* NS-2 / T-GAP-1: art-directed banner — fluid height, top-anchored crop keeps the
          RR wordmark in frame, and a bottom gradient dissolves the image into the felt. */}
      <div style={{ position: 'relative', width: '100%', flexShrink: 0 }}>
        <img
          src="/rum-runner-banner.png"
          alt="Rum Runner: The Ultimate Rummy Club"
          style={{
            width: '100%',
            display: 'block',
            height: 'clamp(120px, 24vw, 200px)',
            objectFit: 'cover',
            objectPosition: 'center 28%',
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            // Fade the lower edge into the deep-emerald felt for a seamless join.
            background: `linear-gradient(to bottom, transparent 55%, ${t.feltBase} 100%)`,
            pointerEvents: 'none',
          }}
        />
      </div>
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 16px',
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
            style={{ width: 96, height: 96, display: 'block', margin: '0 auto 20px', borderRadius: '50%' }}
          />

          {!connected && (
            <div
              style={{
                background: 'rgba(174,42,26,0.3)', // NS-1 one-off: btn-danger at 30%
                border: '1px solid rgba(174,42,26,0.6)', // NS-1 one-off: btn-danger at 60%
                borderRadius: t.radiusControl,
                padding: '8px 12px',
                marginBottom: 16,
                fontSize: 13,
              }}
            >
              {copy.home.connecting}
            </div>
          )}

          {notice && (
            <div
              style={{
                background: 'rgba(40,90,160,0.35)', // NS-1 one-off: info-banner bg (no token)
                border: '1px solid rgba(80,140,220,0.6)', // NS-1 one-off: info-banner border
                borderRadius: t.radiusControl,
                padding: '8px 12px',
                marginBottom: 16,
                fontSize: 13,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>{notice}</span>
              <button onClick={dismissNotice} style={{ background: 'transparent', padding: '0 6px', fontSize: 16 }}>
                ×
              </button>
            </div>
          )}

          {lastError && (
            <div
              style={{
                background: 'rgba(174,42,26,0.8)', // NS-1 one-off: btn-danger at 80%
                borderRadius: t.radiusControl,
                padding: '8px 12px',
                marginBottom: 16,
                fontSize: 13,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>{lastError}</span>
              <button onClick={dismissError} style={{ background: 'transparent', padding: '0 6px', fontSize: 16 }}>
                ×
              </button>
            </div>
          )}

          {/* Name */}
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>{copy.home.nameLabel}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={copy.home.namePlaceholder}
            maxLength={20}
            style={{ width: '100%', marginBottom: 16 }}
          />

          {/* Tab */}
          <div style={{ display: 'flex', marginBottom: 16, gap: 0 }}>
            {(['create', 'join'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  flex: 1,
                  borderRadius:
                    m === 'create' ? `${t.radiusChip}px 0 0 ${t.radiusChip}px` : `0 ${t.radiusChip}px ${t.radiusChip}px 0`,
                  background: mode === m ? t.borderModal : 'rgba(255,255,255,0.05)', // NS-1 one-off: tab inactive
                  border: `1px solid ${t.borderModal}`,
                  color: t.text100,
                  fontSize: 13,
                }}
              >
                {m === 'create' ? copy.home.createTab : copy.home.joinTab}
              </button>
            ))}
          </div>

          {mode === 'create' && (
            <form onSubmit={handleCreate}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>{copy.home.variationLabel}</label>
              <select
                value={variant}
                onChange={(e) => setVariant(e.target.value as Variant)}
                style={{ width: '100%', marginBottom: 16 }}
              >
                {VARIANTS.map((v) => (
                  <option key={v} value={v}>
                    {variationLabel(v)}
                  </option>
                ))}
              </select>
              <button type="submit" className="primary" disabled={!name.trim() || !connected} style={{ width: '100%' }}>
                {copy.home.createCta}
              </button>
            </form>
          )}

          {mode === 'join' && (
            <form onSubmit={handleJoin}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>{copy.home.codeLabel}</label>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder={copy.home.codePlaceholder}
                maxLength={5}
                style={{ width: '100%', marginBottom: 16, textTransform: 'uppercase' }}
              />
              <button
                type="submit"
                className="primary"
                disabled={!name.trim() || joinCode.trim().length !== 5 || !connected}
                style={{ width: '100%' }}
              >
                {copy.home.joinCta}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
