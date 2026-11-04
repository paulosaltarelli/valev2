import type { AppStateModel } from '../../models/AppStateModel ';
import { AppActionsTypes, type AppActionModel } from './appActions';

export function AppReducer(
  state: AppStateModel,
  action: AppActionModel,
): AppStateModel {
  switch (action.type) {
    case AppActionsTypes.SET_USER: {
      console.log('SET_USER', action.payload);
      return {
        ...state,
        user: action.payload,
      };
    }
    case AppActionsTypes.CLEAR_USER: {
      return {
        ...state,
        user: {
          username: '',
          name: '',
          perfil: '',
        },
      };
    }
    default:
      return state;
  }
}
