import type { Variant } from "@online-rummy/shared";
import BasicRules from "../content/howToPlay/basic";
import Rum500Rules from "../content/howToPlay/rum500";
import GinRules from "../content/howToPlay/gin";

interface Props {
  variant: Variant;
  onClose: () => void;
}

const TITLES: Record<Variant, string> = {
  basic: "Classic Rummy",
  gin: "Gin Rummy",
  rum500: "500 Rum",
};

export default function HowToPlayModal({ variant, onClose }: Props) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#1a2a4a",
          border: "2px solid rgba(255,255,255,0.2)",
          borderRadius: 12,
          padding: 28,
          width: 480,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "80vh",
          overflowY: "auto",
          color: "#fff",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <h2 style={{ fontSize: 18, margin: 0 }}>
            How to Play — {TITLES[variant]}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              fontSize: 22,
              padding: "0 6px",
              lineHeight: 1,
              color: "rgba(255,255,255,0.6)",
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        {variant === "basic" && <BasicRules />}
        {variant === "rum500" && <Rum500Rules />}
        {variant === "gin" && <GinRules />}
      </div>
    </div>
  );
}
