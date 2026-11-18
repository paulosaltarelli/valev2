import { Button as BootstrapButton, type ButtonProps } from "react-bootstrap";
import { Tooltip, type TooltipProps } from "../Tooltip";

//tudo de <Button></Button> do bootstrap mais o children mais tooltip=true ou false
export function Button({
  children,
  tooltip,
  ...props
}: ButtonProps & TooltipProps & { tooltip?: string, children?: React.ReactNode }) {
  return (
    <>
      {tooltip && (
        <Tooltip title={tooltip} placement={props.placement}>
          <BootstrapButton aria-label={props["aria-label"] ?? tooltip} {...props}>{children}</BootstrapButton>
        </Tooltip>
      )}
      {!tooltip && <BootstrapButton {...props}>{children}</BootstrapButton>}
    </>
  );
}
