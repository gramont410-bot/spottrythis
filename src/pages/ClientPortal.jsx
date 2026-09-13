import React, { useEffect } from 'react';
import { Activity, AlertTriangle, Building2, MapPin, Radio, ShieldCheck, Users } from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { useSpot } from '../context/SpotContext';

function belongsToClient(item, profile) {
  if (!profile) return false;
  return item.clientId === profile.clientId ||
    item.client === profile.company ||
    item.client === profile.agency ||
    item.clientEmail === profile.email;
}

export default function ClientPortal() {
  const { profile } = useAuth();
  const { guards, sites, incidents, patrols, addToast } = useSpot();
  const clientGuards = guards.filter((guard) => belongsToClient(guard, profile));
  const clientSites = sites.filter((site) => belongsToClient(site, profile));
  const clientIncidents = incidents.filter((incident) => belongsToClient(incident, profile));
  const clientPatrols = patrols.filter((patrol) => belongsToClient(patrol, profile));
  const activeGuards = clientGuards.filter((guard) => ['On Patrol', 'Active'].includes(guard.status));

  useEffect(() => {
    if (!profile?.contractEnd) return;
    const days = Math.ceil((new Date(profile.contractEnd) - new Date()) / 86400000);
    if (days < 0 || days > 14) return;
    const key = `spot.contract-warning.${profile.id}.${new Date().toISOString().slice(0, 10)}`;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, 'shown');
      addToast('Contract Expiring Soon', `Your contract expires in ${days} day(s), on ${profile.contractEnd}.`, 'warning');
    }
  }, [profile?.id, profile?.contractEnd, addToast]);

  const stats = [
    { label: 'Assigned guards', value: clientGuards.length, icon: Users, tone: 'text-blue-300' },
    { label: 'Live on patrol', value: activeGuards.length, icon: Radio, tone: 'text-emerald-300' },
    { label: 'Facilities', value: clientSites.length, icon: Building2, tone: 'text-cyan-300' },
    { label: 'Open incidents', value: clientIncidents.filter((item) => item.status !== 'Resolved').length, icon: AlertTriangle, tone: 'text-amber-300' }
  ];

  return (
    <Layout title="Client Operations" subtitle="Live visibility across your assigned facilities and guard team">
      <div className="space-y-6">
        <section className="glass-panel relative overflow-hidden rounded-2xl p-5 sm:p-7">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Client workspace</p>
              <h2 className="mt-2 text-2xl font-bold text-white">{profile?.company || profile?.agency || 'Assigned operations'}</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-400">Track your assigned guards, review facility activity, and respond to incidents as they happen.</p>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Live telemetry</div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className="card-spot interactive-lift p-4 sm:p-5">
              <div className="flex items-center justify-between"><span className="text-xs text-slate-400">{label}</span><Icon className={`h-4 w-4 ${tone}`} /></div>
              <div className="mt-3 text-2xl font-bold text-white">{value}</div>
            </div>
          ))}
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="card-spot">
            <div className="mb-4 flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-bold text-white"><Users className="h-4 w-4 text-blue-300" /> Guard team</h3><span className="text-xs text-slate-500">{clientGuards.length} assigned</span></div>
            <div className="space-y-2">
              {clientGuards.length === 0 ? <EmptyState label="No guards are assigned to this client yet." /> : clientGuards.map((guard) => (
                <div key={guard.id} className="interactive-lift flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/25 p-3">
                  <div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-xs font-bold text-blue-200">{guard.name?.charAt(0) || 'G'}</div><div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{guard.name}</p><p className="flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3" />{guard.siteName}</p></div></div>
                  <span className={`text-xs font-semibold ${guard.status === 'On Patrol' ? 'text-emerald-300' : 'text-slate-400'}`}>{guard.status}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card-spot">
            <div className="mb-4 flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-bold text-white"><Activity className="h-4 w-4 text-cyan-300" /> Facility coverage</h3><span className="text-xs text-slate-500">{clientPatrols.length} patrols</span></div>
            <div className="space-y-2">
              {clientSites.length === 0 ? <EmptyState label="No facilities are assigned to this client yet." /> : clientSites.map((site) => (
                <div key={site.id} className="interactive-lift flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/25 p-3"><div><p className="text-sm font-semibold text-white">{site.name}</p><p className="text-xs text-slate-500">{site.address}</p></div><span className="badge-success">{site.status}</span></div>
              ))}
            </div>
          </div>
        </section>

        <section className="card-spot"><div className="mb-4 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-amber-300" /><h3 className="text-sm font-bold text-white">Recent client alerts</h3></div><div className="grid gap-2 md:grid-cols-2">{clientIncidents.length === 0 ? <EmptyState label="No incidents have been reported for your facilities." /> : clientIncidents.slice(0, 6).map((incident) => <div key={incident.id} className="rounded-xl border border-amber-400/15 bg-amber-400/5 p-3"><p className="text-sm font-semibold text-white">{incident.title}</p><p className="mt-1 text-xs text-slate-400">{incident.siteName} · {incident.status}</p></div>)}</div></section>
      </div>
    </Layout>
  );
}

function EmptyState({ label }) { return <p className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-slate-500">{label}</p>; }