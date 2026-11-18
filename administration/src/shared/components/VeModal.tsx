import { Modal as BootstrapModal, type ModalProps } from "react-bootstrap";

function VeModal({
  className,
  centered = true,
  scrollable = true,
  ...props
}: ModalProps) {
  return (
    <BootstrapModal
      {...props}
      centered={centered}
      scrollable={scrollable}
      className={["op-modal", "ve-modal", className].filter(Boolean).join(" ")}
    />
  );
}

export const Modal = Object.assign(VeModal, {
  Header: BootstrapModal.Header,
  Title: BootstrapModal.Title,
  Body: BootstrapModal.Body,
  Footer: BootstrapModal.Footer,
});
