import type { Variant } from '@online-rummy/shared';
import BasicRules from '../content/howToPlay/basic';
import Rum500Rules from '../content/howToPlay/rum500';
import GinRules from '../content/howToPlay/gin';
import Modal from './Modal';
import { t } from '../theme/tokens';
import { variationLabel } from '../theme/variations';

interface Props {
  variant: Variant;
  onClose: () => void;
}

export default function HowToPlayModal({ variant, onClose }: Props) {
  return (
    <Modal
      titleId="how-to-play-title"
      onClose={onClose}
      panelStyle={{
        background: t.surfaceModalNavy,
        padding: 28,
        width: 480,
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: '80vh',
        overflowY: 'auto',
        color: t.text100,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <h2 id="how-to-play-title" style={{ fontSize: 18, margin: 0 }}>
          How to Play — {variationLabel(variant)}
        </h2>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            fontSize: 22,
            padding: '0 6px',
            lineHeight: 1,
            color: t.text60,
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      </div>

      {variant === 'basic' && <BasicRules />}
      {variant === 'rum500' && <Rum500Rules />}
      {variant === 'gin' && <GinRules />}
    </Modal>
  );
}
