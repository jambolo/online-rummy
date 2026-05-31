import { useRef, useEffect, useState } from "react";
import { useAppStore } from "../store";
import { t, sectionLabel } from "../theme/tokens";

export default function Chat() {
  const chatMessages = useAppStore((s) => s.chatMessages);
  const send = useAppStore((s) => s.send);
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    send({ t: "chat", text: trimmed });
    setText("");
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 220,
        background: t.surfacePanelMuted, // NS-1 one-off: was 0.25; normalized to surfacePanelMuted (0.2)
        borderRadius: t.radiusPanel,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <div style={{ ...sectionLabel, padding: "8px 10px 4px" }}>
        Chat
      </div>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "4px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          minHeight: 0,
        }}
      >
        {chatMessages.length === 0 && (
          <span style={{ color: t.text30, fontSize: 12 }}>
            No messages yet
          </span>
        )}
        {chatMessages.map((msg, i) => (
          <div key={i} style={{ fontSize: 12, wordBreak: "break-word" }}>
            <span style={{ color: t.accentSelf, fontWeight: "bold" }}>
              {msg.from}:
            </span>{" "}
            <span style={{ color: t.text85 }}>{msg.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form
        onSubmit={submit}
        style={{ display: "flex", borderTop: "1px solid rgba(255,255,255,0.1)" }} // NS-1 one-off: subtle separator
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Say something…"
          maxLength={200}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            color: t.text100,
            padding: "8px 10px",
            outline: "none",
            fontSize: 12,
          }}
        />
        <button
          type="submit"
          disabled={!text.trim()}
          style={{
            borderRadius: 0,
            padding: "8px 12px",
            background: "rgba(255,255,255,0.08)", // NS-1 one-off: send button bg
            fontSize: 12,
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
