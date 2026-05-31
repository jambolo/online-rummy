import { useEffect, useState } from 'react';

// NS-4: single scalar breakpoint ([S1]-safe). Thresholds: <=640 mobile, <=900 tablet, else desktop.
export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

const MOBILE_MAX = 640;
const TABLET_MAX = 900;

function compute(width: number): Breakpoint {
  if (width <= MOBILE_MAX) return 'mobile';
  if (width <= TABLET_MAX) return 'tablet';
  return 'desktop';
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(() =>
    typeof window === 'undefined' ? 'desktop' : compute(window.innerWidth),
  );

  useEffect(() => {
    const mobile = window.matchMedia(`(max-width: ${MOBILE_MAX}px)`);
    const tablet = window.matchMedia(`(max-width: ${TABLET_MAX}px)`);
    const update = () =>
      setBp(mobile.matches ? 'mobile' : tablet.matches ? 'tablet' : 'desktop');
    update();
    mobile.addEventListener('change', update);
    tablet.addEventListener('change', update);
    return () => {
      mobile.removeEventListener('change', update);
      tablet.removeEventListener('change', update);
    };
  }, []);

  return bp;
}
