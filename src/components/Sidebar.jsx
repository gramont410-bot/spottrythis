import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Radio,
  ShieldAlert,
  Users,
  Building2,
  Briefcase,
  CalendarDays,
  AlertTriangle,
  BarChart3,
  FileSpreadsheet,
  History,
  Settings,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  Shield,
  LogOut,
  Smartphone,
  ScanFace
  ,QrCode
} from 'lucide-react';
import { useSpot } from '../context/SpotContext';
import { useAuth } from '../context/AuthContext';

export default function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useSpot();
  const { logout, profile, role } = useAuth();
  const location = useLocation();

  const navigationGroups = role === 'client'
    ? [
        { label: 'Client Workspace', items: [
          { label: 'Operations Overview', path: '/client', icon: Building2 },
          { label: 'Guard Schedules', path: '/client/schedules', icon: CalendarDays }
        ] },
        { label: 'Account', items: [{ label: 'Profile', path: '/profile', icon: UserCheck }] }
      ]
    : [
        { label: 'Command', items: [
          { label: 'Dashboard', path: '/', icon: LayoutDashboard },
          { label: 'Live Monitoring', path: '/tracking', icon: Radio, badge: 'LIVE' }
        ] },
        { label: 'Field Operations', items: [
          { label: 'Patrol Operations', path: '/routes', icon: ShieldAlert },
          { label: 'Schedules', path: '/schedules', icon: CalendarDays },
          { label: 'Incidents', path: '/incidents', icon: AlertTriangle, badgeColor: 'bg-rose-500/20 text-rose-400' }
        ] },
        { label: 'People & Access', items: [
          { label: 'Guards', path: '/guards', icon: Users },
          { label: 'Face Enrollment', path: '/face-verify', icon: ScanFace },
          { label: 'Devices', path: '/devices', icon: Smartphone }
        ] },
        { label: 'Sites & Clients', items: [
          { label: 'Deployment Sites', path: '/sites', icon: Building2 },
          { label: 'QR Checkpoints', path: '/checkpoints', icon: QrCode, roles: ['superadmin', 'admin'] },
          { label: 'Clients', path: '/clients', icon: Briefcase, roles: ['superadmin', 'admin'] }
        ] },
        { label: 'Intelligence', items: [
          { label: 'Analytics', path: '/analytics', icon: BarChart3 },
          { label: 'Reports', path: '/reports', icon: FileSpreadsheet }
        ] },
        { label: 'Administration', items: [
          { label: 'Audit Logs', path: '/logs', icon: History, roles: ['superadmin'] },
          { label: 'Settings', path: '/settings', icon: Settings, roles: ['superadmin'] },
          { label: 'Profile', path: '/profile', icon: UserCheck }
        ] }
      ].map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.roles || item.roles.includes(role))
      })).filter((group) => group.items.length > 0);

  return (
    <aside
      className={`relative z-40 flex flex-col border-r border-slate-800 bg-[#111827] text-slate-300 transition-all duration-300 ${
        sidebarCollapsed ? 'w-20' : 'w-72'
      }`}
    >
      {/* Brand Header */}
      <div className="flex h-20 items-center justify-between border-b border-slate-800/80 px-4">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 shadow-lg shadow-blue-600/30">
            <Shield className="h-6 w-6 text-white" />
            <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
            </span>
          </div>

          {!sidebarCollapsed && (
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tracking-wider text-white">S.P.O.T</span>
                <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-blue-400 border border-blue-500/30">
                  PRO
                </span>
              </div>
              <span className="truncate text-xs font-medium text-slate-400">
                Security Operations Tracker
              </span>
            </div>
          )}
        </div>

        {/* Collapse Toggle Button */}
        <button
          onClick={toggleSidebar}
          className="hidden md:flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-800/80 text-slate-400 transition hover:bg-slate-700 hover:text-white"
          title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Navigation List */}
      <nav className="custom-scrollbar flex-1 overflow-y-auto px-3 py-4">
        {navigationGroups.map((group) => (
          <div key={group.label} className="mb-5 last:mb-0">
            {!sidebarCollapsed && <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">{group.label}</div>}
            <div className="space-y-1">
              {group.items.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `group relative flex items-center gap-3.5 rounded-[10px] px-3.5 py-3 text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-[#2563EB] text-white shadow-lg shadow-blue-600/25 border border-blue-500/40'
                    : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-100'
                }`
              }
              title={sidebarCollapsed ? item.label : undefined}
            >
              <Icon
                className={`h-5 w-5 shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                  isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                }`}
              />

              {!sidebarCollapsed && (
                <span className="flex-1 truncate tracking-tight">{item.label}</span>
              )}

              {!sidebarCollapsed && item.badge && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider ${
                    item.badgeColor || 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </NavLink>
          );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Sidebar Footer / Supervisor Profile */}
      <div className="border-t border-slate-800/80 p-3">
        {!sidebarCollapsed ? (
          <div className="flex items-center justify-between rounded-[12px] border border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-full bg-slate-700 flex items-center justify-center font-bold text-white text-sm border border-slate-600">
                {profile?.name ? profile.name.charAt(0) : 'S'}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="truncate text-xs font-semibold text-white">
                  {profile?.name || 'Supervisor Admin'}
                </span>
                <span className="truncate text-[11px] text-slate-400">
                  {profile?.role || 'Command Officer'}
                </span>
              </div>
            </div>

            <button
              onClick={logout}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-500/20 hover:text-rose-400"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={logout}
            className="flex h-11 w-full items-center justify-center rounded-[10px] border border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400"
            title="Logout"
          >
            <LogOut className="h-5 w-5" />
          </button>
        )}
      </div>
    </aside>
  );
}
