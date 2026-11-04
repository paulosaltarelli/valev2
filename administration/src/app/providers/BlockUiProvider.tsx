import { type ReactNode, useCallback, useMemo, useState } from "react";
import BlockUi from "@availity/block-ui";
import "@availity/block-ui/dist/index.css";
import { BlockUiContext, type BlockUiContextValue } from "./blockUiContext";
import { Spinner } from "react-bootstrap";

const DEFAULT_MESSAGE = "Carregando...";

export function BlockUiProvider({ children }: { children: ReactNode }) {
  const [pendingCount, setPendingCount] = useState(0);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);

  const show = useCallback((nextMessage?: string) => {
    const cleaned = nextMessage?.trim();
    setMessage(cleaned ? cleaned : DEFAULT_MESSAGE);
    setPendingCount((c) => c + 1);
  }, []);

  const hide = useCallback(() => {
    setPendingCount((c) => Math.max(0, c - 1));
  }, []);

  const isBlocking = pendingCount > 0;

  const value = useMemo<BlockUiContextValue>(
    () => ({
      isBlocking,
      message,
      show,
      hide,
    }),
    [hide, isBlocking, message, show]
  );

  return (
    <BlockUiContext.Provider value={value}>
      <BlockUi blocking={isBlocking} message={message} loader={<Spinner animation="border" variant="secondary" />}>
        <div className="min-vh-100">{children}</div>
      </BlockUi>
    </BlockUiContext.Provider>
  );
}


