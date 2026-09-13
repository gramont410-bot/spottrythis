import React, { useState } from 'react';
import Layout from '../components/Layout';
import { useSpot } from '../context/SpotContext';
import { useAuth } from '../context/AuthContext';
import { CalendarDays, Clock, MapPin, Plus, QrCode, Trash2 } from 'lucide-react';

export default function Schedules() {
  const { guards, schedules, checkpoints, saveSchedule, addToast } = useSpot();
  const [form, setForm] = useState({ guardId: '', siteName: '', shift: 'Day Shift', date: '', patrolWindows: [{ id: 'window-1', name: 'Opening patrol', startTime: '09:00', endTime: '09:30', checkpointIds: [] }] });
  const { role } = useAuth();
  const selectedGuard = guards.find((guard) => guard.id === form.guardId);
  const siteCheckpoints = checkpoints.filter((checkpoint) => !selectedGuard || checkpoint.siteId === selectedGuard.siteId);

  const updateWindow = (windowId, patch) => setForm((current) => ({ ...current, patrolWindows: current.patrolWindows.map((window) => window.id === windowId ? { ...window, ...patch } : window) }));
  const addPatrolWindow = () => setForm((current) => ({ ...current, patrolWindows: [...current.patrolWindows, { id: `window-${Date.now()}`, name: `Patrol ${current.patrolWindows.length + 1}`, startTime: '13:00', endTime: '13:30', checkpointIds: [] }] }));
  const removePatrolWindow = (windowId) => setForm((current) => ({ ...current, patrolWindows: current.patrolWindows.length === 1 ? current.patrolWindows : current.patrolWindows.filter((window) => window.id !== windowId) }));
  const toggleCheckpoint = (windowId, checkpointId) => setForm((current) => ({ ...current, patrolWindows: current.patrolWindows.map((window) => {
    if (window.id !== windowId) return window;
    const checkpointIds = window.checkpointIds.includes(checkpointId) ? window.checkpointIds.filter((id) => id !== checkpointId) : [...window.checkpointIds, checkpointId];
    return { ...window, checkpointIds };
  }) }));

  const createSchedule = async () => {
    const guard = guards.find((item) => item.id === form.guardId);
    if (!guard || !form.date) return;
    await saveSchedule({ ...form, guardName: guard.name, siteId: guard.siteId, siteName: form.siteName || guard.siteName });
    setForm({ guardId: '', siteName: '', shift: 'Day Shift', date: '', patrolWindows: [{ id: 'window-1', name: 'Opening patrol', startTime: '09:00', endTime: '09:30', checkpointIds: [] }] });
    addToast('Schedule Saved', `${guard.name} was assigned a ${form.shift}.`, 'success');
  };

  return (
    <Layout
      title="Guard Duty Roster & Shift Schedules"
      subtitle="Operational Shift Assignments, Day/Night Roster & Guard Allocation"
    >
      <div className="space-y-6">
        {role === 'admin' && <div className="card-spot space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <select className="input-spot" value={form.guardId} onChange={(event) => setForm({ ...form, guardId: event.target.value })}><option value="">Select guard</option>{guards.map((guard) => <option key={guard.id} value={guard.id}>{guard.name}</option>)}</select>
            <input className="input-spot" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
            <select className="input-spot" value={form.shift} onChange={(event) => setForm({ ...form, shift: event.target.value })}><option>Day Shift</option><option>Night Shift</option><option>Relief</option></select>
            <button onClick={createSchedule} className="btn-primary"><CalendarDays className="h-4 w-4" /> Save duty schedule</button>
          </div>

          <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/5 p-4">
            <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-white">Patrol windows</h3><p className="mt-1 text-xs text-slate-400">The main shift is the guard's work time. These windows are the required QR patrol rounds.</p></div><button type="button" onClick={addPatrolWindow} className="btn-secondary shrink-0 px-3 py-1.5 text-xs"><Plus className="h-3.5 w-3.5" /> Add round</button></div>
            <div className="space-y-3">
              {form.patrolWindows.map((window, index) => <div key={window.id} className="rounded-xl border border-white/10 bg-slate-950/30 p-3">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_130px_130px_auto]">
                  <input className="input-spot" value={window.name} onChange={(event) => updateWindow(window.id, { name: event.target.value })} placeholder={`Patrol round ${index + 1}`} aria-label="Patrol window name" />
                  <input className="input-spot" type="time" value={window.startTime} onChange={(event) => updateWindow(window.id, { startTime: event.target.value })} aria-label="Patrol start time" />
                  <input className="input-spot" type="time" value={window.endTime} onChange={(event) => updateWindow(window.id, { endTime: event.target.value })} aria-label="Patrol end time" />
                  <button type="button" onClick={() => removePatrolWindow(window.id)} className="btn-ghost px-2 text-rose-400" title="Remove patrol window"><Trash2 className="h-4 w-4" /></button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {siteCheckpoints.length === 0 ? <span className="text-xs text-slate-500">Select a guard with QR checkpoints assigned to their site.</span> : siteCheckpoints.map((checkpoint) => <button type="button" key={checkpoint.id} onClick={() => toggleCheckpoint(window.id, checkpoint.id)} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${window.checkpointIds.includes(checkpoint.id) ? 'border-cyan-400/40 bg-cyan-400/15 text-cyan-200' : 'border-slate-700 bg-slate-900/50 text-slate-400 hover:text-white'}`}><QrCode className="h-3.5 w-3.5" />{checkpoint.name}</button>)}
                </div>
              </div>)}
            </div>
          </div>
        </div>}
        <div className="card-spot space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-blue-400" /> Active Roster Assignments
            </h3>
            <span className="text-xs text-emerald-400 font-semibold">Weekly Schedule Active</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {schedules.map((schedule) => <div key={schedule.id} className="card-spot border-cyan-400/20"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-bold text-white">{schedule.guardName}</div><div className="text-xs text-slate-400">{schedule.siteName} · {schedule.date}</div></div><span className="badge-success text-[10px]">{schedule.status}</span></div><div className="mt-3 flex items-center gap-2 text-xs font-semibold text-blue-300"><Clock className="h-3.5 w-3.5" /> Main shift: {schedule.shift}</div><div className="mt-3 space-y-2">{(schedule.patrolWindows || []).map((window) => <div key={window.id} className="rounded-lg border border-white/10 bg-slate-950/40 p-2 text-xs"><div className="flex items-center justify-between font-semibold text-cyan-200"><span>{window.name}</span><span>{window.startTime} - {window.endTime}</span></div><div className="mt-1 flex items-center gap-1 text-[10px] text-slate-500"><MapPin className="h-3 w-3" />{window.checkpointIds?.length || 0} QR checkpoints to scan</div></div>)}{!(schedule.patrolWindows || []).length && <span className="text-xs text-slate-500">No patrol rounds configured.</span>}</div></div>)}
            {guards.map((guard) => (
              <div key={guard.id} className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-3">
                <div className="flex items-center gap-3">
                  <img src={guard.photo} alt={guard.name} className="h-10 w-10 rounded-full object-cover border border-blue-500/40" />
                  <div>
                    <h4 className="text-sm font-bold text-white">{guard.name}</h4>
                    <span className="text-xs text-slate-400">{guard.siteName}</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs space-y-1">
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-400">Assigned Shift:</span>
                    <span className="font-semibold text-blue-400">{guard.shift}</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-400">Status:</span>
                    <span className="font-semibold text-emerald-400">{guard.status}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
