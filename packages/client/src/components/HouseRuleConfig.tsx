import { useState } from 'react';
import type { HouseRules, Variant } from '@online-rummy/shared';
import { canonicalHouseRules, isDeviation, supportedDefs } from '@online-rummy/shared';
import { t, sectionLabel } from '../theme/tokens';

interface Props {
  variant: Variant;
  value: HouseRules;
  onChange: (hr: HouseRules) => void;
  // true = collapsed "House rules" disclosure (Home create form);
  // false = always-open labelled panel (Lobby host editor).
  collapsible?: boolean;
}

// Amber text chip marking a non-canonical row: text + color, never color alone.
function DeviationChip() {
  return (
    <span
      style={{
        fontSize: 10,
        color: t.accentAttention,
        border: `1px solid ${t.accentAttention}`,
        borderRadius: t.radiusChip,
        padding: '1px 6px',
        flexShrink: 0,
      }}
    >
      house rule
    </span>
  );
}

export default function HouseRuleConfig({ variant, value, onChange, collapsible = false }: Props) {
  const [open, setOpen] = useState(!collapsible);
  const defs = supportedDefs(variant); // only engine-honored house rules render
  const deviationCount = defs.filter((d) => isDeviation(variant, d.id, value[d.id] ?? d.canonical)).length;

  const body =
    defs.length === 0 ? (
      <div style={{ fontStyle: 'italic', color: t.text50, fontSize: 13 }}>
        No house rules for this game variation — canonical rules apply.
      </div>
    ) : (
      <div>
        {defs.map((def) => {
          const current = value[def.id] ?? def.canonical; // canonical from registry
          const deviates = isDeviation(variant, def.id, current);
          if (def.kind === 'choice') {
            return (
              <div key={def.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13 }}>
                <span style={{ flex: 1 }}>{def.label}</span>
                <span title={def.description} aria-label={def.description} style={{ color: t.text50, cursor: 'help' }}>
                  ⓘ
                </span>
                {(def.choices ?? []).map((choice) => (
                  <button
                    key={String(choice.value)}
                    type="button"
                    onClick={() => onChange({ ...value, [def.id]: choice.value })}
                    style={{
                      fontSize: 11,
                      padding: '3px 8px',
                      borderRadius: t.radiusChip,
                      border: `1px solid ${current === choice.value ? t.accentAttention : t.borderModal}`,
                      background: 'transparent',
                      color: current === choice.value ? t.accentAttention : t.text60,
                      cursor: 'pointer',
                    }}
                  >
                    {choice.label}
                    {choice.value === def.canonical ? ' (standard)' : ''}
                  </button>
                ))}
                {deviates && <DeviationChip />}
              </div>
            );
          }
          return (
            <label
              key={def.id}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13, cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={current === true}
                onChange={(e) => onChange({ ...value, [def.id]: e.target.checked })}
              />
              <span style={{ flex: 1 }}>{def.label}</span>
              <span title={def.description} aria-label={def.description} style={{ color: t.text50, cursor: 'help' }}>
                ⓘ
              </span>
              {deviates && <DeviationChip />}
            </label>
          );
        })}
        <button
          type="button"
          onClick={() => onChange(canonicalHouseRules(variant))}
          style={{
            background: 'transparent',
            border: 'none',
            color: t.text60,
            fontSize: 12,
            textDecoration: 'underline',
            cursor: 'pointer',
            padding: 0,
            marginTop: 6,
          }}
        >
          Reset to canonical
        </button>
      </div>
    );

  if (!collapsible) {
    return (
      <div>
        <div style={{ ...sectionLabel, marginBottom: 4 }}>House rules</div>
        {body}
      </div>
    );
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{
          ...sectionLabel,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span aria-hidden>{open ? '▾' : '▸'}</span>
        House rules{deviationCount > 0 ? ` · ${deviationCount}` : ''}
      </button>
      {open && <div style={{ marginTop: 6 }}>{body}</div>}
    </div>
  );
}
