// import type { TaskStateModel } from '../../models/TaskStateModel';

export enum ThemeActionsTypes {
  TOGGLE_SIDEBAR = 'TOGGLE_SIDEBAR',
  TOGGLE_MOBILE_MENU = 'TOGGLE_MOBILE_MENU',
}

export type ThemeActionModel =
  | {
      type: ThemeActionsTypes.TOGGLE_SIDEBAR;
    }
  | {
      type: ThemeActionsTypes.TOGGLE_MOBILE_MENU;
    };
