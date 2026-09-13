import React, { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import Sidebar from './Sidebar';
import GlobalSearchModal from './GlobalSearchModal';
import GuardDetailDrawer from './GuardDetailDrawer';
import ToastContainer from './ToastContainer';
import { useSpot } from '../context/SpotContext';
import { useAuth } from '../context/AuthContext';
import {
  Search,
  Bell,
  Clock,
  Radio,
  MessageSquare,
  ChevronRight,
  Shield,
  UserCheck,
  CheckCircle,
  AlertTriangle,
  X
} from 'lucide-react';

const formatClock = (date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const formatDate = (date) => date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

export default function Layout({ children, title, subtitle, actions }) {
  const { setGlobalSearchOpen, liveEvents, addToast } = useSpot();
  const { profile } = useAuth();
  const [now, setNow] = useState(() => new Date());
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [pointer, setPointer] = useState({ x: -200, y: -200 });
  const [readNotificationIds, setReadNotificationIds] = useState(() => new Set());
  const location = useLocation();

  const notificationStorageKey = `spot.read-notifications.${profile?.id || 'session'}`;
  const unreadCount = liveEvents.filter((event) => !readNotificationIds.has(event.id)).length;

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(notificationStorageKey) || '[]');
      setReadNotificationIds(new Set(stored));
    } catch {
      setReadNotificationIds(new Set());
    }
  }, [notificationStorageKey]);

  const openNotifications = () => {
    const nextReadIds = new Set(readNotificationIds);
    liveEvents.forEach((event) => nextReadIds.add(event.id));
    setReadNotificationIds(nextReadIds);
    localStorage.setItem(notificationStorageKey, JSON.stringify([...nextReadIds].slice(-100)));
    setNotificationsOpen((previous) => !previous);
  };

  // Compute breadcrumb trail label based on current route
  const getBreadcrumb = () => {
    const path = location.pathname;
    if (path === '/') return 'Command Center / Dashboard';
    if (path === '/tracking') return 'Command Center / Live Monitoring';
    if (path === '/routes') return 'Command Center / Patrol Operations';
    if (path === '/guards') return 'Command Center / Guards Directory';
    if (path === '/face-verify') return 'Command Center / Face Enrollment';
    if (path === '/sites') return 'Command Center / Deployment Sites';
    if (path === '/checkpoints') return 'Command Center / QR Checkpoints';
    if (path === '/clients') return 'Command Center / Client Accounts';
    if (path === '/schedules') return 'Command Center / Duty Schedules';
    if (path === '/incidents') return 'Command Center / Incident Center';
    if (path === '/analytics') return 'Command Center / Operational Analytics';
    if (path === '/reports') return 'Command Center / Executive Reports';
    if (path === '/logs') return 'Command Center / Security Audit Logs';
    if (path === '/settings') return 'Command Center / System Settings';
    if (path === '/profile') return 'Command Center / Supervisor Profile';
    return 'Command Center';
  };

  return (
    <div
      className="relative flex h-screen w-screen overflow-hidden bg-[#0F172A] text-slate-100 selection:bg-blue-600 selection:text-white"
      onPointerMove={(event) => setPointer({ x: event.clientX, y: event.clientY })}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none fixed z-10 hidden h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/[0.035] blur-3xl md:block"
        style={{ left: pointer.x, top: pointer.y }}
      />
      {/* Left Collapsible Navigation Sidebar */}
      <Sidebar />

      {/* Main Content Body */}
      <div className="flex flex-1 flex-col min-w-0 h-full overflow-hidden">
        {/* Top Header Navigation */}
        <header className="relative z-30 flex h-20 shrink-0 items-center justify-between border-b border-slate-800 bg-[#111827]/90 px-6 backdrop-blur-md">
          {/* Left: Breadcrumbs & Page Titles */}
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
              <Shield className="h-3.5 w-3.5 text-blue-500" />
              <span>{getBreadcrumb()}</span>
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">{title}</h1>
          </div>

          {/* Center: Global Search Input Button */}
          <div className="hidden md:flex flex-1 max-w-md mx-8">
            <button
              onClick={() => setGlobalSearchOpen(true)}
              className="w-full flex items-center justify-between rounded-[10px] border border-slate-700/80 bg-slate-900/90 px-4 py-2 text-xs text-slate-400 hover:border-slate-600 hover:bg-slate-800 transition"
            >
              <div className="flex items-center gap-2.5">
                <Search className="h-4 w-4 text-slate-400" />
                <span>Search Guard... Site... Incident...</span>
              </div>
              <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-400 border border-slate-700">
                Ctrl + K
              </span>
            </button>
          </div>

          {/* Right: Live Ticker, Notifications & User */}
          <div className="flex items-center gap-4">
            {/* Live Clock & Status */}
            <div className="hidden lg:flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-1.5 text-xs">
              <div className="flex items-center gap-2 border-r border-slate-800 pr-3">
                <Clock className="h-3.5 w-3.5 text-blue-400" />
                <div className="flex flex-col">
                  <span className="font-mono font-bold text-white leading-none">{formatClock(now)}</span>
                  <span className="text-[10px] text-slate-400 mt-0.5">{formatDate(now)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
                <span className="font-semibold text-emerald-400">Telemetry Live</span>
              </div>
            </div>

            {/* Notifications Dropdown */}
            <div className="relative">
              <button
                onClick={openNotifications}
                className="relative rounded-xl border border-slate-700/80 bg-slate-800/80 p-2.5 text-slate-300 hover:border-slate-600 hover:bg-slate-700 hover:text-white transition"
                title="Notifications Alert Center"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{unreadCount > 99 ? '99+' : unreadCount}</span>}
              </button>

              {notificationsOpen && (
                <div className="fixed left-3 right-3 top-16 rounded-2xl border border-slate-700 bg-[#1E293B] p-4 shadow-2xl shadow-slate-950 z-50 sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-3 sm:w-[min(20rem,calc(100vw-2rem))]">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Live Alerts</span>
                    <button
                      onClick={() => setNotificationsOpen(false)}
                      className="text-slate-400 hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-3 max-h-[min(60vh,18rem)] space-y-2 overflow-y-auto custom-scrollbar">
                    {liveEvents.length === 0 && <p className="py-6 text-center text-xs text-slate-500">No new alerts.</p>}
                    {liveEvents.slice(0, 8).map((ev) => (
                      <div key={ev.id} className="flex items-start gap-2.5 p-2 rounded-xl bg-slate-900/60 text-xs border border-slate-800">
                        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-medium text-white">{ev.text}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{ev.time}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 border-t border-slate-800 pt-2 text-center">
                    <Link
                      to="/incidents"
                      onClick={() => setNotificationsOpen(false)}
                      className="text-xs font-semibold text-blue-400 hover:underline"
                    >
                      View All Incidents →
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Profile Avatar Quick Info */}
            <Link
              to="/profile"
              className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-1.5 pr-3 hover:border-slate-700 transition"
            >
              <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white text-xs shadow-md">
                {profile?.name ? profile.name.charAt(0) : 'S'}
              </div>
              <div className="hidden sm:flex flex-col">
                <span className="text-xs font-semibold text-white leading-tight">
                  {profile?.name || 'Supervisor Admin'}
                </span>
                <span className="text-[10px] text-slate-400">Command HQ</span>
              </div>
            </Link>

            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </div>
        </header>

        {/* Page Content Scroll View */}
        <main className="custom-scrollbar flex-1 overflow-y-auto p-6 lg:p-8">
          {children}
        </main>
      </div>

      {/* Global Overlays */}
      <GlobalSearchModal />
      <GuardDetailDrawer />
      <ToastContainer />
    </div>
  );
}
