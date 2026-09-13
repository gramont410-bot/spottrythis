import React from 'react';
import { X, Battery, MapPin, ShieldCheck, Phone, AlertTriangle, Activity, Calendar, Award, CheckCircle } from 'lucide-react';
import { useSpot } from '../context/SpotContext';
import GuardAvatar from './GuardAvatar';

export default function GuardDetailDrawer() {
  const { isGuardDrawerOpen, closeGuardDrawer, selectedGuard, addToast } = useSpot();

  if (!isGuardDrawerOpen || !selectedGuard) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/60 backdrop-blur-sm transition-opacity">
      <div className="absolute inset-0" onClick={closeGuardDrawer} />

      <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
        <div className="pointer-events-auto w-screen max-w-md border-l border-slate-800 bg-[#1E293B] p-6 text-slate-100 shadow-2xl shadow-slate-950 flex flex-col justify-between overflow-y-auto custom-scrollbar">
          {/* Header */}
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-500 animate-ping" />
                <h2 className="text-lg font-bold text-white">Guard Operations Telemetry</h2>
              </div>
              <button
                onClick={closeGuardDrawer}
                className="rounded-xl border border-slate-700 bg-slate-800 p-2 text-slate-400 hover:text-white transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Profile Overview */}
            <div className="mt-6 flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <GuardAvatar photo={selectedGuard.photo} name={selectedGuard.name} size="h-16 w-16" rounded="rounded-2xl" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="truncate text-base font-bold text-white">{selectedGuard.name}</h3>
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-mono text-blue-400">
                    {selectedGuard.id}
                  </span>
                </div>
                <p className="truncate text-xs text-slate-400 mt-0.5">{selectedGuard.client}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      selectedGuard.status === 'On Patrol'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : selectedGuard.status === 'Emergency'
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {selectedGuard.status}
                  </span>
                  <span className="text-xs text-slate-400">{selectedGuard.shift}</span>
                </div>
              </div>
            </div>

            {/* Diagnostic Telemetry Grid */}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Battery Status</span>
                  <Battery className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="mt-2 text-lg font-bold text-white">{selectedGuard.battery}%</div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${selectedGuard.battery}%` }}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>GPS Telemetry</span>
                  <MapPin className="h-4 w-4 text-blue-400" />
                </div>
                <div className="mt-2 text-sm font-bold text-white truncate">{selectedGuard.gpsAccuracy}</div>
                <div className="mt-1 text-[11px] text-slate-500">
                  {selectedGuard.gpsLat}, {selectedGuard.gpsLng}
                </div>
              </div>
            </div>

            {/* Verification & Performance Metrics */}
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  <span>Face Biometrics</span>
                </div>
                <span className="text-xs font-semibold text-emerald-400">
                  {selectedGuard.faceVerified ? `VERIFIED (${selectedGuard.faceVerifiedAt})` : 'UNVERIFIED'}
                </span>
              </div>

              <div className="flex items-center justify-between border-t border-slate-800/80 pt-2.5">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <Award className="h-4 w-4 text-amber-400" />
                  <span>Performance Rating</span>
                </div>
                <span className="text-xs font-semibold text-white">{selectedGuard.performanceRating}%</span>
              </div>

              <div className="flex items-center justify-between border-t border-slate-800/80 pt-2.5">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <Calendar className="h-4 w-4 text-blue-400" />
                  <span>Attendance Rate</span>
                </div>
                <span className="text-xs font-semibold text-white">{selectedGuard.attendanceRate}%</span>
              </div>
            </div>

            {/* Current Patrol Progression */}
            {selectedGuard.currentPatrolName && (
              <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Current Patrol</span>
                  <span className="text-xs font-semibold text-blue-400">{selectedGuard.progressPct}%</span>
                </div>
                <div className="text-sm font-bold text-white">{selectedGuard.currentPatrolName}</div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                  <span>{selectedGuard.completedCheckpoints} of {selectedGuard.totalCheckpoints} Checkpoints</span>
                  <span>ETA: {selectedGuard.etaMinutes} mins</span>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all duration-300"
                    style={{ width: `${selectedGuard.progressPct}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Quick Action Footer Buttons */}
          <div className="mt-6 pt-4 border-t border-slate-800 space-y-2">
            <button
              onClick={() => {
                addToast('Dispatch Command', `Field supervisor dispatched to ${selectedGuard.name}'s position.`, 'info');
              }}
              className="btn-primary w-full py-2.5"
            >
              <Phone className="h-4 w-4 mr-2" /> Direct Contact Guard ({selectedGuard.phone})
            </button>

            <button
              onClick={() => {
                addToast('Supervisor Alert', `Supervisor unit dispatched to ${selectedGuard.siteName}`, 'warning');
              }}
              className="btn-secondary w-full py-2.5 text-slate-300"
            >
              <AlertTriangle className="h-4 w-4 mr-2 text-amber-400" /> Dispatch Field Supervisor
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
