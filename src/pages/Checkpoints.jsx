import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import { addItem, removeItem, subscribeCollection, updateItem } from '../lib/dataSource';
import { useAuth } from '../context/AuthContext';

export default function Checkpoints() {
  const { profile } = useAuth();
  const [checkpoints, setCheckpoints] = useState([]);
  const [sites, setSites] = useState([]);
  const [open, setOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(null);
  const [siteFilter, setSiteFilter] = useState('All');
  const [form, setForm] = useState({ name: '', siteId: '', lat: '', lng: '' });

  useEffect(() => {
    const u1 = subscribeCollection('checkpoints', setCheckpoints);
    const u2 = subscribeCollection('sites', setSites);
    return () => { u1(); u2(); };
  }, []);

  const save = async () => {
    if (!form.name || !form.siteId) return;
    const qrCode = 'SPOT-CP-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const selectedSite = sites.find((site) => site.id === form.siteId);
    const newItem = {
      name: form.name,
      siteId: form.siteId,
      siteName: selectedSite?.name || 'Managed Site',
      clientId: profile?.clientId || selectedSite?.clientId || '',
      qrCode,
      scanValue: qrCode,
      qrVersion: 2,
      syncStatus: 'active',
      status: 'Active',
      lat: parseFloat(form.lat) || 0,
      lng: parseFloat(form.lng) || 0
    };
    const checkpointId = await addItem('checkpoints', newItem);
    if (selectedSite) {
      await updateItem('sites', selectedSite.id, {
        checkpointsCount: (selectedSite.checkpointsCount || 0) + 1
      });
    }
    setForm({ name: '', siteId: '', lat: '', lng: '' });
    setOpen(false);
    setQrOpen({ ...newItem, id: checkpointId });
  };

  const siteMap = Object.fromEntries(sites.map((s) => [s.id, s.name]));
  const visibleCheckpoints = checkpoints.filter((checkpoint) => siteFilter === 'All' || checkpoint.siteId === siteFilter);

  return (
    <Layout
      title="Checkpoints"
      subtitle="Physical patrol points with generated QR codes"
      actions={<button className="btn-create" onClick={() => setOpen(true)}><span className="btn-icon">+</span>Add Checkpoint</button>}
    >
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/45 p-3">
        <span className="mr-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Filter site</span>
        <button onClick={() => setSiteFilter('All')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${siteFilter === 'All' ? 'bg-cyan-400/20 text-cyan-200' : 'text-slate-400 hover:bg-slate-800'}`}>All sites</button>
        {sites.map((site) => <button key={site.id} onClick={() => setSiteFilter(site.id)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${siteFilter === site.id ? 'bg-cyan-400/20 text-cyan-200' : 'text-slate-400 hover:bg-slate-800'}`}>{site.name}</button>)}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {visibleCheckpoints.map((c) => (
          <div key={c.id} className="card-spot interactive-lift p-4">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="truncate font-semibold text-white">{c.name}</h3>
                <div className="mt-1 text-xs text-slate-500">Site: {siteMap[c.siteId] || 'Unknown site'}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white p-2 shadow-lg shadow-cyan-950/20"><QRCodeSVG value={c.scanValue || c.qrCode} size={84} /></div>
            </div>
            <div className="mb-3 flex items-center justify-between gap-2"><span className="badge-info font-mono text-[10px]">{c.qrCode}</span><span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">{c.siteName}</span></div>
            <div className="mb-4 text-xs text-slate-400">
              Lat: {c.lat?.toFixed?.(4) ?? '-'} / Lng: {c.lng?.toFixed?.(4) ?? '-'}
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1 justify-center text-xs" onClick={() => setQrOpen(c)}>Show QR</button>
              <button className="btn-ghost text-xs text-rose-600" onClick={() => { if (confirm(`Delete ${c.name}?`)) removeItem('checkpoints', c.id); }}>Delete</button>
            </div>
          </div>
        ))}
        {visibleCheckpoints.length === 0 && (
          <div className="card-spot col-span-full p-8 text-center text-slate-400">No checkpoints yet.</div>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add New Checkpoint"
        eyebrow="Checkpoint Transaction"
        description="Register a scan point and generate its unique QR identifier."
        footer={<>
          <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn-create" onClick={save}><span className="btn-icon">+</span>Create QR Point</button>
        </>}
      >
        <div className="mb-4 rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3">
          <div className="text-sm font-semibold text-cyan-200">QR checkpoint identity</div>
          <p className="mt-1 text-xs text-cyan-100/70">A unique synchronized code is generated after saving.</p>
        </div>

        <div className="form-grid">
          <div className="field">
            <label className="label">Checkpoint Name</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Lobby Entrance" />
          </div>
          <div className="field">
            <label className="label">Site</label>
            <select className="input" value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>
              <option value="">Select a site...</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="field"><label className="label">Latitude</label><input className="input" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} placeholder="14.5547" /></div>
            <div className="field"><label className="label">Longitude</label><input className="input" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} placeholder="121.0244" /></div>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!qrOpen}
        onClose={() => setQrOpen(null)}
        title={qrOpen?.name || 'Checkpoint QR'}
        eyebrow="Printable QR"
        description="Use this code at the physical checkpoint location."
        footer={<button className="btn-primary" onClick={() => window.print()}>Print</button>}
      >
        {qrOpen && (
          <div className="text-center">
            <div className="inline-block rounded-2xl border border-cyan-200/30 bg-white p-4 shadow-xl shadow-cyan-950/30">
              <QRCodeSVG value={qrOpen.qrCode} size={220} />
            </div>
            <div className="mt-4 font-mono text-sm text-slate-700">{qrOpen.scanValue || qrOpen.qrCode}</div>
            <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Sync protocol v{qrOpen.qrVersion || 1} · Active</div>
            <p className="mt-2 text-xs text-slate-500">Print and mount this QR code at <b>{qrOpen.name}</b>. Guards scan it from the Android app to log a patrol visit.</p>
          </div>
        )}
      </Modal>
    </Layout>
  );
}
