import type { ReactNode } from 'react';
// Textos operacionais permanecem completos e acessíveis em toque e teclado.
export function Limited({ children }: { children: ReactNode; limit: number; tooltip?: boolean; popover?: boolean; placement?: 'top' | 'bottom' | 'left' | 'right'; trigger?: 'hover' | 'click' }) {
  return <span style={{ overflowWrap: 'anywhere', whiteSpace: 'normal' }}>{children}</span>;
}
