import React, { useState } from 'react';
import { Search, User, Building2, ShieldAlert, AlertTriangle, X } from 'lucide-react';
import { useSpot } from '../context/SpotContext';
import { useNavigate } from 'react-router-dom';

export default function GlobalSearchModal() {
  const { globalSearchOpen, setGlobalSearchOpen, guards, sites, patrols, incidents, openGuardDrawer } = useSpot();
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  if (!globalSearchOpen) return null;

  const filteredGuards = guards.filter(
    (g) => g.name.toLowerCase().includes(query.toLowerCase()) || g.id.toLowerCase().includes(query.toLowerCase())
  );
  const filteredSites = sites.filter(
    (s) => s.name.toLowerCase().includes(query.toLowerCase()) || s.type.toLowerCase().includes(query.toLowerCase())
  );
  const filteredIncidents = incidents.filter(
    (i) => i.title.toLowerCase().includes(query.toLowerCase()) || i.location.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-slate-950/80 backdrop-blur-md transition-all">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-700 bg-[#1E293B] shadow-2xl shadow-slate-950">
        {/* Search Header Input */}
        <div className="relative flex items-center border-b border-slate-700 px-4 py-3.5">
          <Search className="h-5 w-5 text-slate-400 mr-3" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Guard, Deployment Site, Incident, or Route... (ESC to close)"
            className="w-full bg-transparent text-slate-100 placeholder:text-slate-500 text-sm outline-none"
          />
          <button
            onClick={() => setGlobalSearchOpen(false)}
            className="p-1 text-slate-400 hover:text-white rounded-lg"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search Results */}
        <div className="custom-scrollbar max-h-96 overflow-y-auto p-4 space-y-4">
          {query.trim() === '' ? (
            <div className="py-8 text-center text-xs text-slate-400">
              Type guard name ("John"), site ("Warehouse"), or incident to search immediately.
            </div>
          ) : (
            <>
              {/* Guards Section */}
              {filteredGuards.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-blue-400" /> Guards ({filteredGuards.length})
                  </div>
                  <div className="space-y-1">
                    {filteredGuards.map((g) => (
                      <div
                        key={g.id}
                        onClick={() => {
                          setGlobalSearchOpen(false);
                          openGuardDrawer(g);
                        }}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-slate-800 bg-slate-900/50 hover:bg-slate-800 hover:border-slate-700 cursor-pointer transition"
                      >
                        <div className="flex items-center gap-3">
                          <img src={g.photo} alt={g.name} className="h-8 w-8 rounded-full object-cover" />
                          <div>
                            <div className="text-sm font-semibold text-white">{g.name}</div>
                            <div className="text-xs text-slate-400">{g.siteName}</div>
                          </div>
                        </div>
                        <span className="text-xs text-blue-400 font-medium">View Profile →</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sites Section */}
              {filteredSites.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-emerald-400" /> Sites ({filteredSites.length})
                  </div>
                  <div className="space-y-1">
                    {filteredSites.map((s) => (
                      <div
                        key={s.id}
                        onClick={() => {
                          setGlobalSearchOpen(false);
                          navigate('/sites');
                        }}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-slate-800 bg-slate-900/50 hover:bg-slate-800 hover:border-slate-700 cursor-pointer transition"
                      >
                        <div>
                          <div className="text-sm font-semibold text-white">{s.name}</div>
                          <div className="text-xs text-slate-400">{s.address}</div>
                        </div>
                        <span className="text-xs text-emerald-400 font-medium">{s.activeGuardsCount} Guards Active</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Incidents Section */}
              {filteredIncidents.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-400" /> Incidents ({filteredIncidents.length})
                  </div>
                  <div className="space-y-1">
                    {filteredIncidents.map((inc) => (
                      <div
                        key={inc.id}
                        onClick={() => {
                          setGlobalSearchOpen(false);
                          navigate('/incidents');
                        }}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-slate-800 bg-slate-900/50 hover:bg-slate-800 hover:border-slate-700 cursor-pointer transition"
                      >
                        <div>
                          <div className="text-sm font-semibold text-white">{inc.title}</div>
                          <div className="text-xs text-slate-400">{inc.location} • {inc.timestamp}</div>
                        </div>
                        <span className="text-xs text-rose-400 font-medium uppercase">{inc.priority} Priority</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {filteredGuards.length === 0 && filteredSites.length === 0 && filteredIncidents.length === 0 && (
                <div className="py-8 text-center text-xs text-slate-400">
                  No matching guards, sites, or incidents found for "{query}".
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
