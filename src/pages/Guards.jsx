import React, { useState } from 'react';
import Layout from '../components/Layout';
import GuardAvatar from '../components/GuardAvatar';
import { useSpot } from '../context/SpotContext';
import {
  Users, Search, Battery, ShieldCheck, Eye, Plus, Pencil, Trash2, X,
  Check, AlertTriangle, Smartphone, Link, Unlink, KeyRound, Copy, Mail
} from 'lucide-react';

// ─── Reusable Modal Shell ────────────────────────────────────────────────────
function Modal({ title, subtitle, onClose, children, footer }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-700 bg-[#1E293B] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-white">{title}</h3>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-xl border border-slate-700 bg-slate-800 p-2 text-slate-400 hover:text-white transition">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}

// ─── Field Component ─────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</label>
      {children}
    </div>
  );
}

// ─── Guard Form Fields ────────────────────────────────────────────────────────
function generateTemporaryPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const numbers = '23456789';
  const symbols = '!@#$%';
  const all = upper + lower + numbers + symbols;

  const pick = (chars) => chars[Math.floor(Math.random() * chars.length)];

  const chars = [
    pick(upper),
    pick(lower),
    pick(numbers),
    pick(symbols),
  ];

  while (chars.length < 12) {
    chars.push(pick(all));
  }

  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}

function GuardFormFields({
  form,
  onChange,
  onPatch,
  sites = [],
  isCreate = false,
}) {
  const handlePhotoUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Storage is not enabled in the current Firebase project, so profile
    // photos may fall back to Firestore. Keep the image small enough for
    // Firestore's document-size limit.
    if (!file.type.startsWith('image/') || file.size > 700 * 1024) {
      window.alert('Please use a JPG, PNG, or WebP image smaller than 700 KB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => onChange('photo', reader.result);
    reader.readAsDataURL(file);
  };

  const handleSiteChange = (event) => {
    const siteId = event.target.value;
    const site = sites.find((item) => String(item.id) === String(siteId));

    if (!site) {
      onPatch({
        siteId: '',
        assignedSiteId: '',
        siteName: '',
        clientId: '',
        client: '',
      });
      return;
    }

    onPatch({
      siteId: site.id,
      assignedSiteId: site.id,
      siteName: site.name || site.siteName || 'Assigned Site',
      clientId: site.clientId || '',
      client: site.client || '',
    });
  };

  const generatePassword = () => {
    const password = generateTemporaryPassword();
    onPatch({
      password,
      confirmPassword: password,
    });
  };

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Full Name *">
          <input
            className="input-spot"
            value={form.name}
            onChange={(e) => onChange('name', e.target.value)}
            placeholder="e.g. Juan dela Cruz"
          />
        </Field>

        <Field label="Phone Number">
          <input
            className="input-spot"
            value={form.phone}
            onChange={(e) => onChange('phone', e.target.value)}
            placeholder="+63 917 000 0000"
          />
        </Field>
      </div>

      <Field label={isCreate ? 'Login Email *' : 'Login Email'}>
        <div className="relative">
          <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
          <input
            type="email"
            className="input-spot pl-10"
            value={form.email || ''}
            onChange={(e) => onChange('email', e.target.value)}
            placeholder="guard@example.com"
            readOnly={!isCreate}
          />
        </div>

        {!isCreate && (
          <p className="text-[11px] text-slate-500">
            Login email is managed by Firebase Authentication and is not changed from this form.
          </p>
        )}
      </Field>

      {isCreate && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-blue-400" />
              <span className="text-xs font-bold text-white">
                Guard App Login Password
              </span>
            </div>

            <button
              type="button"
              onClick={generatePassword}
              className="btn-secondary text-[11px]"
            >
              Generate Password
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Temporary Password *">
              <input
                type="text"
                autoComplete="new-password"
                className="input-spot font-mono"
                value={form.password || ''}
                onChange={(e) => onChange('password', e.target.value)}
                placeholder="At least 8 characters"
              />
            </Field>

            <Field label="Confirm Password *">
              <input
                type="text"
                autoComplete="new-password"
                className="input-spot font-mono"
                value={form.confirmPassword || ''}
                onChange={(e) => onChange('confirmPassword', e.target.value)}
                placeholder="Repeat password"
              />
            </Field>
          </div>

          <p className="text-[11px] text-slate-400">
            This password is sent to Firebase Authentication only. It is never saved in Firestore.
            Give it to the guard so they can sign in to the Android app, then they can change it from the app.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Assigned Site">
          <select
            className="input-spot"
            value={form.assignedSiteId || form.siteId || ''}
            onChange={handleSiteChange}
          >
            <option value="">— No site assigned —</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Client">
          <input
            className="input-spot"
            value={form.client || ''}
            onChange={(e) => onChange('client', e.target.value)}
            placeholder="Client name"
          />
        </Field>
      </div>

      {form.siteName && (
        <div className="rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs text-slate-400">
          Assigned deployment: <span className="font-semibold text-white">{form.siteName}</span>
          {form.assignedSiteId && (
            <span className="ml-2 font-mono text-blue-400">
              {form.assignedSiteId}
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Shift Schedule">
          <select
            className="input-spot"
            value={form.shift}
            onChange={(e) => onChange('shift', e.target.value)}
          >
            <option>Day Shift (06:00 - 18:00)</option>
            <option>Night Shift (18:00 - 06:00)</option>
            <option>Mid Shift (10:00 - 22:00)</option>
          </select>
        </Field>

        <Field label="Status">
          <select
            className="input-spot"
            value={form.status}
            onChange={(e) => onChange('status', e.target.value)}
          >
            <option>Idle</option>
            <option>On Patrol</option>
            <option>Off Duty</option>
          </select>
        </Field>
      </div>

      <Field label="Profile Photo (optional)">
        <div className="flex items-center gap-3">
          <GuardAvatar photo={form.photo} name={form.name} />

          <label className="btn-secondary cursor-pointer text-xs">
            Upload Photo
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handlePhotoUpload}
            />
          </label>

          {form.photo && (
            <button
              type="button"
              onClick={() => onChange('photo', '')}
              className="text-xs text-slate-400 hover:text-white"
            >
              Remove
            </button>
          )}
        </div>

        <p className="text-[11px] text-slate-500">
          Because Firebase Storage is not enabled, keep optional profile photos under 700 KB.
        </p>
      </Field>
    </>
  );
}

const EMPTY_GUARD = {
  name: '',
  phone: '',
  email: '',
  password: '',
  confirmPassword: '',
  siteId: '',
  assignedSiteId: '',
  clientId: '',
  siteName: '',
  client: '',
  shift: 'Day Shift (06:00 - 18:00)',
  status: 'Idle',
  photo: '',
};

function CredentialsModal({ credentials, onClose }) {
  if (!credentials) return null;

  const copy = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard access may be blocked on non-HTTPS dev environments.
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
      <div className="w-full max-w-md rounded-2xl border border-emerald-500/30 bg-[#1E293B] shadow-2xl overflow-hidden">
        <div className="border-b border-slate-800 p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-emerald-400">
              <ShieldCheck className="h-5 w-5" />
            </div>

            <div>
              <h3 className="text-base font-bold text-white">Guard Account Created</h3>
              <p className="text-xs text-slate-400">
                Save these credentials before closing this window.
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-3">
          <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Guard</div>
            <div className="mt-1 text-sm font-bold text-white">{credentials.name}</div>
            <div className="text-xs font-mono text-blue-400">{credentials.guardCode}</div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Login Email</div>
                <div className="mt-1 text-sm font-mono text-white truncate">{credentials.email}</div>
              </div>

              <button
                type="button"
                onClick={() => copy(credentials.email)}
                className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-400 hover:text-white"
                title="Copy email"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-blue-300">Temporary Password</div>
                <div className="mt-1 text-base font-mono font-bold text-white break-all">
                  {credentials.password}
                </div>
              </div>

              <button
                type="button"
                onClick={() => copy(credentials.password)}
                className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-2 text-blue-300 hover:text-white"
                title="Copy password"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              The password is not stored in Firestore. The guard should use it for the first Android login and then change it in the app.
            </span>
          </div>
        </div>

        <div className="border-t border-slate-800 p-4 flex justify-end">
          <button type="button" onClick={onClose} className="btn-primary text-xs">
            I Saved the Credentials
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirmation Modal ────────────────────────────────────────────────
function DeleteConfirm({ label, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-2xl border border-rose-800/60 bg-[#1E293B] shadow-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-400">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-white">Confirm Deletion</div>
            <div className="text-xs text-slate-400 mt-0.5">This action cannot be undone.</div>
          </div>
        </div>
        <p className="text-xs text-slate-300 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
          You are about to permanently delete <span className="font-bold text-white">{label}</span>.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="btn-secondary flex-1 text-xs">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-2 px-4 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition flex items-center justify-center gap-2">
            <Trash2 className="h-3.5 w-3.5" /> Delete Permanently
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Assign Device Modal ──────────────────────────────────────────────────────
function AssignDeviceModal({ guard, devices, onClose, onAssign }) {
  const [selected, setSelected] = useState(guard.deviceId || '');
  const [saving, setSaving] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState(null);
  const [addError, setAddError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    await onAssign(guard.id, selected || null);
    setSaving(false);
    onClose();
  };

  return (
    <Modal
      title="Assign Device to Guard"
      subtitle={`Binding a phone/device to ${guard.name}`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary text-xs">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-xs flex items-center gap-2">
            {saving ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Link className="h-3.5 w-3.5" />}
            {selected ? 'Bind Device' : 'Remove Binding'}
          </button>
        </>
      }
    >
      {/* Current binding */}
      <div className={`flex items-center gap-3 rounded-xl p-3 border ${guard.deviceId ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-900/60 border-slate-700'}`}>
        <Smartphone className={`h-5 w-5 ${guard.deviceId ? 'text-emerald-400' : 'text-slate-500'}`} />
        <div>
          <div className="text-xs font-semibold text-slate-300">Current Device</div>
          <div className={`text-xs font-mono ${guard.deviceId ? 'text-emerald-400' : 'text-slate-500'}`}>
            {guard.deviceId || 'No device assigned'}
          </div>
        </div>
      </div>

      {/* Device picker */}
      <Field label="Select a Registered Device">
        <select
          className="input-spot"
          value={selected}
          onChange={e => setSelected(e.target.value)}
        >
          <option value="">— None (unassign) —</option>
          {devices.map(d => (
            <option key={d.id} value={d.deviceId}>
              {d.deviceModel} · {d.deviceId} · {d.osVersion}
            </option>
          ))}
        </select>
      </Field>

      {devices.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          No registered devices found. Install the app on a phone to register it.
        </div>
      )}

      {/* Device list */}
      {devices.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Registered Devices</div>
          {devices.map(d => (
            <button
              key={d.id}
              onClick={() => setSelected(d.deviceId === selected ? '' : d.deviceId)}
              className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                selected === d.deviceId
                  ? 'border-blue-500/50 bg-blue-500/10'
                  : 'border-slate-700 bg-slate-900/40 hover:border-slate-500'
              }`}
            >
              <Smartphone className={`h-5 w-5 shrink-0 ${selected === d.deviceId ? 'text-blue-400' : 'text-slate-500'}`} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-white">{d.deviceModel}</div>
                <div className="text-[10px] font-mono text-slate-400 truncate">{d.deviceId}</div>
                <div className="text-[10px] text-slate-500">{d.osVersion}</div>
              </div>
              <div className="text-[10px] text-slate-500 shrink-0">
                {d.lastActive ? d.lastActive.toLocaleDateString() : 'N/A'}
              </div>
              {selected === d.deviceId && (
                <Check className="h-4 w-4 text-blue-400 shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ─── Main Guards Page ─────────────────────────────────────────────────────────
export default function Guards() {
  const {
    guards,
    devices,
    sites,
    openGuardDrawer,
    addGuard,
    updateGuard,
    deleteGuard,
    assignDeviceToGuard,
    addToast,
  } = useSpot();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Modal state
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deviceTarget, setDeviceTarget] = useState(null); // guard to assign device
  const [addForm, setAddForm] = useState(EMPTY_GUARD);
  const [editForm, setEditForm] = useState(EMPTY_GUARD);
  const [saving, setSaving] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState(null);
  const [addError, setAddError] = useState('');

  const filteredGuards = guards.filter((guard) => {
    const matchesSearch =
      (guard.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (guard.id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (guard.siteName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (guard.guardId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (guard.email || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'All' || guard.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleAdd = async () => {
    const email = addForm.email.trim().toLowerCase();

    if (!addForm.name.trim()) {
      setAddError('Enter the guard full name.');
      return;
    }

    if (!email) {
      setAddError('Enter the guard login email.');
      return;
    }

    if ((addForm.password || '').length < 8) {
      setAddError('Temporary password must contain at least 8 characters.');
      return;
    }

    if (addForm.password !== addForm.confirmPassword) {
      setAddError('Password and confirmation do not match.');
      return;
    }

    setSaving(true);
    setAddError('');

    try {
      const created = await addGuard({
        ...addForm,
        email,
      });

      setShowAdd(false);

      setCreatedCredentials({
        name: created.name,
        guardCode: created.guardId || created.id,
        email,
        password: addForm.password,
      });

      setAddForm(EMPTY_GUARD);
    } catch (error) {
      setAddError(
        error?.message ||
        'Unable to create the guard account.'
      );
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (guard) => {
    setEditForm({
      name: guard.name || '',
      phone: guard.phone || '',
      email: guard.email || '',
      password: '',
      confirmPassword: '',
      siteId: guard.siteId || guard.assignedSiteId || '',
      assignedSiteId: guard.assignedSiteId || guard.siteId || '',
      clientId: guard.clientId || '',
      siteName: guard.siteName || '',
      client: guard.client || '',
      shift: guard.shift || 'Day Shift (06:00 - 18:00)',
      status: guard.status || 'Idle',
      photo: guard.photo || ''
    });
    setEditTarget(guard);
  };

  const handleEdit = async () => {
    if (!editForm.name.trim()) return;

    setSaving(true);

    try {
      await updateGuard(editTarget.id, editForm);
      setEditTarget(null);
    } catch (error) {
      addToast(
        'Guard Update Failed',
        error?.message || 'Unable to update guard.',
        'danger'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    const deleted = await deleteGuard(deleteTarget.id);

    if (deleted) {
      setDeleteTarget(null);
    }
  };

  return (
    <Layout
      title="Guards Directory & Personnel Roster"
      subtitle="Enterprise Active Roster, Battery Telemetry, Face Enrollment & Device Assignment"
    >
      <div className="space-y-6">
        {/* Header Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 card-spot p-4">
          <div className="relative flex-1 w-full max-w-md">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search guard by name, ID, or deployment site..."
              className="input-spot pl-10"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
              {['All', 'On Patrol', 'Idle', 'Emergency'].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                    statusFilter === st ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowAdd(true)}
              className="btn-primary text-xs flex items-center gap-2"
            >
              <Plus className="h-4 w-4" /> Add Guard
            </button>
          </div>
        </div>

        {/* Devices Summary Banner */}
        <div className="flex items-center gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 px-5 py-3">
          <Smartphone className="h-5 w-5 text-blue-400 shrink-0" />
          <div className="text-xs text-slate-300">
            <span className="font-bold text-white">{devices.length}</span> registered device(s) available to assign.
            <span className="ml-2 text-slate-400">
              {guards.filter(g => g.deviceId).length} guard(s) currently have a device bound.
            </span>
          </div>
        </div>

        {/* Guards Enterprise Table */}
        <div className="card-spot p-0 overflow-hidden border border-slate-800">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-900/90 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4">Guard Info</th>
                  <th className="px-6 py-4">Client & Site</th>
                  <th className="px-6 py-4">Shift</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Battery</th>
                  <th className="px-6 py-4">GPS Accuracy</th>
                  <th className="px-6 py-4">Face Verified</th>
                  <th className="px-6 py-4">Device</th>
                  <th className="px-6 py-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredGuards.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700">
                          <Users className="h-7 w-7 text-slate-500" />
                        </div>
                        <div className="text-sm text-slate-400 font-semibold">No guard personnel found</div>
                        <div className="text-xs text-slate-500">Click "Add Guard" to register a new guard to the roster.</div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredGuards.map((guard) => (
                    <tr
                      key={guard.id}
                      className="hover:bg-slate-800/50 transition"
                    >
                      {/* Guard Info */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <GuardAvatar photo={guard.photo} name={guard.name} />
                          <div>
                            <div className="font-bold text-white text-sm">{guard.name}</div>
                            <div className="text-xs font-mono text-blue-400">
                              {guard.guardId || guard.id}
                            </div>
                            {guard.email && (
                              <div className="text-[10px] text-slate-500">{guard.email}</div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Client & Site */}
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-200">{guard.siteName}</div>
                        <div className="text-xs text-slate-400">{guard.client}</div>
                      </td>

                      {/* Shift */}
                      <td className="px-6 py-4 text-xs font-medium text-slate-300">{guard.shift}</td>

                      {/* Status */}
                      <td className="px-6 py-4">
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          guard.status === 'On Patrol'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : guard.status === 'Emergency'
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}>
                          {guard.status}
                        </span>
                      </td>

                      {/* Battery */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Battery className="h-4 w-4 text-emerald-400" />
                          <span className="font-bold text-white text-xs">{guard.battery}%</span>
                        </div>
                      </td>

                      {/* GPS Accuracy */}
                      <td className="px-6 py-4 text-xs font-medium text-slate-300">{guard.gpsAccuracy}</td>

                      {/* Face Verified */}
                      <td className="px-6 py-4">
                        {guard.faceVerified ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/20 px-2.5 py-0.5 text-[10px] font-bold text-blue-400 border border-blue-500/30">
                            <ShieldCheck className="h-3 w-3" /> VERIFIED
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">PENDING</span>
                        )}
                      </td>

                      {/* Device */}
                      <td className="px-6 py-4">
                        {guard.deviceId ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold text-emerald-400 border border-emerald-500/30 font-mono">
                            <Smartphone className="h-3 w-3" />
                            {guard.deviceId.substring(0, 10)}…
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                            <Unlink className="h-3 w-3" /> Unassigned
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openGuardDrawer(guard)}
                            title="Inspect Guard Drawer"
                            className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-blue-400 hover:text-white hover:border-blue-500 transition"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => openEdit(guard)}
                            title="Edit Guard"
                            className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-amber-400 hover:text-white hover:border-amber-500 transition"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setDeviceTarget(guard)}
                            title="Assign Device"
                            className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-violet-400 hover:text-white hover:border-violet-500 transition"
                          >
                            <Smartphone className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(guard)}
                            title="Delete Guard"
                            className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-rose-400 hover:text-white hover:border-rose-500 transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary Footer */}
        {filteredGuards.length > 0 && (
          <div className="text-xs text-slate-500 text-right">
            Showing <span className="text-slate-300 font-semibold">{filteredGuards.length}</span> of{' '}
            <span className="text-slate-300 font-semibold">{guards.length}</span> guards
          </div>
        )}
      </div>

      {/* ── Add Guard Modal ───────────────────────────────────── */}
      {showAdd && (
        <Modal
          title="Register New Guard"
          subtitle="Creates both a Firebase Authentication login and a Firestore guard profile"
          onClose={() => {
            setShowAdd(false);
            setAddForm(EMPTY_GUARD);
            setAddError('');
          }}
          footer={
            <>
              <button
                onClick={() => {
                  setShowAdd(false);
                  setAddForm(EMPTY_GUARD);
                  setAddError('');
                }}
                className="btn-secondary text-xs"
              >
                Cancel
              </button>

              <button
                onClick={handleAdd}
                disabled={
                  saving ||
                  !addForm.name.trim() ||
                  !addForm.email.trim() ||
                  (addForm.password || '').length < 8 ||
                  addForm.password !== addForm.confirmPassword
                }
                className="btn-primary text-xs flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Check className="h-3.5 w-3.5" />}
                Save Guard
              </button>
            </>
          }
        >
          {addError && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{addError}</span>
            </div>
          )}

          <GuardFormFields
            form={addForm}
            sites={sites}
            isCreate
            onChange={(key, value) =>
              setAddForm((current) => ({
                ...current,
                [key]: value,
              }))
            }
            onPatch={(patch) =>
              setAddForm((current) => ({
                ...current,
                ...patch,
              }))
            }
          />
        </Modal>
      )}

      {/* ── Edit Guard Modal ──────────────────────────────────── */}
      {editTarget && (
        <Modal
          title="Edit Guard Record"
          subtitle={`Editing: ${editTarget.name}`}
          onClose={() => setEditTarget(null)}
          footer={
            <>
              <button onClick={() => setEditTarget(null)} className="btn-secondary text-xs">Cancel</button>
              <button onClick={handleEdit} disabled={saving || !editForm.name.trim()} className="btn-primary text-xs flex items-center gap-2">
                {saving ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Check className="h-3.5 w-3.5" />}
                Save Changes
              </button>
            </>
          }
        >
          <GuardFormFields
            form={editForm}
            sites={sites}
            onChange={(key, value) =>
              setEditForm((current) => ({
                ...current,
                [key]: value,
              }))
            }
            onPatch={(patch) =>
              setEditForm((current) => ({
                ...current,
                ...patch,
              }))
            }
          />
        </Modal>
      )}

      {/* ── Assign Device Modal ───────────────────────────────── */}
      {deviceTarget && (
        <AssignDeviceModal
          guard={deviceTarget}
          devices={devices}
          onClose={() => setDeviceTarget(null)}
          onAssign={assignDeviceToGuard}
        />
      )}

      {/* ── Delete Confirmation ───────────────────────────────── */}
      {deleteTarget && (
        <DeleteConfirm
          label={deleteTarget.name}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}

      <CredentialsModal
        credentials={createdCredentials}
        onClose={() => setCreatedCredentials(null)}
      />
    </Layout>
  );
}
