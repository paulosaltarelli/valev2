import { OverlayTrigger, Tooltip as BootstrapTooltip } from 'react-bootstrap';

export function Tooltip({
  children,
  title,
  key,
  placement = 'top',
}: {
  children: React.ReactElement;
  title: React.ReactNode;
  key?: string | number;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}) {
  return (
    <OverlayTrigger
      key={key}
      placement={placement}
      overlay={<BootstrapTooltip style={{ position: 'fixed' }}>{title}</BootstrapTooltip>}
    >
      {children}
    </OverlayTrigger>
  );
}

export type TooltipProps = {
  children: React.ReactNode;
  title?: string;
  key?: string | number;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}
