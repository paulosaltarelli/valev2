import { initialAppState } from "./initialAppState";
import { createContext } from "react";
import type { AppActionModel } from "./appActions";
import type { AppStateModel } from "../../models/AppStateModel ";

const initialContextValue = {
  state: initialAppState,
  dispatch: () => {},
};

type AppContextProps = {
  state: AppStateModel;
  dispatch: React.Dispatch<AppActionModel>;
};

export const AppContext = createContext<AppContextProps>(initialContextValue);
