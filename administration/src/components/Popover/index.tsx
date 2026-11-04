import { OverlayTrigger, Popover as BootstrapPopover } from "react-bootstrap";

export function Popover({
  children,
  key = undefined,
  placement = "top",
  trigger = "click",
  popover,
  header,
}: {
  children: React.ReactElement;
  key?: string | number | undefined;
  placement?: "top" | "bottom" | "left" | "right";
  trigger?: "click" | "hover" | "focus";
  popover?: React.ReactNode;
  header?: React.ReactNode;
}) {
  return (
    <OverlayTrigger
      key={key ? key : undefined}
      trigger={trigger}
      placement={placement}
      overlay={
        <BootstrapPopover>
          {header && (
            <BootstrapPopover.Header as="h3">{header}</BootstrapPopover.Header>
          )}
          {popover && <BootstrapPopover.Body>{popover}</BootstrapPopover.Body>}
        </BootstrapPopover>
      }
    >
      {children}
    </OverlayTrigger>
  );
}

export type TooltipProps = {
  children: React.ReactNode;
  title?: string;
  key?: string | number;
  placement?: "top" | "bottom" | "left" | "right";
};
