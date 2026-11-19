import { createContext, useContext, useEffect, useState } from 'react';
import { CINEMAS, CONCESSIONS, DATES, MOVIES } from '../data/cinemaData.js';
import { calculateLoyaltyPoints, migrateStoredBookings } from '../utils/bookingLogic.js';

const AppContext = createContext(null);

const STORAGE_KEYS = {
  CINEMA: 'marumo_preferred_cinema',
  USER: 'marumo_member_user',
  BOOKINGS: 'marumo_member_bookings',
};

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

function readStorage(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function AppProvider({ children }) {
  const [preferredCinemaId, setPreferredCinemaId] = useState(() =>
    readStorage(STORAGE_KEYS.CINEMA, CINEMAS[0].id)
  );
  const [user, setUser] = useState(() => readStorage(STORAGE_KEYS.USER, null));
  const [bookings, setBookings] = useState(() =>
    migrateStoredBookings(readStorage(STORAGE_KEYS.BOOKINGS, INITIAL_SAMPLE_BOOKINGS))
  );
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [trailerMovie, setTrailerMovie] = useState(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.CINEMA, JSON.stringify(preferredCinemaId));
    } catch {
      // Ignore storage quota errors
    }
  }, [preferredCinemaId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    } catch {
      // Ignore storage quota errors
    }
  }, [user]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.BOOKINGS, JSON.stringify(bookings));
    } catch {
      // Ignore storage quota errors
    }
  }, [bookings]);

  const preferredCinema =
    CINEMAS.find((c) => c.id === preferredCinemaId) || CINEMAS[0];

  const openAuthModal = (mode = 'login') => {
    setAuthMode(mode);
    setAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setAuthModalOpen(false);
  };

  const loginUser = ({ name, email }) => {
    const member = {
      name: name || email.split('@')[0],
      email,
      tier: 'MARUMO Club',
      points: 420,
      memberId: 'MRM-849201',
    };
    setUser(member);
    setAuthModalOpen(false);
    return member;
  };

  const logoutUser = () => {
    setUser(null);
  };

  const addBooking = (bookingRecord) => {
    setBookings((prev) => [{ ...bookingRecord, currency: 'VND' }, ...prev]);
    if (user) {
      const earned = calculateLoyaltyPoints(bookingRecord.grandTotal);
      setUser((prev) => (prev ? { ...prev, points: prev.points + earned } : prev));
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
        loginUser,
        logoutUser,
        bookings,
        addBooking,
        cancelBooking,
        authModalOpen,
        authMode,
        setAuthMode,
        openAuthModal,
        closeAuthModal,
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
