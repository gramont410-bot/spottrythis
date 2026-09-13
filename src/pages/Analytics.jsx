import React from 'react';
import Layout from '../components/Layout';
import { useSpot } from '../context/SpotContext';
import {
  BarChart3,
  Clock,
  UserCheck,
  ShieldCheck,
  WifiOff,
  RefreshCw,
  QrCode,
  MapPin,
  Award,
  Building2,
  TrendingUp,
  ChevronRight
} from 'lucide-react';

export default function Analytics() {
  const { stats, guards, sites } = useSpot();

  const kpis = [
    { label: 'Average Patrol Time', val: `${stats.avgPatrolDurationMinutes}m`, sub: '-2.1m vs last week', icon: Clock, color: 'text-blue-400' },
    { label: 'Average Delay', val: `${stats.avgDelayMinutes}m`, sub: 'Within 5m tolerance', icon: Clock, color: 'text-emerald-400' },
    { label: 'Average Attendance', val: `${stats.attendanceRate}%`, sub: '99.2% Target met', icon: UserCheck, color: 'text-emerald-400' },
    { label: 'Face Enrollment Rate', val: `${stats.faceVerificationSuccessRate}%`, sub: 'Enrolled guard profiles', icon: ShieldCheck, color: 'text-blue-400' },
    { label: 'Offline Sessions', val: `${stats.offlineSessionsCount}`, sub: 'Cached telemetry sync', icon: WifiOff, color: 'text-amber-400' },
    { label: 'Synchronization Success', val: `${stats.synchronizationSuccessRate}%`, sub: 'Cloud DB realtime', icon: RefreshCw, color: 'text-emerald-400' },
    { label: 'QR Completion Rate', val: `${stats.qrCompletionRate}%`, sub: 'Verified checkpoint scans', icon: QrCode, color: 'text-blue-400' },
    { label: 'GPS Telemetry Accuracy', val: `${stats.gpsAccuracyMeters}m`, sub: 'High precision lock', icon: MapPin, color: 'text-emerald-400' }
  ];

  return (
    <Layout
      title="Executive Operations Analytics Dashboard"
      subtitle="High-Impact Guard Patrol KPIs, Attendance Performance Rankings & Trend Analysis"
    >
      <div className="space-y-6">
        {/* 8 Executive KPI Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-4">
          {kpis.map((kpi, idx) => {
            const Icon = kpi.icon;
            return (
              <div key={idx} className="card-spot flex flex-col justify-between p-4 hover:-translate-y-1 transition">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{kpi.label}</span>
                  <Icon className={`h-4 w-4 ${kpi.color}`} />
                </div>
                <div className="mt-3 text-2xl font-bold text-white tracking-tight">{kpi.val}</div>
                <div className="mt-1 text-[11px] text-slate-500 font-medium">{kpi.sub}</div>
              </div>
            );
          })}
        </div>

        {/* Charts & Rankings Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Guard Rankings Table (6 cols) */}
          <div className="lg:col-span-6 card-spot">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Award className="h-4 w-4 text-amber-400" /> Guard Operational Performance Ranking
              </h3>
              <span className="text-xs text-slate-400 font-mono">Top Guard Score</span>
            </div>

            <div className="space-y-3">
              {guards.map((g, idx) => (
                <div
                  key={g.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-900/40 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-6 w-6 rounded-full flex items-center justify-center font-bold text-[10px] ${
                        idx === 0
                          ? 'bg-amber-400 text-slate-950 font-extrabold'
                          : idx === 1
                          ? 'bg-slate-300 text-slate-950 font-bold'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      #{idx + 1}
                    </div>
                    <img src={g.photo} alt={g.name} className="h-8 w-8 rounded-full object-cover" />
                    <div>
                      <div className="font-bold text-white">{g.name}</div>
                      <div className="text-[10px] text-slate-400">{g.siteName}</div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-bold text-emerald-400">{g.performanceRating}% Score</div>
                    <div className="text-[10px] text-slate-400">{g.attendanceRate}% Attendance</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Deployment Site Risk Rankings (6 cols) */}
          <div className="lg:col-span-6 card-spot">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-400" /> Facility Patrol Compliance Ranking
              </h3>
              <span className="text-xs text-blue-400 font-semibold">Active Sector Overview</span>
            </div>

            <div className="space-y-3">
              {sites.map((s, idx) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-900/40 text-xs"
                >
                  <div>
                    <div className="font-bold text-white">{s.name}</div>
                    <div className="text-[10px] text-slate-400">{s.client} • {s.type}</div>
                  </div>
                  <div className="text-right">
                    <span className="badge-success text-[10px]">{s.status}</span>
                    <div className="text-[10px] text-slate-400 mt-1">{s.activeGuardsCount} Guards • {s.checkpointsCount} Checkpoints</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
