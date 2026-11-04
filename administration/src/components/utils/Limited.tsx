import { Popover } from "../Popover";
import { Tooltip } from "../Tooltip";

//tudo de <Button></Button> do bootstrap mais o children mais tooltip=true ou false
export function Limited({
  children,
  limit = 10,
  tooltip = true,
  popover = false,
  placement = "top",
  trigger = "hover",
}: {
  children: string | React.ReactNode | null;
  limit: number;
  tooltip?: boolean;
  popover?: boolean;
  placement?: "top" | "bottom" | "left" | "right";
  trigger?: "hover" | "click";
}) {
  if (typeof children === "string" && children.length > limit) {
    const limitedChildren = children.substring(0, limit) + "...";
    if (tooltip && !popover) {
      return (
        <Tooltip title={children} placement={placement}>
          <span>{limitedChildren}</span>
        </Tooltip>
      );
    } else if (popover) {
      return (
        <Popover popover={children} placement={placement} trigger={trigger} >
          <span>{limitedChildren}</span>
        </Popover>
      );
    }
    return limitedChildren;
  } else if (
    (children && typeof children === "object") ||
    (children && typeof children === "function")
  ) {
    return <Limited limit={limit}>{children?.toString()}</Limited>;
  } else {
    //Pega o conteúdo do children e limita o número de caracteres
    return children;
  }
}
