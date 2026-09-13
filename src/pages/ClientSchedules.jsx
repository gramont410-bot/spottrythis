import React, { useState } from 'react';
import Layout from '../components/Layout';
import { useSpot } from '../context/SpotContext';
import { CalendarDays, Clock, Plus, QrCode, ShieldCheck, Trash2 } from 'lucide-react';

export default function ClientSchedules() {
  const { guards, schedules, checkpoints, saveSchedule, addToast } = useSpot();
  const [form, setForm] = useState({ guardId: '', shift: 'Day Shift', date: '', patrolWindows: [{ id: 'window-1', name: 'Opening patrol', startTime: '09:00', endTime: '09:30', checkpointIds: [] }] });
  const selectedGuard = guards.find((guard) => guard.id === form.guardId);
  const siteCheckpoints = checkpoints.filter((checkpoint) => !selectedGuard || checkpoint.siteId === selectedGuard.siteId);

  const updateWindow = (windowId, patch) => setForm((current) => ({ ...current, patrolWindows: current.patrolWindows.map((window) => window.id === windowId ? { ...window, ...patch } : window) }));
  const toggleCheckpoint = (windowId, checkpointId) => setForm((current) => ({ ...current, patrolWindows: current.patrolWindows.map((window) => window.id === windowId ? { ...window, checkpointIds: window.checkpointIds.includes(checkpointId) ? window.checkpointIds.filter((id) => id !== checkpointId) : [...window.checkpointIds, checkpointId] } : window) }));
  const addPatrolWindow = () => setForm((current) => ({ ...current, patrolWindows: [...current.patrolWindows, { id: `window-${Date.now()}`, name: `Patrol ${current.patrolWindows.length + 1}`, startTime: '13:00', endTime: '13:30', checkpointIds: [] }] }));
  const removePatrolWindow = (windowId) => setForm((current) => ({ ...current, patrolWindows: current.patrolWindows.length === 1 ? current.patrolWindows : current.patrolWindows.filter((window) => window.id !== windowId) }));

  const assign = async (event) => {
    event.preventDefault();
    const guard = guards.find((item) => item.id === form.guardId);
    if (!guard || !form.date) return;
    try {
      await saveSchedule({ ...form, guardName: guard.name, siteId: guard.siteId, siteName: guard.siteName });
      setForm({ guardId: '', shift: 'Day Shift', date: '', patrolWindows: [{ id: 'window-1', name: 'Opening patrol', startTime: '09:00', endTime: '09:30', checkpointIds: [] }] });
      addToast('Schedule Assigned', `${guard.name} is scheduled for ${form.date}.`, 'success');
    } catch (error) {
      addToast('Schedule Failed', error.message || 'The schedule could not be saved.', 'danger');
    }
  };

  return (
    <Layout title="Guard Scheduling" subtitle="Assign your available guards to their client facilities">
      <div className="space-y-6">
        <section className="glass-panel rounded-2xl p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-3"><div className="rounded-xl bg-cyan-400/10 p-2 text-cyan-300"><CalendarDays className="h-5 w-5" /></div><div><h2 className="text-base font-bold text-white">Create client schedule</h2><p className="text-xs text-slate-400">Only guards assigned to your client account are available.</p></div></div>
          <form onSubmit={assign} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <select required className="input-spot" value={form.guardId} onChange={(event) => setForm({ ...form, guardId: event.target.value })}><option value="">Select guard</option>{guards.map((guard) => <option key={guard.id} value={guard.id}>{guard.name}</option>)}</select>
            <input required className="input-spot" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
            <select className="input-spot" value={form.shift} onChange={(event) => setForm({ ...form, shift: event.target.value })}><option>Day Shift</option><option>Night Shift</option><option>Relief</option></select>
            <button className="btn-primary" type="submit"><ShieldCheck className="h-4 w-4" /> Assign guard</button>
            </div>
            <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/5 p-4"><div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-white">QR patrol rounds</h3><p className="mt-1 text-xs text-slate-400">Add the time windows when the guard must roam and scan facility checkpoints.</p></div><button type="button" onClick={addPatrolWindow} className="btn-secondary shrink-0 px-3 py-1.5 text-xs"><Plus className="h-3.5 w-3.5" /> Add round</button></div><div className="space-y-3">{form.patrolWindows.map((window) => <div key={window.id} className="rounded-xl border border-white/10 bg-slate-950/30 p-3"><div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_130px_130px_auto]"><input className="input-spot" value={window.name} onChange={(event) => updateWindow(window.id, { name: event.target.value })} placeholder="Patrol round" /><input className="input-spot" type="time" value={window.startTime} onChange={(event) => updateWindow(window.id, { startTime: event.target.value })} /><input className="input-spot" type="time" value={window.endTime} onChange={(event) => updateWindow(window.id, { endTime: event.target.value })} /><button type="button" onClick={() => removePatrolWindow(window.id)} className="btn-ghost px-2 text-rose-400" title="Remove patrol window"><Trash2 className="h-4 w-4" /></button></div><div className="mt-3 flex flex-wrap gap-2">{siteCheckpoints.length === 0 ? <span className="text-xs text-slate-500">No QR checkpoints found for this guard's site.</span> : siteCheckpoints.map((checkpoint) => <button type="button" key={checkpoint.id} onClick={() => toggleCheckpoint(window.id, checkpoint.id)} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${window.checkpointIds.includes(checkpoint.id) ? 'border-cyan-400/40 bg-cyan-400/15 text-cyan-200' : 'border-slate-700 bg-slate-900/50 text-slate-400'}`}><QrCode className="h-3.5 w-3.5" />{checkpoint.name}</button>)}</div></div>)}</div></div>
          </form>
        </section>
        <section className="card-spot"><div className="mb-4 flex items-center gap-2 border-b border-slate-800 pb-3"><Clock className="h-4 w-4 text-cyan-300" /><h2 className="text-sm font-bold text-white">Assigned schedules</h2></div><div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">{schedules.length === 0 ? <p className="col-span-full rounded-xl border border-dashed border-white/10 p-8 text-center text-xs text-slate-500">No schedules assigned yet.</p> : schedules.map((schedule) => <div key={schedule.id} className="interactive-lift rounded-xl border border-white/10 bg-slate-950/30 p-4"><p className="text-sm font-bold text-white">{schedule.guardName}</p><p className="mt-1 text-xs text-slate-400">{schedule.siteName}</p><p className="mt-3 text-xs font-semibold text-cyan-300">{schedule.date} · {schedule.shift}</p><span className="mt-2 inline-flex badge-success">{schedule.status}</span><div className="mt-3 space-y-2">{(schedule.patrolWindows || []).map((window) => <div key={window.id} className="rounded-lg border border-white/10 p-2 text-[10px] text-slate-400"><div className="flex justify-between font-semibold text-cyan-200"><span>{window.name}</span><span>{window.startTime} - {window.endTime}</span></div><div className="mt-1">{window.checkpointIds?.length || 0} QR checkpoints</div></div>)}</div></div>)}</div></section>
      </div>
    </Layout>
  );
}
