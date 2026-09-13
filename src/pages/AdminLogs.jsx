import React, { useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { useSpot } from '../context/SpotContext';
import { History, Search, ShieldCheck, Filter, Terminal } from 'lucide-react';

export default function AdminLogs() {
  const { auditLogs } = useSpot();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [actorFilter, setActorFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('');

  const actors = useMemo(() => ['All', ...new Set(auditLogs.map((log) => log.actor))], [auditLogs]);

  const filteredLogs = auditLogs.filter((log) => {
    const matchesSearch =
      log.actor.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.details.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || log.category === categoryFilter;
    const matchesActor = actorFilter === 'All' || log.actor === actorFilter;
    const matchesDate = !dateFilter || log.timestamp.includes(dateFilter);
    return matchesSearch && matchesCategory && matchesActor && matchesDate;
  });

  return (
    <Layout
      title="Security Operations Audit & Telemetry Logs"
      subtitle="Searchable Audit Trail of All System Actions, Biometric Verifications & DB Sync Events"
    >
      <div className="space-y-6">
        {/* Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 card-spot p-4">
          <div className="relative flex-1 w-full max-w-md">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search audit trail by actor, event, or details..."
              className="input-spot pl-10"
            />
          </div>

          <select value={actorFilter} onChange={(event) => setActorFilter(event.target.value)} className="input-spot w-full sm:w-48"><option value="All">All users</option>{actors.filter((actor) => actor !== 'All').map((actor) => <option key={actor}>{actor}</option>)}</select>
          <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="input-spot w-full sm:w-40" />
          <button onClick={() => window.print()} className="btn-secondary shrink-0 text-xs">Print report</button>

          <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs overflow-x-auto custom-scrollbar">
            {['All', 'Verification', 'System Change', 'Login', 'Synchronization', 'Patrol Behavior'].map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition shrink-0 ${
                  categoryFilter === cat ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Audit Logs Table */}
        <div className="card-spot p-0 overflow-hidden border border-slate-800">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900/90 uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4">Timestamp</th>
                  <th className="px-6 py-4">Actor</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4">Action Summary</th>
                  <th className="px-6 py-4">Telemetry Details</th>
                  <th className="px-6 py-4">IP / Endpoint</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-6 py-4 font-mono text-slate-400 whitespace-nowrap">{log.timestamp}</td>
                    <td className="px-6 py-4 font-bold text-white whitespace-nowrap">{log.actor}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          log.severity === 'Critical'
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        }`}
                      >
                        {log.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-200">{log.action}</td>
                    <td className="px-6 py-4 text-slate-400 font-mono text-[11px]">{log.details}</td>
                    <td className="px-6 py-4 text-slate-500 font-mono text-[11px]">{log.ipAddress}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
