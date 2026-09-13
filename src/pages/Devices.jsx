import React, { useState } from 'react';
import Layout from '../components/Layout';
import GuardAvatar from '../components/GuardAvatar';
import { useSpot } from '../context/SpotContext';
import { Smartphone, RefreshCw, Link, Unlink, Search, Wifi } from 'lucide-react';

function formatDate(date) {
  if (!date) return 'N/A';
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return date.toLocaleDateString();
}

export default function Devices() {
  const { devices, guards, assignDeviceToGuard, addToast } = useSpot();
  const [search, setSearch] = useState('');

  // Build a map of deviceId -> guard name for quick lookup
  const deviceToGuard = {};
  guards.forEach(g => {
    if (g.deviceId) deviceToGuard[g.deviceId] = g;
  });

  const filtered = devices.filter(d =>
    (d.deviceId || '').toLowerCase().includes(search.toLowerCase()) ||
    (d.deviceModel || '').toLowerCase().includes(search.toLowerCase())
  );

  const unassigned = devices.filter(d => !deviceToGuard[d.deviceId]);
  const assigned = devices.filter(d => !!deviceToGuard[d.deviceId]);

  return (
    <Layout
      title="Registered Devices"
      subtitle="All phones registered via the S.P.O.T. mobile app — assign them to guards"
    >
      <div className="space-y-6">

        {/* Summary Cards */}
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-3 lg:grid-cols-12">
          <div className="card-spot group flex min-h-[164px] flex-col items-center justify-center text-center lg:col-span-5">
            <div className="mb-3 rounded-2xl border border-blue-500/30 bg-blue-500/15 p-3.5 text-blue-400 transition-transform duration-200 group-hover:scale-110">
              <Smartphone className="h-8 w-8" strokeWidth={2.2} />
            </div>
            <div className="text-5xl font-bold leading-none text-white">{devices.length}</div>
            <div className="mt-2 text-xs font-bold uppercase tracking-wider text-slate-400">Total Devices</div>
            <div className="mt-1 text-[10px] text-slate-500">Registered in the platform</div>
          </div>
          <div className="card-spot group flex min-h-[148px] flex-col items-center justify-center text-center lg:col-span-4">
            <div className="mb-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/15 p-3 text-emerald-400 transition-transform duration-200 group-hover:scale-110">
              <Link className="h-7 w-7" strokeWidth={2.2} />
            </div>
            <div className="text-4xl font-bold leading-none text-white">{assigned.length}</div>
            <div className="mt-2 text-xs font-bold uppercase tracking-wider text-slate-400">Assigned to Guard</div>
            <div className="mt-1 text-[10px] text-slate-500">Active device bindings</div>
          </div>
          <div className={`card-spot group flex min-h-[132px] flex-col items-center justify-center text-center lg:col-span-3 ${unassigned.length > 0 ? 'border-amber-500/30 bg-amber-950/10' : ''}`}>
            <div className="mb-2 rounded-2xl border border-amber-500/30 bg-amber-500/15 p-2.5 text-amber-400 transition-transform duration-200 group-hover:scale-110">
              <Unlink className="h-6 w-6" strokeWidth={2.2} />
            </div>
            <div className="text-3xl font-bold leading-none text-white">{unassigned.length}</div>
            <div className="mt-2 text-xs font-bold uppercase tracking-wider text-amber-300">Unassigned</div>
            <div className="mt-1 text-[10px] text-slate-500">Available for binding</div>
          </div>
        </div>

        {/* Search + Refresh */}
        <div className="flex items-center gap-4 card-spot p-4">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <input
              className="input-spot pl-10"
              placeholder="Search by device ID or model..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => addToast('Devices', 'Live Firestore listener is active — data refreshes automatically.', 'info')}
            className="btn-secondary text-xs flex items-center gap-2"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Live Sync Active
          </button>
        </div>

        {/* Table */}
        <div className="card-spot p-0 overflow-hidden border border-slate-800">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-900/90 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4">Device</th>
                  <th className="px-6 py-4">Device ID</th>
                  <th className="px-6 py-4">OS Version</th>
                  <th className="px-6 py-4">Last Active</th>
                  <th className="px-6 py-4">Assigned Guard</th>
                  <th className="px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700">
                          <Smartphone className="h-7 w-7 text-slate-500" />
                        </div>
                        <div className="text-sm text-slate-400 font-semibold">No devices found</div>
                        <div className="text-xs text-slate-500 max-w-xs text-center">
                          Install the S.P.O.T. app on a phone — it registers automatically on launch.
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map(d => {
                    const boundGuard = deviceToGuard[d.deviceId];
                    return (
                      <tr key={d.id} className="hover:bg-slate-800/50 transition">
                        {/* Model */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-slate-800 border border-slate-700">
                              <Smartphone className="h-4 w-4 text-blue-400" />
                            </div>
                            <div>
                              <div className="font-bold text-white text-sm">{d.deviceModel}</div>
                              <div className="text-[10px] text-slate-500">{d.osVersion}</div>
                            </div>
                          </div>
                        </td>

                        {/* Device ID */}
                        <td className="px-6 py-4 font-mono text-xs text-blue-400">{d.deviceId}</td>

                        {/* OS Version */}
                        <td className="px-6 py-4 text-xs text-slate-400">{d.osVersion}</td>

                        {/* Last Active */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 text-xs">
                            <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                            <span className="text-slate-300">{formatDate(d.lastActive)}</span>
                          </div>
                        </td>

                        {/* Assigned Guard */}
                        <td className="px-6 py-4">
                          {boundGuard ? (
                            <div className="flex items-center gap-2">
                              <GuardAvatar photo={boundGuard.photo} name={boundGuard.name} size="h-7 w-7" />
                              <div>
                                <div className="text-xs font-bold text-white">{boundGuard.name}</div>
                                <div className="text-[10px] text-slate-500">{boundGuard.siteName}</div>
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500 italic">Unassigned</span>
                          )}
                        </td>

                        {/* Status badge */}
                        <td className="px-6 py-4">
                          {boundGuard ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
                              <Link className="h-3 w-3" /> Bound
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-[10px] font-bold text-amber-400 border border-amber-500/30">
                              <Unlink className="h-3 w-3" /> Free
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="text-xs text-slate-500 text-right">
          {filtered.length} device(s) shown · Firestore live listener active
        </div>
      </div>
    </Layout>
  );
}
