import { createContext, useContext, useSyncExternalStore, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CINEMAS, CONCESSIONS, DATES, MOVIES } from '../data/cinemaData.js';
import { createStoredValue } from '../utils/storedValue.js';
import { authStore } from '../utils/authStore.js';
import { calculateLoyaltyPoints, migrateStoredBookings } from '../utils/bookingLogic.js';

const AppContext = createContext(null);

const STORAGE_KEYS = {
  CINEMA: 'marumo_preferred_cinema',
  BOOKINGS: 'marumo_member_bookings',
};

const AUTH_ROUTES = ['/dang-nhap', '/dang-ky', '/xac-thuc-email'];

const INITIAL_SAMPLE_BOOKINGS = [
  {
    id: 'MRM-742810',
    status: 'confirmed',
    currency: 'VND',
    movieId: 'velvet-syndicate',
    movieSlug: 'the-velvet-syndicate',
    movieTitle: MOVIES.find((movie) => movie.id === 'velvet-syndicate').title,
    moviePoster: '/src/assets/images/poster_velvet_syndicate_1794993129750.jpg',
    ageRating: 'T16',
    cinemaId: 'marumo-saigon-centre',
    cinemaName: CINEMAS[0].name,
    cinemaAddress: CINEMAS[0].address,
    dateLabel: DATES[0].fullLabel,
    time: '21:15',
    format: 'Dolby Atmos',
    hall: 'Phòng 2 · Atmos',
    seats: ['E5', 'E6'],
    seatDetails: [
      { id: 'E5', type: 'vip', price: 135000 },
      { id: 'E6', type: 'vip', price: 135000 },
    ],
    combos: [
      { name: CONCESSIONS[0].name, qty: 1, price: CONCESSIONS[0].price },
    ],
    ticketSubtotal: 270000,
    comboSubtotal: 115000,
    discount: 54000,
    promoCode: 'MARUMO20',
    grandTotal: 331000,
    customerName: 'Trần Minh Anh',
    customerEmail: 'minh.anh@marumocine.com',
    customerPhone: '+84 909 123 456',
    paymentMethod: 'Credit / Debit Card',
    createdAt: '18/11/2026',
  },
];

export function AppProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [stores] = useState(() => ({
    cinemaStore: createStoredValue(STORAGE_KEYS.CINEMA, () => CINEMAS[0].id),
    bookingsStore: createStoredValue(STORAGE_KEYS.BOOKINGS, () => INITIAL_SAMPLE_BOOKINGS, migrateStoredBookings),
  }));
  const { cinemaStore, bookingsStore } = stores;
  const preferredCinemaId = useSyncExternalStore(cinemaStore.subscribe, cinemaStore.getSnapshot, cinemaStore.getSnapshot);
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getSnapshot, authStore.getSnapshot);
  const user = auth.user;
  const bookings = useSyncExternalStore(bookingsStore.subscribe, bookingsStore.getSnapshot, bookingsStore.getSnapshot);
  const setPreferredCinemaId = cinemaStore.set;
  const setBookings = bookingsStore.set;
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

  const addBooking = (bookingRecord) => {
    setBookings((prev) => [{ ...bookingRecord, currency: 'VND' }, ...prev]);
    if (user) {
      authStore.awardPoints(calculateLoyaltyPoints(bookingRecord.grandTotal));
    }
  };

  const cancelBooking = (bookingId) => {
    setBookings((prev) =>
      prev.map((item) =>
        item.id === bookingId
          ? { ...item, status: 'cancelled', cancelledAt: new Date().toLocaleDateString('vi-VN') }
          : item
      )
    );
  };

  return (
    <AppContext.Provider
      value={{
        preferredCinemaId,
        preferredCinema,
        setPreferredCinemaId,
        user,
        signIn,
        registerAccount,
        logoutUser,
        openAuthPage,
        bookings,
        addBooking,
        cancelBooking,
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
