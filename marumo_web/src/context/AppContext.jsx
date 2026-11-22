import { createContext, useContext, useSyncExternalStore, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CINEMAS } from '../data/cinemaData.js';
import { createStoredValue } from '../utils/storedValue.js';
import { authStore } from '../utils/authStore.js';

const AppContext = createContext(null);

const STORAGE_KEYS = {
  CINEMA: 'marumo_preferred_cinema',
};

const AUTH_ROUTES = ['/dang-nhap', '/dang-ky', '/xac-thuc-email'];

export function AppProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [stores] = useState(() => ({
    cinemaStore: createStoredValue(STORAGE_KEYS.CINEMA, () => CINEMAS[0].id),
  }));
  const { cinemaStore } = stores;
  const preferredCinemaId = useSyncExternalStore(cinemaStore.subscribe, cinemaStore.getSnapshot, cinemaStore.getSnapshot);
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getSnapshot, authStore.getSnapshot);
  const user = auth.user;
  const setPreferredCinemaId = cinemaStore.set;
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [trailerMovie, setTrailerMovie] = useState(null);

  const preferredCinema =
    CINEMAS.find((c) => c.id === preferredCinemaId) || CINEMAS[0];

  const openAuthPage = (mode = 'login') => {
    const target = mode === 'register' ? '/dang-ky' : '/dang-nhap';
    const from = AUTH_ROUTES.includes(location.pathname)
      ? ''
      : `${location.pathname}${location.search}`;
    navigate(target, from ? { state: { from } } : undefined);
  };

  const registerAccount = (input) => authStore.register(input);

  const signIn = (input) => authStore.signIn(input);

  const logoutUser = () => authStore.signOut();

  return (
    <AppContext.Provider
      value={{
        preferredCinemaId,
        preferredCinema,
        setPreferredCinemaId,
        user,
        authStatus: auth.status,
        signIn,
        registerAccount,
        logoutUser,
        openAuthPage,
        searchModalOpen,
        setSearchModalOpen,
        trailerMovie,
        setTrailerMovie,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used inside AppProvider');
  }
  return ctx;
}
