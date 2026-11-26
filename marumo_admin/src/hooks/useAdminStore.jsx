import { createContext, useCallback, useContext, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { loadInitialAdminDataset } from '../services/adminService.js';
import { adminApi, apiErrorMessage } from '../utils/adminApi.js';
import { adminSessionStore } from '../utils/adminSessionStore.js';

const AdminStoreContext = createContext(null);

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function AdminStoreProvider({ children }) {
  const initial = useMemo(() => loadInitialAdminDataset(), []);

  const generation = useRef(0);
  const dataRequests = useRef({});
  const subscribeSession = useCallback((listener) => adminSessionStore.subscribe(() => {
    generation.current += 1;
    Object.values(dataRequests.current).forEach((controller) => controller.abort());
    listener();
  }), []);
  const sessionState = useSyncExternalStore(
    subscribeSession,
    adminSessionStore.getSnapshot,
    adminSessionStore.getSnapshot
  );
  const session = sessionState.session;
  const sessionStatus = sessionState.status;
  const sessionError = sessionState.error;
  const hasPermission = useCallback((permission) => session?.globalPermissions?.includes(permission) ?? false, [session]);
  const canReadMovies = hasPermission('movie.create') || hasPermission('movie.update') || hasPermission('showtime.create');
  const canCreateShowtimes = hasPermission('showtime.create');
  const canReadBookings = hasPermission('booking.view') || (session?.branchAssignments?.some((assignment) => assignment.permissions?.includes('booking.view')) ?? false);
  const canAccessAdmin = canReadMovies || canCreateShowtimes || canReadBookings;
  const adminProfile = session ? {
    ...session.customer,
    role: session.roles.map((role) => role.code).join(', '),
    branchScope: canReadMovies || hasPermission('booking.view') ? 'Global' : (session.branchAssignments || []).filter((assignment) => assignment.permissions?.includes('booking.view')).map((assignment) => assignment.branchId).join(', '),
  } : null;
  const [cinemas, setCinemas] = useState(initial.cinemas);
  const [movies, setMovies] = useState([]);
  const [showtimes, setShowtimes] = useState([]);
  const [bookings] = useState(initial.bookings);
  const [users, setUsers] = useState(initial.users);
  const [managers, setManagers] = useState(initial.managers);
  const [promotions, setPromotions] = useState(initial.promotions);
  const [activities, setActivities] = useState(initial.activities);
  const [notifications, setNotifications] = useState(initial.notifications);
  const [settings, setSettings] = useState(initial.settings);
  const [revenueSeries] = useState(initial.revenueSeries);
  const [toasts, setToasts] = useState([]);
  const [globalSearch, setGlobalSearch] = useState('');
  const [catalogOptions, setCatalogOptions] = useState({ languages: [], formats: [], branches: [], auditoriums: [], showtimeStatuses: [] });
  const [loadErrors, setLoadErrors] = useState({ movies: '', showtimes: '', options: '' });
  const [loading, setLoading] = useState({ movies: false, showtimes: false, options: false });

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

  const restoreSession = useCallback(() => {
    adminSessionStore.restore();
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await adminSessionStore.signIn(email, password);
    if (!data.globalPermissions?.some((permission) => ['movie.create', 'movie.update', 'showtime.create', 'booking.view'].includes(permission)) && !data.branchAssignments?.some((assignment) => assignment.permissions?.includes('booking.view'))) {
      const error = new Error('Tài khoản không có quyền truy cập quản trị.');
      error.code = 'PERMISSION_DENIED';
      throw error;
    }
    return data;
  }, []);

  const logout = useCallback(async () => {
    await adminSessionStore.signOut();
    setMovies([]);
    setShowtimes([]);
    setGlobalSearch('');
  }, []);

  const expireSession = useCallback((error) => {
    if (error.status === 401 && adminSessionStore.getSnapshot().session === session) {
      adminSessionStore.expire();
      setMovies([]);
      setShowtimes([]);
    }
  }, [session]);

  const refreshMovies = useCallback(async () => {
    const currentGeneration = generation.current;
    dataRequests.current.movies?.abort();
    const controller = new AbortController();
    dataRequests.current.movies = controller;
    setLoading((previous) => ({ ...previous, movies: true }));
    setLoadErrors((previous) => ({ ...previous, movies: '' }));
    try {
      const records = await adminApi.movies.listAll({ signal: controller.signal });
      if (controller.signal.aborted || currentGeneration !== generation.current) return;
      setMovies(records);
    } catch (error) {
      if (controller.signal.aborted || currentGeneration !== generation.current) return;
      setMovies([]);
      setLoadErrors((previous) => ({ ...previous, movies: apiErrorMessage(error) }));
      expireSession(error);
    } finally {
      if (currentGeneration === generation.current && dataRequests.current.movies === controller) setLoading((previous) => ({ ...previous, movies: false }));
    }
  }, [expireSession]);

  const refreshShowtimes = useCallback(async () => {
    const currentGeneration = generation.current;
    dataRequests.current.showtimes?.abort();
    const controller = new AbortController();
    dataRequests.current.showtimes = controller;
    setLoading((previous) => ({ ...previous, showtimes: true }));
    setLoadErrors((previous) => ({ ...previous, showtimes: '' }));
    try {
      const records = await adminApi.showtimes.listAll({ signal: controller.signal });
      if (controller.signal.aborted || currentGeneration !== generation.current) return;
      setShowtimes(records);
    } catch (error) {
      if (controller.signal.aborted || currentGeneration !== generation.current) return;
      setShowtimes([]);
      setLoadErrors((previous) => ({ ...previous, showtimes: apiErrorMessage(error) }));
      expireSession(error);
    } finally {
      if (currentGeneration === generation.current && dataRequests.current.showtimes === controller) setLoading((previous) => ({ ...previous, showtimes: false }));
    }
  }, [expireSession]);

  const refreshOptions = useCallback(async () => {
    const currentGeneration = generation.current;
    dataRequests.current.options?.abort();
    const controller = new AbortController();
    dataRequests.current.options = controller;
    setLoading((previous) => ({ ...previous, options: true }));
    setLoadErrors((previous) => ({ ...previous, options: '' }));
    try {
      const options = await adminApi.options({ signal: controller.signal });
      if (controller.signal.aborted || currentGeneration !== generation.current) return;
      setCatalogOptions(options);
    } catch (error) {
      if (controller.signal.aborted || currentGeneration !== generation.current) return;
      setLoadErrors((previous) => ({ ...previous, options: apiErrorMessage(error) }));
      expireSession(error);
    } finally {
      if (currentGeneration === generation.current && dataRequests.current.options === controller) setLoading((previous) => ({ ...previous, options: false }));
    }
  }, [expireSession]);

  const bindAdminData = useCallback((node) => {
    if (!node) return undefined;
    if (sessionStatus !== 'authenticated') return undefined;
    generation.current += 1;
    setMovies([]);
    setShowtimes([]);
    setCatalogOptions({ languages: [], formats: [], branches: [], auditoriums: [], showtimeStatuses: [] });
    setLoadErrors({ movies: '', showtimes: '', options: '' });
    setLoading({ movies: false, showtimes: false, options: false });
    if (canReadMovies) refreshMovies();
    if (canCreateShowtimes) refreshShowtimes();
    if (canReadMovies) refreshOptions();
    return () => {
      generation.current += 1;
      Object.values(dataRequests.current).forEach((controller) => controller.abort());
    };
  }, [session, sessionStatus, canReadMovies, canCreateShowtimes, refreshMovies, refreshShowtimes, refreshOptions]);

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

  const saveMovie = useCallback(async (payload, editingId = null) => {
    const currentGeneration = generation.current;
    try {
      const result = editingId ? await adminApi.movies.update(editingId, payload) : await adminApi.movies.create(payload);
      if (currentGeneration !== generation.current) return result.movie;
      setMovies((previous) => editingId ? previous.map((movie) => movie.id === editingId ? result.movie : movie) : [result.movie, ...previous]);
      pushToast(editingId ? 'Đã cập nhật phim.' : 'Đã tạo phim.');
      return result.movie;
    } catch (error) {
      if (currentGeneration === generation.current) expireSession(error);
      throw error;
    }
  }, [expireSession, pushToast]);

  const saveShowtime = useCallback(async (payload) => {
    const currentGeneration = generation.current;
    try {
      const result = await adminApi.showtimes.create(payload);
      if (currentGeneration !== generation.current) return result.showtime;
      await refreshShowtimes();
      if (currentGeneration !== generation.current) return result.showtime;
      pushToast('Đã tạo suất chiếu và inventory ghế.');
      return result.showtime;
    } catch (error) {
      if (currentGeneration === generation.current) expireSession(error);
      throw error;
    }
  }, [expireSession, refreshShowtimes, pushToast]);
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
    session,
    sessionStatus,
    sessionError,
    restoreSession,
    login,
    logout,
    hasPermission,
    canReadMovies,
    canReadBookings,
    expireSession,
    canAccessAdmin,
    canCreateShowtimes,
    catalogOptions,
    loadErrors,
    refreshOptions,
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
    bindAdminData,
    loading,
    pushToast,
    dismissToast,
    saveCinema,
    toggleCinemaStatus,
    saveMovie,
    saveShowtime,
    toggleUserStatus,
    saveManager,
    toggleManagerStatus,
    savePromotion,
    togglePromotionStatus,
    saveSettings,
    markNotificationRead,
    markAllNotificationsRead,
    refreshMovies,
    refreshShowtimes,
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
