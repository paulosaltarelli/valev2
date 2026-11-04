import { useEffect, useReducer } from 'react';
import { initialThemeState } from './initialThemeState';
// import { ThemeContext } from './ThemeContext';
import { ThemeReducer } from './themeReducer';
import { ThemeContext } from './ThemeContext';

export function ThemeContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(ThemeReducer, initialThemeState, () => {
    //lazy initialization - já inicializa o estado com o valor do localStorage
    const savedState = localStorage.getItem('state');

    const parsedState = savedState ? JSON.parse(savedState) : initialThemeState;
    console.log('parsedState', parsedState);

    return {
      ...parsedState,
    };
  });

  useEffect(() => {
    localStorage.setItem('state', JSON.stringify(state));
  }, [state]);


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
    <ThemeContext.Provider value={{ state, dispatch }}>
      {children}
    </ThemeContext.Provider>
  );
}
