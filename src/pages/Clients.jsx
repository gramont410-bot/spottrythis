import React, { useState } from 'react';
import Layout from '../components/Layout';
import { useSpot } from '../context/SpotContext';
import { useAuth } from '../context/AuthContext';
import {
  Briefcase, Users, Building2, Mail, Phone, UserCheck, Search,
  Plus, Pencil, Trash2, Check, X, AlertTriangle, ShieldCheck, TrendingUp
} from 'lucide-react';

// ─── Modal Shell ──────────────────────────────────────────────────────────────
function Modal({ title, subtitle, onClose, children, footer }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-700 bg-[#1E293B] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-white">{title}</h3>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-xl border border-slate-700 bg-slate-800 p-2 text-slate-400 hover:text-white transition">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</label>
      {children}
    </div>
  );
}

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
          You are about to permanently remove <span className="font-bold text-white">{label}</span> from the system.
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

// ─── Client Detail Modal ──────────────────────────────────────────────────────
function ClientDetailModal({ client, onClose, onEdit, onDelete, onPassword }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-700 bg-[#1E293B] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 p-5">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Briefcase className="h-6 w-6" />
            </div>
            <div>
              <span className="text-xs font-mono text-blue-400">{client.id}</span>
              <h3 className="text-lg font-bold text-white">{client.company}</h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onEdit} className="rounded-xl border border-amber-700/50 bg-amber-500/10 p-2 text-amber-400 hover:text-white transition" title="Edit Client">
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={onDelete} className="rounded-xl border border-rose-700/50 bg-rose-500/10 p-2 text-rose-400 hover:text-white transition" title="Delete Client">
              <Trash2 className="h-4 w-4" />
            </button>
            <button onClick={onPassword} className="rounded-xl border border-cyan-700/50 bg-cyan-500/10 p-2 text-cyan-300 hover:text-white transition" title="Set Temporary Password">Key</button>
            <button onClick={onClose} className="rounded-xl border border-slate-700 bg-slate-800 p-2 text-slate-400 hover:text-white transition">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto custom-scrollbar">
          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
              <div className="text-xs text-slate-400 mb-1">Deployment Sites</div>
              <div className="text-2xl font-bold text-white">{client.deploymentsCount}</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
              <div className="text-xs text-slate-400 mb-1">Assigned Guards</div>
              <div className="text-2xl font-bold text-emerald-400">{client.assignedGuards}</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
              <div className="text-xs text-slate-400 mb-1">SLA Compliance</div>
              <div className="text-2xl font-bold text-blue-400">{client.slaCompliance}%</div>
            </div>
          </div>

          {/* Contact Details */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3 text-xs">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Contact Information</div>
            <div className="flex items-center gap-3 text-slate-300">
              <UserCheck className="h-4 w-4 text-blue-400 shrink-0" />
              <div>
                <div className="text-slate-500">Contact Officer</div>
                <div className="font-semibold text-white">{client.contactPerson}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 text-slate-300">
              <Mail className="h-4 w-4 text-blue-400 shrink-0" />
              <div>
                <div className="text-slate-500">Email Address</div>
                <div className="font-mono text-white">{client.email}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 text-slate-300">
              <Phone className="h-4 w-4 text-blue-400 shrink-0" />
              <div>
                <div className="text-slate-500">Phone Number</div>
                <div className="font-semibold text-white">{client.phone}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 text-slate-300">
              <ShieldCheck className="h-4 w-4 text-blue-400 shrink-0" />
              <div>
                <div className="text-slate-500">Lead Supervisor</div>
                <div className="font-semibold text-blue-400">{client.supervisor}</div>
              </div>
            </div>
          </div>

          {/* Contract Details */}
          {(client.contractStart || client.contractEnd || client.notes) && (
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2 text-xs">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Contract Details</div>
              {client.contractStart && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Contract Start:</span>
                  <span className="font-semibold text-white">{client.contractStart}</span>
                </div>
              )}
              {client.contractEnd && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Contract End:</span>
                  <span className="font-semibold text-white">{client.contractEnd}</span>
                </div>
              )}
              {client.notes && (
                <div className="pt-2 text-slate-300 leading-relaxed">{client.notes}</div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-800 flex justify-end">
          <button onClick={onClose} className="btn-secondary text-xs">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Client Form ──────────────────────────────────────────────────────────────
function ClientFormFields({ form, onChange }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Company Name *">
          <input className="input-spot" value={form.company} onChange={e => onChange('company', e.target.value)} placeholder="e.g. ETON Properties Corp." />
        </Field>
        <Field label="Status">
          <select className="input-spot" value={form.status} onChange={e => onChange('status', e.target.value)}>
            <option>Active</option>
            <option>Inactive</option>
            <option>Pending</option>
            <option>Suspended</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Contact Officer">
          <input className="input-spot" value={form.contactPerson} onChange={e => onChange('contactPerson', e.target.value)} placeholder="e.g. Maria Santos" />
        </Field>
        <Field label="Lead Supervisor">
          <input className="input-spot" value={form.supervisor} onChange={e => onChange('supervisor', e.target.value)} placeholder="e.g. James Reyes" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Email Address">
          <input className="input-spot" type="email" value={form.email} onChange={e => onChange('email', e.target.value)} placeholder="contact@company.com" />
        </Field>
        <Field label="Phone Number">
          <input className="input-spot" value={form.phone} onChange={e => onChange('phone', e.target.value)} placeholder="+63 2 8000 0000" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Contract Start">
          <input className="input-spot" type="date" value={form.contractStart} onChange={e => onChange('contractStart', e.target.value)} />
        </Field>
        <Field label="Contract End">
          <input className="input-spot" type="date" value={form.contractEnd} onChange={e => onChange('contractEnd', e.target.value)} />
        </Field>
      </div>
      <Field label="Notes / Remarks">
        <textarea
          className="input-spot resize-none"
          rows={3}
          value={form.notes}
          onChange={e => onChange('notes', e.target.value)}
          placeholder="Additional information about the client..."
        />
      </Field>
    </>
  );
}

function ClientLoginFields({ form, onChange }) {
  return (
    <div className="mt-5 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-3">
      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-cyan-300">Client portal login</div>
        <p className="mt-1 text-[11px] text-slate-400">These credentials let the client sign in and view only assigned operations.</p>
      </div>
      <Field label="Initial Password *">
        <input className="input-spot" type="password" minLength={6} required value={form.accountPassword} onChange={e => onChange('accountPassword', e.target.value)} placeholder="At least 6 characters" />
      </Field>
    </div>
  );
}

const EMPTY_CLIENT = {
  company: '', contactPerson: '', email: '', phone: '',
  supervisor: '', status: 'Active', contractStart: '', contractEnd: '', notes: '', accountPassword: ''
};

// ─── Main Clients Page ────────────────────────────────────────────────────────
export default function Clients() {
  const { clients, addClient, updateClient, deleteClient, addToast } = useSpot();
  const { createManagedAccount } = useAuth();
  const { setManagedPassword } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [detailClient, setDetailClient] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [addForm, setAddForm] = useState(EMPTY_CLIENT);
  const [editForm, setEditForm] = useState(EMPTY_CLIENT);
  const [saving, setSaving] = useState(false);

  const filtered = clients.filter((c) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q ||
      (c.company || '').toLowerCase().includes(q) ||
      (c.contactPerson || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'All' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleAdd = async () => {
    if (!addForm.company.trim() || !addForm.email.trim() || !addForm.contactPerson.trim() || addForm.accountPassword.length < 6) return;
    setSaving(true);
    let clientId = null;
    try {
      clientId = await addClient(addForm);
      const account = await createManagedAccount({
        name: addForm.contactPerson,
        email: addForm.email,
        password: addForm.accountPassword,
        role: 'client',
        clientId,
        company: addForm.company,
        phone: addForm.phone
        ,contractEnd: addForm.contractEnd
      });
      await updateClient(clientId, { accountUid: account.uid, loginEnabled: true });
      setAddForm(EMPTY_CLIENT);
      setShowAdd(false);
    } catch (error) {
      if (clientId) await deleteClient(clientId);
      addToast('Client Login Not Created', error.message || 'The client record was not linked to a login.', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (client) => {
    setDetailClient(null);
    setEditForm({
      company: client.company || '',
      contactPerson: client.contactPerson || '',
      email: client.email || '',
      phone: client.phone || '',
      supervisor: client.supervisor || '',
      status: client.status || 'Active',
      contractStart: client.contractStart || '',
      contractEnd: client.contractEnd || '',
      notes: client.notes || ''
    });
    setEditTarget(client);
  };

  const handleEdit = async () => {
    if (!editForm.company.trim()) return;
    setSaving(true);
    await updateClient(editTarget.id, editForm);
    setSaving(false);
    setEditTarget(null);
  };

  const openDelete = (client) => {
    setDetailClient(null);
    setDeleteTarget(client);
  };

  const handleDelete = async () => {
    await deleteClient(deleteTarget.id);
    setDeleteTarget(null);
  };

  const handlePassword = async (client) => {
    const password = window.prompt(`Set a temporary password for ${client.company} (minimum 6 characters):`);
    if (!password) return;
    try {
      if (client.accountUid) {
        await setManagedPassword(client.accountUid, password);
      } else {
        const account = await createManagedAccount({
          name: client.contactPerson,
          email: client.email,
          password,
          role: 'client',
          clientId: client.id,
          company: client.company,
          phone: client.phone,
          contractEnd: client.contractEnd
        });
        await updateClient(client.id, { accountUid: account.uid, loginEnabled: true });
      }
      addToast('Password Updated', `${client.company} can sign in with the temporary password.`, 'success');
    } catch (error) {
      addToast('Password Update Failed', error.message, 'danger');
    }
  };

  const statusBadge = (status) => {
    if (status === 'Active') return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    if (status === 'Pending') return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    if (status === 'Suspended') return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
    return 'bg-slate-800 text-slate-400 border-slate-700';
  };

  return (
    <Layout
      title="Client Organization Directory"
      subtitle="Contract Accounts, Security Deployment Coverage & SLA Metrics"
    >
      <div className="space-y-6">
        {/* Header: Search + Filters + Add */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 card-spot p-4">
          <div className="relative flex-1 w-full max-w-md">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by company, contact, or email..."
              className="input-spot pl-10"
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
              {['All', 'Active', 'Inactive', 'Pending', 'Suspended'].map((st) => (
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
              <Plus className="h-4 w-4" /> Add Client
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Clients', value: clients.length, color: 'text-white' },
            { label: 'Active Accounts', value: clients.filter(c => c.status === 'Active').length, color: 'text-emerald-400' },
            { label: 'Total Sites', value: clients.reduce((a, c) => a + (c.deploymentsCount || 0), 0), color: 'text-blue-400' },
            { label: 'Guards Deployed', value: clients.reduce((a, c) => a + (c.assignedGuards || 0), 0), color: 'text-amber-400' }
          ].map((stat) => (
            <div key={stat.label} className="card-spot p-4">
              <div className="text-xs text-slate-400">{stat.label}</div>
              <div className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Client Cards Grid */}
        {filtered.length === 0 ? (
          <div className="card-spot py-20 flex flex-col items-center gap-4">
            <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700">
              <Briefcase className="h-8 w-8 text-slate-500" />
            </div>
            <div className="text-sm font-semibold text-slate-400">
              {clients.length === 0 ? 'No clients registered yet' : 'No clients match your search'}
            </div>
            <div className="text-xs text-slate-500">
              {clients.length === 0 ? 'Click "Add Client" to onboard a new client organization.' : 'Try adjusting your search or filter.'}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filtered.map((client) => (
              <div
                key={client.id}
                className="card-spot flex flex-col justify-between space-y-4 cursor-pointer hover:-translate-y-0.5 transition-all duration-200 hover:border-blue-500/40 group"
                onClick={() => setDetailClient(client)}
              >
                <div>
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                        <Briefcase className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-white leading-tight">{client.company}</h3>
                        <span className="text-xs font-mono text-blue-400">{client.id}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${statusBadge(client.status)}`}>
                        {client.status}
                      </span>
                      {/* Action Buttons */}
                      <button
                        onClick={(e) => { e.stopPropagation(); openEdit(client); }}
                        title="Edit Client"
                        className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-amber-400 hover:text-white hover:border-amber-500 transition opacity-0 group-hover:opacity-100"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); openDelete(client); }}
                        title="Delete Client"
                        className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-rose-400 hover:text-white hover:border-rose-500 transition opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-400 flex items-center gap-1.5"><UserCheck className="h-3.5 w-3.5" />Contact Officer:</span>
                      <span className="font-semibold text-white">{client.contactPerson}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-400 flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />Email:</span>
                      <span className="font-mono text-slate-200">{client.email}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-400 flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />Phone:</span>
                      <span className="font-semibold text-slate-200">{client.phone}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-400 flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" />Supervisor:</span>
                      <span className="font-semibold text-blue-400">{client.supervisor}</span>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                      <div className="text-[10px] text-slate-400">Sites</div>
                      <div className="text-sm font-bold text-white mt-0.5">{client.deploymentsCount}</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                      <div className="text-[10px] text-slate-400">Guards</div>
                      <div className="text-sm font-bold text-emerald-400 mt-0.5">{client.assignedGuards}</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                      <div className="text-[10px] text-slate-400">SLA Rate</div>
                      <div className="text-sm font-bold text-blue-400 mt-0.5">{client.slaCompliance}%</div>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-blue-400 font-semibold">
                  <span>View Full Profile</span>
                  <span>→</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {filtered.length > 0 && (
          <div className="text-xs text-slate-500 text-right">
            Showing <span className="text-slate-300 font-semibold">{filtered.length}</span> of{' '}
            <span className="text-slate-300 font-semibold">{clients.length}</span> clients
          </div>
        )}
      </div>

      {/* ── Client Detail Modal ───────────────────────────────── */}
      {detailClient && (
        <ClientDetailModal
          client={detailClient}
          onClose={() => setDetailClient(null)}
          onEdit={() => openEdit(detailClient)}
          onDelete={() => openDelete(detailClient)}
          onPassword={() => handlePassword(detailClient)}
        />
      )}

      {/* ── Add Client Modal ──────────────────────────────────── */}
      {showAdd && (
        <Modal
          title="Onboard New Client"
          subtitle="Register a new client organization to the system"
          onClose={() => { setShowAdd(false); setAddForm(EMPTY_CLIENT); }}
          footer={
            <>
              <button onClick={() => { setShowAdd(false); setAddForm(EMPTY_CLIENT); }} className="btn-secondary text-xs">Cancel</button>
              <button onClick={handleAdd} disabled={saving || !addForm.company.trim() || !addForm.contactPerson.trim() || !addForm.email.trim() || addForm.accountPassword.length < 6} className="btn-primary text-xs flex items-center gap-2">
                {saving ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Check className="h-3.5 w-3.5" />}
                Save Client
              </button>
            </>
          }
        >
          <ClientFormFields form={addForm} onChange={(k, v) => setAddForm(f => ({ ...f, [k]: v }))} />
          <ClientLoginFields form={addForm} onChange={(k, v) => setAddForm(f => ({ ...f, [k]: v }))} />
        </Modal>
      )}

      {/* ── Edit Client Modal ─────────────────────────────────── */}
      {editTarget && (
        <Modal
          title="Edit Client Record"
          subtitle={`Editing: ${editTarget.company}`}
          onClose={() => setEditTarget(null)}
          footer={
            <>
              <button onClick={() => setEditTarget(null)} className="btn-secondary text-xs">Cancel</button>
              <button onClick={handleEdit} disabled={saving || !editForm.company.trim()} className="btn-primary text-xs flex items-center gap-2">
                {saving ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Check className="h-3.5 w-3.5" />}
                Save Changes
              </button>
            </>
          }
        >
          <ClientFormFields form={editForm} onChange={(k, v) => setEditForm(f => ({ ...f, [k]: v }))} />
        </Modal>
      )}

      {/* ── Delete Confirmation ───────────────────────────────── */}
      {deleteTarget && (
        <DeleteConfirm
          label={deleteTarget.company}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}
    </Layout>
  );
}
