import type { ThemeStateModel } from '../../models/ThemeStateModel';
import { ThemeActionsTypes, type ThemeActionModel } from './themeActions';

export function ThemeReducer(state: ThemeStateModel, action: ThemeActionModel) {
  switch (action.type) {
    case ThemeActionsTypes.TOGGLE_SIDEBAR: {
      console.log('TOGGLE_SIDEBAR', state.sidebarActive);
      return {
        ...state,
        sidebarActive: !state.sidebarActive,
      };
    }
    case ThemeActionsTypes.TOGGLE_MOBILE_MENU: {
      console.log('TOGGLE_MOBILE_MENU', state.mobileMenu);
      return {
        ...state,
        mobileMenu: !state.mobileMenu,
      };
    }
    default:
      return state;
  }
}
