import { createContext, useContext } from "react";

export type BlockUiContextValue = {
  isBlocking: boolean;
  message: string;
  show: (message?: string) => void;
  hide: () => void;
};

export const BlockUiContext = createContext<BlockUiContextValue | undefined>(
  undefined
);

export function useBlockUi() {
  const ctx = useContext(BlockUiContext);
  if (!ctx) throw new Error("useBlockUi must be used within BlockUiProvider");
  return ctx;
}


