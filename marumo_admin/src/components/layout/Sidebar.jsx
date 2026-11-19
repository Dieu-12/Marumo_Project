import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  Building2,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Film,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Tag,
  Ticket,
  Users,
  X,
} from 'lucide-react';
import './Sidebar.css';

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true }],
  },
  {
    label: 'Cinema Operations',
    items: [
      { to: '/cinemas', label: 'Cinema Management', icon: Building2 },
      { to: '/movies', label: 'Movie Management', icon: Film },
      { to: '/showtimes', label: 'Showtimes', icon: CalendarClock },
      { to: '/bookings', label: 'Booking Management', icon: Ticket },
    ],
  },
  {
    label: 'Accounts & Growth',
    items: [
      { to: '/users', label: 'User Management', icon: Users },
      { to: '/managers', label: 'Manager Accounts', icon: ShieldCheck },
      { to: '/promotions', label: 'Promotions', icon: Tag },
    ],
  },
  {
    label: 'Finance & System',
    items: [
      { to: '/reports', label: 'Revenue & Reports', icon: BarChart3 },
      { to: '/settings', label: 'System Settings', icon: Settings },
    ],
  },
];

export function Sidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}) {
  return (
    <>
      <div
        className={`sidebar-backdrop ${mobileOpen ? 'sidebar-backdrop--visible' : ''}`.trim()}
        onClick={onCloseMobile}
        aria-hidden="true"
      />
      <aside
        className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''} ${
          mobileOpen ? 'sidebar--mobile-open' : ''
        }`.trim()}
        aria-label="Primary navigation"
      >
        <div className="sidebar-brand">
          <NavLink
            to="/"
            className="sidebar-logo-link"
            onClick={onCloseMobile}
            aria-label="MARUMO Admin Dashboard"
          >
            <span className="sidebar-logo-mark" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 18V6L12 13L20 6V18"
                  stroke="#FFFFFF"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            {!collapsed ? <span className="sidebar-logo-text">MARUMO</span> : null}
          </NavLink>

          <button
            type="button"
            className="sidebar-mobile-close"
            onClick={onCloseMobile}
            aria-label="Close navigation menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="sidebar-group">
              <div className="sidebar-group-label">{group.label}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={onCloseMobile}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      `sidebar-link ${isActive ? 'sidebar-link--active' : ''}`.trim()
                    }
                  >
                    <Icon size={18} className="sidebar-link-icon" aria-hidden="true" />
                    <span className="sidebar-link-label">{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <ChevronRight size={16} aria-hidden="true" />
            ) : (
              <>
                <ChevronLeft size={16} aria-hidden="true" />
                <span>Collapse Sidebar</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
