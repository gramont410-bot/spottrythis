import React, { useMemo, useState } from 'react';
import Layout from '../components/Layout';
import GuardAvatar from '../components/GuardAvatar';
import { useSpot } from '../context/SpotContext';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Filter,
  MapPin,
  PlayCircle,
  QrCode,
  Search,
  ShieldCheck,
  X
} from 'lucide-react';

const STATUS_ORDER = ['In Progress', 'Late', 'Scheduled', 'Completed', 'Missed'];

function normalizeStatus(value) {
  const raw = String(value || '').trim();
  const status = raw.toUpperCase().replace(/[\s-]+/g, '_');

  if (['IN_PROGRESS', 'ACTIVE', 'ON_PATROL'].includes(status)) return 'In Progress';
  if (['COMPLETED', 'COMPLETE'].includes(status)) return 'Completed';
  if (['SCHEDULED', 'PENDING'].includes(status)) return 'Scheduled';
  if (['LATE', 'DELAYED'].includes(status)) return 'Late';
  if (['MISSED'].includes(status)) return 'Missed';

  if (!raw) return 'Scheduled';

  return raw
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function toDate(value) {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value?.toDate === 'function') {
    const converted = value.toDate();
    return converted instanceof Date && !Number.isNaN(converted.getTime()) ? converted : null;
  }

  if (typeof value === 'number') {
    const converted = new Date(value);
    return Number.isNaN(converted.getTime()) ? null : converted;
  }

  if (typeof value === 'string') {
    const converted = new Date(value);
    return Number.isNaN(converted.getTime()) ? null : converted;
  }

  return null;
}

function formatTime(value, fallback = '—') {
  const date = toDate(value);
  if (!date) return fallback;

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDateTime(value, fallback = '—') {
  const date = toDate(value);
  if (!date) return fallback;

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function minutesBetween(start, end) {
  const startDate = toDate(start);
  const endDate = toDate(end);

  if (!startDate || !endDate) return null;

  const minutes = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
  return minutes;
}

function getStatusStyle(status) {
  switch (status) {
    case 'In Progress':
      return {
        badge: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400',
        dot: 'bg-emerald-400',
        progress: 'bg-emerald-500',
        border: 'hover:border-emerald-500/50'
      };
    case 'Completed':
      return {
        badge: 'border-blue-500/30 bg-blue-500/15 text-blue-300',
        dot: 'bg-blue-400',
        progress: 'bg-blue-500',
        border: 'hover:border-blue-500/50'
      };
    case 'Late':
      return {
        badge: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
        dot: 'bg-amber-400',
        progress: 'bg-amber-500',
        border: 'hover:border-amber-500/50'
      };
    case 'Missed':
      return {
        badge: 'border-rose-500/30 bg-rose-500/15 text-rose-300',
        dot: 'bg-rose-400',
        progress: 'bg-rose-500',
        border: 'hover:border-rose-500/50'
      };
    default:
      return {
        badge: 'border-slate-600 bg-slate-700/40 text-slate-300',
        dot: 'bg-slate-400',
        progress: 'bg-slate-500',
        border: 'hover:border-slate-600'
      };
  }
}

function patrolSiteKey(patrol) {
  return patrol.siteId || patrol.siteName || 'unknown-site';
}

function getPatrolTimeLabel(patrol) {
  return (
    patrol.patrolTime ||
    patrol.scheduledTime ||
    patrol.routeName ||
    patrol.startTime ||
    'Patrol'
  );
}

function normalizeCheckpointList(patrol) {
  if (Array.isArray(patrol.checkpoints) && patrol.checkpoints.length > 0) {
    return patrol.checkpoints.map((checkpoint, index) => ({
      id: checkpoint.id || checkpoint.checkpointId || `checkpoint-${index}`,
      name: checkpoint.name || checkpoint.checkpointName || `Checkpoint ${index + 1}`,
      status: normalizeStatus(checkpoint.status || (checkpoint.scannedAt ? 'Completed' : 'Scheduled')),
      scannedAt: checkpoint.scannedAt || checkpoint.timestamp || checkpoint.completedAt || null,
      method: checkpoint.method || 'QR checkpoint'
    }));
  }

  const ids = Array.isArray(patrol.requiredCheckpointIds) ? patrol.requiredCheckpointIds : [];
  const names = Array.isArray(patrol.requiredCheckpointNames) ? patrol.requiredCheckpointNames : [];
  const completedIds = new Set(
    Array.isArray(patrol.completedCheckpointIds) ? patrol.completedCheckpointIds : []
  );
  const scans = Array.isArray(patrol.checkpointScans) ? patrol.checkpointScans : [];

  return ids.map((id, index) => {
    const matchingScan = scans.find(
      (scan) =>
        scan?.checkpointId === id ||
        scan?.id === id ||
        scan?.checkpointName === names[index]
    );

    return {
      id,
      name: names[index] || matchingScan?.checkpointName || `Checkpoint ${index + 1}`,
      status: completedIds.has(id) || matchingScan ? 'Completed' : 'Scheduled',
      scannedAt:
        matchingScan?.scannedAt ||
        matchingScan?.timestamp ||
        matchingScan?.completedAt ||
        null,
      method: matchingScan?.method || 'QR checkpoint'
    };
  });
}

function normalizePatrol(patrol) {
  const status = normalizeStatus(patrol.status);

  const totalCount = Number(
    patrol.totalCount ??
      patrol.totalCheckpoints ??
      patrol.requiredCheckpointIds?.length ??
      patrol.checkpoints?.length ??
      0
  );

  const completedCount = Number(
    patrol.completedCount ??
      patrol.completedCheckpoints ??
      patrol.completedCheckpointIds?.length ??
      patrol.checkpoints?.filter((checkpoint) => normalizeStatus(checkpoint.status) === 'Completed')
        .length ??
      0
  );

  const safeTotal = Number.isFinite(totalCount) ? Math.max(0, totalCount) : 0;
  const safeCompleted = Number.isFinite(completedCount)
    ? Math.min(Math.max(0, completedCount), safeTotal || completedCount)
    : 0;

  const progressPct =
    safeTotal > 0
      ? Math.min(100, Math.round((safeCompleted / safeTotal) * 100))
      : Number(patrol.progressPct || 0);

  const remainingCount =
    safeTotal > 0
      ? Math.max(0, safeTotal - safeCompleted)
      : Number(patrol.remainingCount || 0);

  const startedAt = patrol.startedAt || patrol.startTimestamp || null;
  const completedAt = patrol.completedAt || patrol.endTimestamp || null;

  const durationMinutes =
    Number.isFinite(Number(patrol.durationMinutes)) && patrol.durationMinutes !== ''
      ? Number(patrol.durationMinutes)
      : minutesBetween(startedAt, completedAt);

  const elapsedMinutes =
    status === 'In Progress' && startedAt
      ? minutesBetween(startedAt, new Date())
      : null;

  const routeName =
    patrol.routeName && patrol.routeName !== 'Patrol Route'
      ? patrol.routeName
      : `${patrol.patrolTime || patrol.scheduledTime || 'Scheduled'} Patrol`;

  return {
    ...patrol,
    guardName: patrol.guardName || 'Guard',
    siteName: patrol.siteName || 'Site',
    routeName,
    status,
    totalCount: safeTotal,
    completedCount: safeCompleted,
    progressPct: Math.min(100, Math.max(0, Number(progressPct) || 0)),
    remainingCount: Math.max(0, Number(remainingCount) || 0),
    etaMinutes: Math.max(0, Number(patrol.etaMinutes || 0)),
    durationMinutes,
    elapsedMinutes,
    startedAt,
    completedAt,
    checkpoints: normalizeCheckpointList(patrol)
  };
}

function SummaryCard({ label, value, icon: Icon, tone = 'slate' }) {
  const tones = {
    emerald: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400',
    blue: 'border-blue-500/20 bg-blue-500/5 text-blue-400',
    amber: 'border-amber-500/20 bg-amber-500/5 text-amber-400',
    rose: 'border-rose-500/20 bg-rose-500/5 text-rose-400',
    slate: 'border-slate-700 bg-slate-900/30 text-slate-300'
  };

  return (
    <div className={`rounded-xl border p-3 ${tones[tone] || tones.slate}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {label}
          </div>
          <div className="mt-1 text-xl font-black text-white">{value}</div>
        </div>
        <div className="rounded-lg bg-slate-950/40 p-2">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function PatrolCard({ patrol, onOpen }) {
  const style = getStatusStyle(patrol.status);
  const completed = patrol.status === 'Completed';
  const inProgress = patrol.status === 'In Progress';
  const legacyEmpty = completed && patrol.totalCount === 0;

  let thirdLabel = 'Scheduled';
  let thirdValue = patrol.patrolTime || patrol.scheduledTime || '—';

  if (inProgress) {
    thirdLabel = patrol.etaMinutes > 0 ? 'ETA' : 'Elapsed';
    thirdValue =
      patrol.etaMinutes > 0
        ? `${patrol.etaMinutes}m`
        : patrol.elapsedMinutes !== null
          ? `${patrol.elapsedMinutes}m`
          : 'Live';
  }

  if (completed) {
    thirdLabel = 'Duration';
    thirdValue =
      patrol.durationMinutes !== null && patrol.durationMinutes !== undefined
        ? `${patrol.durationMinutes}m`
        : '—';
  }

  if (patrol.status === 'Missed') {
    thirdLabel = 'Scheduled';
    thirdValue = patrol.patrolTime || patrol.scheduledTime || '—';
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(patrol)}
      className={`card-spot flex w-full cursor-pointer flex-col justify-between text-left transition-all duration-200 hover:-translate-y-1 ${style.border}`}
    >
      <div>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">
              {patrol.siteName}
            </div>
            <div className="mt-1 truncate text-sm font-black text-white">
              {getPatrolTimeLabel(patrol)}
            </div>
          </div>

          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${style.badge}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
            {patrol.status}
          </span>
        </div>

        <div className="mb-4 flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/35 p-3">
          <GuardAvatar photo={patrol.guardPhoto} name={patrol.guardName} />
          <div className="min-w-0">
            <h4 className="truncate text-sm font-bold text-white">{patrol.guardName}</h4>
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
              <MapPin className="h-3 w-3" />
              <span className="truncate">{patrol.siteName}</span>
            </div>
          </div>
        </div>

        {patrol.startedLate && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[10px] font-semibold text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            Patrol started late
          </div>
        )}

        {legacyEmpty && (
          <div className="mb-3 rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-[10px] text-slate-400">
            Legacy patrol record — no checkpoint totals were recorded.
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Checkpoint Progress</span>
            <span className="font-bold text-white">{patrol.progressPct}%</span>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-950">
            <div
              className={`h-full rounded-full transition-all duration-500 ${style.progress}`}
              style={{ width: `${patrol.progressPct}%` }}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2 text-center">
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <div className="text-[9px] uppercase tracking-wide text-slate-500">Checkpoints</div>
              <div className="mt-1 text-xs font-black text-white">
                {patrol.completedCount}/{patrol.totalCount}
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <div className="text-[9px] uppercase tracking-wide text-slate-500">Remaining</div>
              <div className="mt-1 text-xs font-black text-amber-300">
                {patrol.remainingCount}
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <div className="text-[9px] uppercase tracking-wide text-slate-500">{thirdLabel}</div>
              <div className="mt-1 text-xs font-black text-emerald-300">{thirdValue}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3 text-xs font-semibold text-blue-400">
        <span>{inProgress ? 'View Live Patrol' : 'View Patrol Details'}</span>
        <span>→</span>
      </div>
    </button>
  );
}

export default function PatrolOperations() {
  const { patrols = [] } = useSpot();

  const [selectedPatrol, setSelectedPatrol] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [siteFilter, setSiteFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [hideLegacy, setHideLegacy] = useState(true);

  const normalizedPatrols = useMemo(
    () => patrols.map(normalizePatrol),
    [patrols]
  );

  const siteOptions = useMemo(() => {
    const byKey = new Map();

    normalizedPatrols.forEach((patrol) => {
      const key = patrolSiteKey(patrol);
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          name: patrol.siteName || 'Unknown Site'
        });
      }
    });

    return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [normalizedPatrols]);

  const siteScopedPatrols = useMemo(
    () =>
      normalizedPatrols.filter(
        (patrol) => siteFilter === 'all' || patrolSiteKey(patrol) === siteFilter
      ),
    [normalizedPatrols, siteFilter]
  );

  const stats = useMemo(() => {
    const count = (status) =>
      siteScopedPatrols.filter((patrol) => patrol.status === status).length;

    return {
      inProgress: count('In Progress'),
      scheduled: count('Scheduled'),

      // Count both:
      // 1) patrols that are currently LATE and have not started
      // 2) patrols that started late but are now IN PROGRESS / COMPLETED
      late: siteScopedPatrols.filter(
        (patrol) =>
          patrol.status === 'Late' ||
          patrol.startedLate === true
      ).length,

      completed: count('Completed'),
      missed: count('Missed')
    };
  }, [siteScopedPatrols]);

  const visiblePatrols = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return siteScopedPatrols
      .filter((patrol) => {
        if (statusFilter !== 'all') {
          if (statusFilter === 'Late') {
            if (
              patrol.status !== 'Late' &&
              patrol.startedLate !== true
            ) {
              return false;
            }
          } else if (patrol.status !== statusFilter) {
            return false;
          }
        }

        if (hideLegacy && patrol.status === 'Completed' && patrol.totalCount === 0) {
          return false;
        }

        if (!query) return true;

        return [
          patrol.guardName,
          patrol.siteName,
          patrol.routeName,
          patrol.patrolTime,
          patrol.scheduledTime,
          patrol.id
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      })
      .sort((a, b) => {
        const statusRank =
          STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);

        if (statusRank !== 0) return statusRank;

        const aTime = toDate(a.startedAt || a.scheduledAt || a.completedAt)?.getTime() || 0;
        const bTime = toDate(b.startedAt || b.scheduledAt || b.completedAt)?.getTime() || 0;

        return bTime - aTime;
      });
  }, [siteScopedPatrols, statusFilter, searchQuery, hideLegacy]);

  const groupedPatrols = useMemo(() => {
    const groups = new Map();

    visiblePatrols.forEach((patrol) => {
      const key = patrolSiteKey(patrol);

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          siteName: patrol.siteName || 'Unknown Site',
          patrols: []
        });
      }

      groups.get(key).patrols.push(patrol);
    });

    return Array.from(groups.values()).sort((a, b) =>
      a.siteName.localeCompare(b.siteName)
    );
  }, [visiblePatrols]);

  const selected = selectedPatrol ? normalizePatrol(selectedPatrol) : null;

  return (
    <Layout
      title="Patrol Operations & Route Control"
      subtitle="Live patrol progress, checkpoint completion, late starts, missed patrols and site-level monitoring"
    >
      <div className="space-y-6">
        {/* Site-aware operational summary */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <SummaryCard
            label="In Progress"
            value={stats.inProgress}
            icon={PlayCircle}
            tone="emerald"
          />
          <SummaryCard
            label="Scheduled"
            value={stats.scheduled}
            icon={Clock}
            tone="slate"
          />
          <SummaryCard
            label="Late"
            value={stats.late}
            icon={AlertTriangle}
            tone="amber"
          />
          <SummaryCard
            label="Completed"
            value={stats.completed}
            icon={CheckCircle2}
            tone="blue"
          />
          <SummaryCard
            label="Missed"
            value={stats.missed}
            icon={ShieldCheck}
            tone="rose"
          />
        </div>

        {/* Search + site + status controls */}
        <div className="card-spot p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search guard, site, patrol time, or patrol ID..."
                className="input-spot w-full pl-10"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:flex xl:w-auto">
              <div className="relative min-w-[190px]">
                <MapPin className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                <select
                  value={siteFilter}
                  onChange={(event) => setSiteFilter(event.target.value)}
                  className="input-spot w-full appearance-none pl-9 pr-8"
                >
                  <option value="all">All Sites</option>
                  {siteOptions.map((site) => (
                    <option key={site.key} value={site.key}>
                      {site.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative min-w-[170px]">
                <Filter className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="input-spot w-full appearance-none pl-9 pr-8"
                >
                  <option value="all">All Statuses</option>
                  {STATUS_ORDER.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-2 border-t border-slate-800 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-[11px] text-slate-500">
              Showing <span className="font-bold text-slate-300">{visiblePatrols.length}</span>{' '}
              patrol{visiblePatrols.length === 1 ? '' : 's'}
              {siteFilter !== 'all' && ' for the selected site'}
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-400">
              <input
                type="checkbox"
                checked={hideLegacy}
                onChange={(event) => setHideLegacy(event.target.checked)}
                className="h-3.5 w-3.5 accent-blue-600"
              />
              Hide legacy completed records with 0/0 checkpoints
            </label>
          </div>
        </div>

        {/* Site-grouped patrol monitoring */}
        {groupedPatrols.length > 0 ? (
          <div className="space-y-7">
            {groupedPatrols.map((group) => {
              const activeCount = group.patrols.filter(
                (patrol) => patrol.status === 'In Progress'
              ).length;

              const completedCount = group.patrols.filter(
                (patrol) => patrol.status === 'Completed'
              ).length;

              return (
                <section key={group.key} className="space-y-3">
                  <div className="flex flex-col gap-2 border-b border-slate-800 pb-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-blue-400" />
                        <h3 className="text-sm font-black text-white">{group.siteName}</h3>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {group.patrols.length} patrol{group.patrols.length === 1 ? '' : 's'} shown
                      </p>
                    </div>

                    <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-wider">
                      <span className="text-emerald-400">{activeCount} Active</span>
                      <span className="text-blue-400">{completedCount} Completed</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-3">
                    {group.patrols.map((patrol) => (
                      <PatrolCard
                        key={patrol.id}
                        patrol={patrol}
                        onOpen={setSelectedPatrol}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="card-spot flex min-h-[260px] flex-col items-center justify-center p-8 text-center">
            <QrCode className="mb-3 h-9 w-9 text-slate-600" />
            <h3 className="text-sm font-bold text-white">No patrols match these filters</h3>
            <p className="mt-1 max-w-md text-xs text-slate-500">
              Try another site, status, or search term. If legacy records are hidden, you can
              also turn that filter off.
            </p>
          </div>
        )}

        {/* Patrol detail / timeline */}
        {selected && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setSelectedPatrol(null);
              }
            }}
          >
            <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-700 bg-[#1E293B] shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-slate-800 p-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-black text-white">{getPatrolTimeLabel(selected)}</h3>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${
                        getStatusStyle(selected.status).badge
                      }`}
                    >
                      {selected.status}
                    </span>
                  </div>

                  <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                    <MapPin className="h-3.5 w-3.5" />
                    {selected.siteName}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedPatrol(null)}
                  className="rounded-xl border border-slate-700 bg-slate-800 p-2 text-slate-400 transition hover:text-white"
                  aria-label="Close patrol details"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="max-h-[78vh] space-y-5 overflow-y-auto p-5 custom-scrollbar">
                {/* Guard + progress */}
                <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
                  <div className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
                    <div className="flex items-center gap-3">
                      <GuardAvatar photo={selected.guardPhoto} name={selected.guardName} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-white">
                          {selected.guardName}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          Guard ID: {selected.guardId || 'Not available'}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded-lg bg-slate-950/50 p-3">
                        <div className="text-slate-500">Scheduled</div>
                        <div className="mt-1 font-bold text-white">
                          {selected.patrolTime || selected.scheduledTime || '—'}
                        </div>
                      </div>
                      <div className="rounded-lg bg-slate-950/50 p-3">
                        <div className="text-slate-500">Started</div>
                        <div className="mt-1 font-bold text-white">
                          {selected.startTime ||
                            formatTime(selected.startedAt, 'Not started')}
                        </div>
                      </div>
                      <div className="rounded-lg bg-slate-950/50 p-3">
                        <div className="text-slate-500">Completed</div>
                        <div className="mt-1 font-bold text-white">
                          {formatTime(selected.completedAt, '—')}
                        </div>
                      </div>
                      <div className="rounded-lg bg-slate-950/50 p-3">
                        <div className="text-slate-500">Duration</div>
                        <div className="mt-1 font-bold text-white">
                          {selected.durationMinutes !== null &&
                          selected.durationMinutes !== undefined
                            ? `${selected.durationMinutes} min`
                            : selected.elapsedMinutes !== null
                              ? `${selected.elapsedMinutes} min elapsed`
                              : '—'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Patrol Completion
                        </div>
                        <div className="mt-1 text-2xl font-black text-white">
                          {selected.progressPct}%
                        </div>
                      </div>

                      <div className="rounded-xl bg-slate-950/50 p-3 text-right">
                        <div className="text-[10px] text-slate-500">Checkpoints</div>
                        <div className="mt-1 text-sm font-black text-white">
                          {selected.completedCount}/{selected.totalCount}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-950">
                      <div
                        className={`h-full rounded-full ${
                          getStatusStyle(selected.status).progress
                        }`}
                        style={{ width: `${selected.progressPct}%` }}
                      />
                    </div>

                    {selected.startedLate && (
                      <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-300">
                        <AlertTriangle className="h-4 w-4" />
                        This patrol was started late.
                      </div>
                    )}
                  </div>
                </div>

                {/* Checkpoint timeline */}
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
                      Checkpoint Timeline
                    </h4>
                    <span className="text-[10px] text-slate-500">
                      {selected.completedCount} of {selected.totalCount} completed
                    </span>
                  </div>

                  {selected.checkpoints.length > 0 ? (
                    <div className="space-y-2">
                      {selected.checkpoints.map((checkpoint, index) => {
                        const completed = checkpoint.status === 'Completed';

                        return (
                          <div
                            key={checkpoint.id}
                            className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/40 p-3"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <div
                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${
                                  completed
                                    ? 'bg-emerald-500 text-white'
                                    : 'border border-slate-700 bg-slate-800 text-slate-400'
                                }`}
                              >
                                {completed ? (
                                  <CheckCircle2 className="h-4 w-4" />
                                ) : (
                                  index + 1
                                )}
                              </div>

                              <div className="min-w-0">
                                <div className="truncate text-xs font-bold text-white">
                                  {checkpoint.name}
                                </div>
                                <div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500">
                                  <QrCode className="h-3 w-3" />
                                  {checkpoint.method}
                                </div>
                              </div>
                            </div>

                            <div className="shrink-0 text-right">
                              <div
                                className={`text-[10px] font-bold ${
                                  completed ? 'text-emerald-400' : 'text-slate-500'
                                }`}
                              >
                                {completed ? 'COMPLETED' : 'PENDING'}
                              </div>
                              <div className="mt-0.5 text-[10px] text-slate-500">
                                {checkpoint.scannedAt
                                  ? formatDateTime(checkpoint.scannedAt)
                                  : 'Awaiting scan'}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/25 p-6 text-center">
                      <QrCode className="mx-auto h-7 w-7 text-slate-600" />
                      <div className="mt-2 text-xs font-semibold text-slate-300">
                        No checkpoint timeline is available
                      </div>
                      <div className="mt-1 text-[10px] text-slate-500">
                        This is usually an older patrol record that did not save checkpoint details.
                      </div>
                    </div>
                  )}
                </div>

                {/* Technical reference kept out of the main cards */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-slate-600">
                    Patrol Record Reference
                  </div>
                  <div className="mt-1 break-all font-mono text-[10px] text-slate-500">
                    {selected.id}
                  </div>
                </div>
              </div>

              <div className="flex justify-end border-t border-slate-800 p-4">
                <button
                  type="button"
                  onClick={() => setSelectedPatrol(null)}
                  className="btn-secondary text-xs"
                >
                  Close Window
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
