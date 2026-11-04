import { useReducer, type ReactNode } from 'react';
import { initialAppState } from './initialAppState';
// import { ThemeContext } from './ThemeContext';
import { AppReducer } from './appReducer';
import { AppContext } from './AppContext';

export function AppContextProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(AppReducer, initialAppState, () => {
    return initialAppState;
  });

  // useEffect(() => {
  //   localStorage.setItem('state', JSON.stringify(state));
  // }, [state]);


  // useEffect(() => {
  //   const handleMessage = (event: MessageEvent<number>) => {
  //     const countDownSeconds = event.data;

  //     if (countDownSeconds <= 0) {
  //       if (playBeepRef.current) {
  //         playBeepRef.current();
  //         playBeepRef.current = null;
  //       }
  //       dispatch({
  //         type: ThemeActionsTypes.TOGGLE_SIDEBAR,
  //       });
  //       worker.terminate();
  //     } else {
  //       dispatch({
  //         type: ThemeActionsTypes.TOGGLE_MOBILE_MENU,
  //         payload: { secondsRemaining: countDownSeconds },
  //       });
  //     }
  //   };

  //   worker.onmessage(handleMessage);

  //   return () => {
  //     worker.onmessage(() => {});
  //   };
  // }, [worker, dispatch]);


  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}
