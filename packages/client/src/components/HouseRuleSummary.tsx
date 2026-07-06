import { useState } from 'react';
import type { HouseRuleDef, HouseRules, HouseRuleValue, Variant } from '@online-rummy/shared';
import { HOUSE_RULE_DEFS } from '@online-rummy/shared';
import Modal from './Modal';
import { t } from '../theme/tokens';
import { variationLabel } from '../theme/variations';

// Deviation = configured value present and !== registry canonical. Diffs the
// full registry so newly registered house rules surface with no per-rule UI work.
export function deviations(variant: Variant, houseRules: HouseRules): HouseRuleDef[] {
  return HOUSE_RULE_DEFS[variant].filter((def) => {
    const v = houseRules[def.id];
    return v !== undefined && v !== def.canonical;
  });
}

function fmt(v: HouseRuleValue | undefined): string {
  if (v === true) return 'On';
  if (v === false) return 'Off';
  return String(v);
}

export default function HouseRuleSummary({ variant, houseRules }: { variant: Variant; houseRules: HouseRules }) {
  const devs = deviations(variant, houseRules);
  if (devs.length === 0) {
    return <div style={{ fontSize: 13, color: t.text50 }}>Canonical rules — no deviations.</div>;
  }
  return (
    <div>
      <div style={{ fontSize: 12, color: t.text60, marginBottom: 6 }}>
        These rules deviate from canonical {variationLabel(variant)}:
      </div>
      {devs.map((def) => (
        <div
          key={def.id}
          style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 13, padding: '3px 0', flexWrap: 'wrap' }}
        >
          <span>{def.label}</span>
          {houseRules[def.id] !== true && <span style={{ fontWeight: t.weightBold }}>— {fmt(houseRules[def.id])}</span>}
          <span title={def.description} aria-label={def.description} style={{ color: t.text50, cursor: 'help' }}>
            ⓘ
          </span>
        </div>
      ))}
    </div>
  );
}

// Compact game-header chip; opens the summary in a modal popover (z = modal
// token via Modal's default). Muted without count when fully canonical.
export function HouseRuleChip({ variant, houseRules }: { variant: Variant; houseRules: HouseRules }) {
  const [open, setOpen] = useState(false);
  const count = deviations(variant, houseRules).length;
  const accent = count > 0 ? t.accentAttention : t.text50;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          alignSelf: 'center',
          flexShrink: 0,
          fontSize: 12,
          background: 'transparent',
          color: accent,
          border: `1px solid ${accent}`,
          borderRadius: t.radiusChip,
          padding: '3px 8px',
          cursor: 'pointer',
        }}
      >
        ⚖ House rules{count > 0 ? ` · ${count}` : ''}
      </button>
      {open && (
        <Modal
          titleId="house-rule-summary-title"
          onClose={() => setOpen(false)}
          panelStyle={{
            background: t.surfaceModalGreen,
            padding: 24,
            width: 340,
            maxWidth: 'calc(100vw - 32px)',
          }}
        >
          <h2 id="house-rule-summary-title" style={{ fontSize: 16, marginTop: 0, marginBottom: 12 }}>
            House rules — {variationLabel(variant)}
          </h2>
          <HouseRuleSummary variant={variant} houseRules={houseRules} />
        </Modal>
      )}
    </>
  );
}
