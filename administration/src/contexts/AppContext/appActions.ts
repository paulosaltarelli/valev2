// import type { TaskStateModel } from '../../models/TaskStateModel';

export enum AppActionsTypes {
  SET_USER = 'SET_USER',
  CLEAR_USER = 'CLEAR_USER',
}

export type AppActionModel =
  | {
      type: AppActionsTypes.SET_USER;
      payload: { username: string; name: string; perfil: '' | 'admin' | 'operator' };
    }
  | {
      type: AppActionsTypes.CLEAR_USER;
    };
