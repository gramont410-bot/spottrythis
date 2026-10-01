import React, { useMemo } from 'react';
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

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === 'function') return toDate(value.toDate());
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizedKey(value, fallback) {
  return String(value || fallback).trim().toLowerCase().replace(/\s+/g, ' ');
}

export default function Analytics() {
  const { guards = [], sites = [], patrols = [], attendance = [], checkpointLogs = [], devices = [] } = useSpot();

  const metrics = useMemo(() => {
    const completedDurations = patrols
      .filter((patrol) => patrol.status === 'Completed')
      .map((patrol) => {
        if (Number.isFinite(Number(patrol.durationMinutes))) return Number(patrol.durationMinutes);
        const startedAt = toDate(patrol.startedAt);
        const completedAt = toDate(patrol.completedAt);
        return startedAt && completedAt ? Math.max(0, (completedAt - startedAt) / 60000) : null;
      })
      .filter((duration) => duration !== null && Number.isFinite(duration));

    const delayedDurations = patrols
      .filter((patrol) => patrol.startedLate === true || ['Late', 'Delayed'].includes(patrol.status))
      .map((patrol) => {
        const scheduledAt = toDate(patrol.scheduledAt);
        const startedAt = toDate(patrol.startedAt);
        return scheduledAt && startedAt ? Math.max(0, (startedAt - scheduledAt) / 60000) : Number(patrol.delayMinutes);
      })
      .filter((delay) => Number.isFinite(delay));

    const verifiedScans = checkpointLogs.filter((log) => log.verified === true || log.locationVerified === true).length;
    const gpsAccuracies = guards.map((guard) => Number.parseFloat(guard.gpsAccuracy)).filter(Number.isFinite);

    return {
      averageDuration: completedDurations.length ? Math.round(completedDurations.reduce((sum, value) => sum + value, 0) / completedDurations.length) : 0,
      averageDelay: delayedDurations.length ? Number((delayedDurations.reduce((sum, value) => sum + value, 0) / delayedDurations.length).toFixed(1)) : 0,
      attendanceRate: attendance.length ? Number((attendance.filter((record) => ['Present', 'Face Enrolled'].includes(record.status)).length / attendance.length * 100).toFixed(1)) : 0,
      faceRate: attendance.length ? Number((attendance.filter((record) => record.faceVerified === true).length / attendance.length * 100).toFixed(1)) : 0,
      offlineSessions: devices.filter((device) => !device.lastActive).length,
      syncRate: devices.length ? Number((devices.filter((device) => device.lastActive).length / devices.length * 100).toFixed(1)) : 0,
      qrRate: checkpointLogs.length ? Number((verifiedScans / checkpointLogs.length * 100).toFixed(1)) : 0,
      gpsAccuracy: gpsAccuracies.length ? Number((gpsAccuracies.reduce((sum, value) => sum + value, 0) / gpsAccuracies.length).toFixed(1)) : 0
    };
  }, [attendance, checkpointLogs, devices, guards, patrols]);

  const guardRows = useMemo(() => guards.map((guard) => {
    const guardPatrols = patrols.filter((patrol) => (
      String(patrol.guardId || '') === String(guard.id || '') || normalizedKey(patrol.guardName, '') === normalizedKey(guard.name, '')
    ));
    const completed = guardPatrols.filter((patrol) => patrol.status === 'Completed').length;
    const missed = guardPatrols.filter((patrol) => patrol.status === 'Missed').length;
    const attendanceRecords = attendance.filter((record) => (
      String(record.guardId || '') === String(guard.id || '') || normalizedKey(record.guardName, '') === normalizedKey(guard.name, '')
    ));
    const attendanceRate = attendanceRecords.length
      ? Math.round(attendanceRecords.filter((record) => ['Present', 'Face Enrolled'].includes(record.status)).length / attendanceRecords.length * 100)
      : Number(guard.attendanceRate) || 0;

    return {
      ...guard,
      completed,
      missed,
      total: guardPatrols.length,
      score: guardPatrols.length ? Math.round(completed / guardPatrols.length * 100) : 0,
      attendanceRate
    };
  }).sort((a, b) => b.score - a.score || b.completed - a.completed), [attendance, guards, patrols]);

  const siteRows = useMemo(() => sites.map((site) => {
    const sitePatrols = patrols.filter((patrol) => (
      String(patrol.siteId || '') === String(site.id || '') || normalizedKey(patrol.siteName, '') === normalizedKey(site.name, '')
    ));
    const completed = sitePatrols.filter((patrol) => patrol.status === 'Completed').length;
    const missed = sitePatrols.filter((patrol) => patrol.status === 'Missed').length;
    const guardCount = new Set(sitePatrols.map((patrol) => patrol.guardId || patrol.guardName).filter(Boolean)).size;

    return { ...site, completed, missed, total: sitePatrols.length, guardCount, compliance: sitePatrols.length ? Math.round(completed / sitePatrols.length * 100) : 0 };
  }).sort((a, b) => b.compliance - a.compliance || b.total - a.total), [patrols, sites]);

  const kpis = [
    { label: 'Average Patrol Time', val: `${metrics.averageDuration}m`, sub: `${patrols.filter((patrol) => patrol.status === 'Completed').length} completed records`, icon: Clock, color: 'text-blue-400' },
    { label: 'Average Delay', val: `${metrics.averageDelay}m`, sub: `${patrols.filter((patrol) => patrol.startedLate === true || ['Late', 'Delayed'].includes(patrol.status)).length} delayed records`, icon: Clock, color: 'text-emerald-400' },
    { label: 'Average Attendance', val: `${metrics.attendanceRate}%`, sub: `${attendance.length} attendance records`, icon: UserCheck, color: 'text-emerald-400' },
    { label: 'Face Enrollment Rate', val: `${metrics.faceRate}%`, sub: `${attendance.filter((record) => record.faceVerified === true).length} verified records`, icon: ShieldCheck, color: 'text-blue-400' },
    { label: 'Offline Sessions', val: `${metrics.offlineSessions}`, sub: `${devices.length} registered devices`, icon: WifiOff, color: 'text-amber-400' },
    { label: 'Synchronization Success', val: `${metrics.syncRate}%`, sub: `${devices.filter((device) => device.lastActive).length} active devices`, icon: RefreshCw, color: 'text-emerald-400' },
    { label: 'QR Completion Rate', val: `${metrics.qrRate}%`, sub: `${checkpointLogs.length} checkpoint scans`, icon: QrCode, color: 'text-blue-400' },
    { label: 'GPS Telemetry Accuracy', val: `${metrics.gpsAccuracy}m`, sub: `${guards.filter((guard) => Number.isFinite(Number.parseFloat(guard.gpsAccuracy))).length} guard readings`, icon: MapPin, color: 'text-emerald-400' }
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
              {guardRows.map((g, idx) => (
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
                    <div className="font-bold text-emerald-400">{g.score}% Patrol Score</div>
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
              {siteRows.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-900/40 text-xs"
                >
                  <div>
                    <div className="font-bold text-white">{s.name}</div>
                    <div className="text-[10px] text-slate-400">{s.client} • {s.type}</div>
                  </div>
                  <div className="text-right">
                    <span className={s.total ? 'badge-success text-[10px]' : 'badge-neutral text-[10px]'}>{s.total ? `${s.compliance}% Compliance` : 'No Patrol Data'}</span>
                    <div className="text-[10px] text-slate-400 mt-1">{s.guardCount} Guards • {s.total} Patrols • {s.missed} Missed</div>
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
