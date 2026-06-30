import { useRef, useEffect, useState } from 'react';
import { useAppStore } from '../store';
import { t, sectionLabel } from '../theme/tokens';
import { useBreakpoint } from '../theme/useBreakpoint';
import { copy } from '../content/copy';

export default function Chat() {
  const chatMessages = useAppStore((s) => s.chatMessages);
  const send = useAppStore((s) => s.send);
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const isMobile = useBreakpoint() === 'mobile';
  const [open, setOpen] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    send({ t: 'chat', text: trimmed });
    setText('');
  }

  // Shared message list + input form (identical in side panel and drawer).
  const body = (
    <>
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '4px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          minHeight: 0,
        }}
      >
        {chatMessages.length === 0 && <span style={{ color: t.text30, fontSize: 12 }}>{copy.chat.empty}</span>}
        {chatMessages.map((msg, i) => (
          <div key={i} style={{ fontSize: 12, wordBreak: 'break-word' }}>
            <span style={{ color: t.accentSelf, fontWeight: 'bold' }}>{msg.from}:</span>{' '}
            <span style={{ color: t.text85 }}>{msg.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form
        onSubmit={submit}
        style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.1)' }} // NS-1 one-off: subtle separator
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={copy.chat.placeholder}
          maxLength={200}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            color: t.text100,
            padding: '8px 10px',
            outline: 'none',
            fontSize: 12,
          }}
        />
        <button
          type="submit"
          disabled={!text.trim()}
          style={{
            borderRadius: 0,
            padding: '8px 12px',
            background: 'rgba(255,255,255,0.08)', // NS-1 one-off: send button bg
            fontSize: 12,
          }}
        >
          Send
        </button>
      </form>
    </>
  );

  // NS-4 mobile: collapsible bottom-sheet drawer so chat never permanently covers the table.
  if (isMobile) {
    return (
      <>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            style={{
              flexShrink: 0,
              alignSelf: 'stretch',
              background: t.surfacePanelMuted,
              borderRadius: t.radiusPanel,
              padding: '8px 12px',
              fontSize: 13,
              textAlign: 'left',
            }}
          >
            💬 {copy.chat.title}
            {chatMessages.length > 0 ? ` (${chatMessages.length})` : ''}
          </button>
        )}
        {open && (
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: t.scrim,
              zIndex: t.zModal,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                display: 'flex',
                flexDirection: 'column',
                height: '60vh',
                background: t.surfaceModalGreen,
                borderTopLeftRadius: t.radiusCard,
                borderTopRightRadius: t.radiusCard,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px 4px',
                }}
              >
                <span style={sectionLabel}>{copy.chat.title}</span>
                <button onClick={() => setOpen(false)} style={{ background: 'transparent', padding: '2px 8px', fontSize: 16 }}>
                  ×
                </button>
              </div>
              {body}
            </div>
          </div>
        )}
      </>
    );
  }

  // Desktop / tablet: fixed side panel (fluid width). [E6] >900 layout unchanged.
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: 'clamp(180px, 22vw, 220px)',
        background: t.surfacePanelMuted, // NS-1 one-off: was 0.25; normalized to surfacePanelMuted (0.2)
        borderRadius: t.radiusPanel,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <div style={{ ...sectionLabel, padding: '8px 10px 4px' }}>{copy.chat.title}</div>
      {body}
    </div>
  );
}
