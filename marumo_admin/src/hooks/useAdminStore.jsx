import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { loadInitialAdminDataset } from '../services/adminService.js';
import { calculateEndTime } from '../utils/formatters.js';

const AdminStoreContext = createContext(null);

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function AdminStoreProvider({ children }) {
  const initial = useMemo(() => loadInitialAdminDataset(), []);

  const [adminProfile] = useState(initial.adminProfile);
  const [cinemas, setCinemas] = useState(initial.cinemas);
  const [movies, setMovies] = useState(initial.movies);
  const [showtimes, setShowtimes] = useState(initial.showtimes);
  const [bookings, setBookings] = useState(initial.bookings);
  const [users, setUsers] = useState(initial.users);
  const [managers, setManagers] = useState(initial.managers);
  const [promotions, setPromotions] = useState(initial.promotions);
  const [activities, setActivities] = useState(initial.activities);
  const [notifications, setNotifications] = useState(initial.notifications);
  const [settings, setSettings] = useState(initial.settings);
  const [revenueSeries] = useState(initial.revenueSeries);
  const [toasts, setToasts] = useState([]);
  const [globalSearch, setGlobalSearch] = useState('');
  const [isLoggedOut, setIsLoggedOut] = useState(false);

  const pushToast = useCallback((message, variant = 'success') => {
    const id = makeId('tst');
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const logActivity = useCallback((type, title, detail) => {
    setActivities((prev) => [
      {
        id: makeId('act'),
        type,
        title,
        detail,
        timestamp: 'Just now',
      },
      ...prev.slice(0, 14),
    ]);
  }, []);


  const saveCinema = useCallback(
    (payload, editingId = null) => {
      if (editingId) {
        setCinemas((prev) =>
          prev.map((c) => (c.id === editingId ? { ...c, ...payload } : c))
        );
        logActivity('admin', 'Updated cinema branch', `${payload.name} (${payload.city})`);
        pushToast(`Updated ${payload.name}`);
      } else {
        const newCinema = {
          id: makeId('cin'),
          code: `MRM-${payload.city.slice(0, 3).toUpperCase()}-${String(cinemas.length + 1).padStart(2, '0')}`,
          occupancyRate: payload.status === 'Active' ? 64.0 : 0,
          monthlyRevenue: payload.status === 'Active' ? 84000 : 0,
          monthlyBookings: payload.status === 'Active' ? 1950 : 0,
          openedDate: new Date().toISOString().slice(0, 10),
          formats: payload.formats?.length ? payload.formats : ['Standard', 'Dolby Atmos'],
          ...payload,
        };
        setCinemas((prev) => [newCinema, ...prev]);
        logActivity('admin', 'Added new cinema branch', `${newCinema.name} · ${newCinema.city}`);
        pushToast(`Created ${newCinema.name}`);
      }
    },
    [cinemas.length, logActivity, pushToast]
  );

  const toggleCinemaStatus = useCallback(
    (cinemaId, nextStatus) => {
      setCinemas((prev) =>
        prev.map((c) => (c.id === cinemaId ? { ...c, status: nextStatus } : c))
      );
      const target = cinemas.find((c) => c.id === cinemaId);
      if (target) {
        logActivity('admin', `Cinema status changed to ${nextStatus}`, target.name);
        pushToast(`${target.name} marked ${nextStatus}`);
      }
    },
    [cinemas, logActivity, pushToast]
  );


  const saveMovie = useCallback(
    (payload, editingId = null) => {
      if (editingId) {
        setMovies((prev) =>
          prev.map((m) => (m.id === editingId ? { ...m, ...payload } : m))
        );
        logActivity('admin', 'Updated movie record', payload.title);
        pushToast(`Updated "${payload.title}"`);
      } else {
        const newMovie = {
          id: makeId('mov'),
          boxOfficeRevenue: 0,
          ticketsSold: 0,
          posterUrl: payload.posterUrl || '/src/assets/images/poster_glass_meridian_1794994703505.jpg',
          ...payload,
        };
        setMovies((prev) => [newMovie, ...prev]);
        logActivity('admin', 'Added new movie to catalog', `${newMovie.title} (${newMovie.ageRating})`);
        pushToast(`Added "${newMovie.title}"`);
      }
    },
    [logActivity, pushToast]
  );

  const deleteMovie = useCallback(
    (movieId) => {
      const target = movies.find((m) => m.id === movieId);
      setMovies((prev) => prev.filter((m) => m.id !== movieId));
      setShowtimes((prev) => prev.filter((s) => s.movieId !== movieId));
      if (target) {
        logActivity('admin', 'Removed movie from catalog', target.title);
        pushToast(`Deleted "${target.title}"`);
      }
    },
    [movies, logActivity, pushToast]
  );


  const saveShowtime = useCallback(
    (payload, editingId = null) => {
      const movie = movies.find((m) => m.id === payload.movieId);
      const computedEnd = calculateEndTime(payload.startTime, movie?.durationMinutes || 120);
      const finalPayload = {
        ...payload,
        endTime: computedEnd || payload.endTime || '22:00',
      };

      if (editingId) {
        setShowtimes((prev) =>
          prev.map((s) => (s.id === editingId ? { ...s, ...finalPayload } : s))
        );
        logActivity('admin', 'Updated showtime schedule', `${movie?.title || 'Movie'} · ${finalPayload.startTime}`);
        pushToast('Showtime schedule updated');
      } else {
        const newShowtime = {
          id: makeId('shw'),
          bookedSeats: 0,
          ...finalPayload,
        };
        setShowtimes((prev) => [newShowtime, ...prev]);
        logActivity('admin', 'Scheduled new showtime', `${movie?.title || 'Movie'} · ${finalPayload.date} ${finalPayload.startTime}`);
        pushToast('Showtime scheduled');
      }
    },
    [movies, logActivity, pushToast]
  );

  const updateShowtimeStatus = useCallback(
    (showtimeId, nextStatus) => {
      setShowtimes((prev) =>
        prev.map((s) => (s.id === showtimeId ? { ...s, status: nextStatus } : s))
      );
      logActivity('admin', `Showtime marked ${nextStatus}`, `Showtime ID ${showtimeId}`);
      pushToast(`Showtime status set to ${nextStatus}`);
    },
    [logActivity, pushToast]
  );


  const updateBookingStatus = useCallback(
    (bookingId, bookingStatus, paymentStatus) => {
      const target = bookings.find((b) => b.id === bookingId);
      setBookings((prev) =>
        prev.map((b) =>
          b.id === bookingId
            ? {
                ...b,
                bookingStatus,
                paymentStatus: paymentStatus || b.paymentStatus,
              }
            : b
        )
      );
      if (target) {
        logActivity('booking', `Booking ${target.reference} updated`, `Status: ${bookingStatus}`);
        pushToast(`Booking ${target.reference} updated to ${bookingStatus}`);
      }
    },
    [bookings, logActivity, pushToast]
  );


  const toggleUserStatus = useCallback(
    (userId, nextStatus) => {
      const target = users.find((u) => u.id === userId);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, status: nextStatus } : u))
      );
      if (target) {
        logActivity('user', `Customer account ${nextStatus.toLowerCase()}`, target.name);
        pushToast(`${target.name} is now ${nextStatus}`);
      }
    },
    [users, logActivity, pushToast]
  );


  const saveManager = useCallback(
    (payload, editingId = null) => {
      const cinema = cinemas.find((c) => c.id === payload.cinemaId);
      if (editingId) {
        setManagers((prev) =>
          prev.map((m) => (m.id === editingId ? { ...m, ...payload } : m))
        );
        logActivity('admin', 'Updated manager assignment', `${payload.name} → ${cinema?.name || 'Branch'}`);
        pushToast(`Updated manager ${payload.name}`);
      } else {
        const newManager = {
          id: makeId('mgr'),
          lastActive: 'Just added',
          ...payload,
        };
        setManagers((prev) => [newManager, ...prev]);
        logActivity('admin', 'Added branch manager', `${newManager.name} · ${cinema?.name || ''}`);
        pushToast(`Added manager ${newManager.name}`);
      }
    },
    [cinemas, logActivity, pushToast]
  );

  const toggleManagerStatus = useCallback(
    (managerId, nextStatus) => {
      const target = managers.find((m) => m.id === managerId);
      setManagers((prev) =>
        prev.map((m) => (m.id === managerId ? { ...m, status: nextStatus } : m))
      );
      if (target) {
        logActivity('admin', `Manager status set to ${nextStatus}`, target.name);
        pushToast(`${target.name} marked ${nextStatus}`);
      }
    },
    [managers, logActivity, pushToast]
  );


  const savePromotion = useCallback(
    (payload, editingId = null) => {
      const normalized = {
        ...payload,
        code: payload.code.trim().toUpperCase(),
      };
      if (editingId) {
        setPromotions((prev) =>
          prev.map((p) => (p.id === editingId ? { ...p, ...normalized } : p))
        );
        logActivity('admin', 'Updated promotion campaign', `${normalized.title} (${normalized.code})`);
        pushToast(`Updated promotion ${normalized.code}`);
      } else {
        const newPromo = {
          id: makeId('prm'),
          usageCount: 0,
          ...normalized,
        };
        setPromotions((prev) => [newPromo, ...prev]);
        logActivity('admin', 'Created promotion campaign', `${newPromo.title} (${newPromo.code})`);
        pushToast(`Created promotion ${newPromo.code}`);
      }
    },
    [logActivity, pushToast]
  );

  const togglePromotionStatus = useCallback(
    (promoId, nextStatus) => {
      const target = promotions.find((p) => p.id === promoId);
      setPromotions((prev) =>
        prev.map((p) => (p.id === promoId ? { ...p, status: nextStatus } : p))
      );
      if (target) {
        logActivity('admin', `Promotion ${nextStatus.toLowerCase()}`, target.code);
        pushToast(`Promotion ${target.code} is now ${nextStatus}`);
      }
    },
    [promotions, logActivity, pushToast]
  );


  const saveSettings = useCallback(
    (nextSettings) => {
      setSettings(nextSettings);
      logActivity('admin', 'Updated system settings', 'Pricing, fee & operational thresholds saved');
      pushToast('System settings saved');
    },
    [logActivity, pushToast]
  );

  const markNotificationRead = useCallback((id) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, unread: false } : n)));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
    pushToast('All notifications marked as read');
  }, [pushToast]);

  const value = {
    adminProfile,
    cinemas,
    movies,
    showtimes,
    bookings,
    users,
    managers,
    promotions,
    activities,
    notifications,
    settings,
    revenueSeries,
    toasts,
    globalSearch,
    setGlobalSearch,
    isLoggedOut,
    setIsLoggedOut,
    pushToast,
    dismissToast,
    saveCinema,
    toggleCinemaStatus,
    saveMovie,
    deleteMovie,
    saveShowtime,
    updateShowtimeStatus,
    updateBookingStatus,
    toggleUserStatus,
    saveManager,
    toggleManagerStatus,
    savePromotion,
    togglePromotionStatus,
    saveSettings,
    markNotificationRead,
    markAllNotificationsRead,
  };

  return <AdminStoreContext.Provider value={value}>{children}</AdminStoreContext.Provider>;
}

export function useAdminStore() {
  const ctx = useContext(AdminStoreContext);
  if (!ctx) {
    throw new Error('useAdminStore must be used within AdminStoreProvider');
  }
  return ctx;
}
