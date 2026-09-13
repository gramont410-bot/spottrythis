import React, { useState } from "react";
import Layout from "../components/Layout";
import { useSpot } from "../context/SpotContext";
import { useAuth } from "../context/AuthContext";
import {
  Settings,
  Shield,
  Users,
  Bell,
  Sliders,
  Database,
  Save,
  ArrowUpRight,
  HelpCircle,
  BookOpen,
  Users2,
  GraduationCap,
  BarChart2,
  MapPin,
  QrCode,
  ShieldCheck,
  AlertTriangle,
  MessageSquare,
} from "lucide-react";

const TABS = [
  { id: "organization", label: "Organization" },
  { id: "teams", label: "Teams" },
  { id: "users", label: "Users" },
  { id: "patrol", label: "Patrol Config" },
  { id: "notifications", label: "Notifications" },
  { id: "integrations", label: "Integrations" },
  { id: "diagnostics", label: "Diagnostics" },
];

function StatCard({ icon: Icon, title, value, max, unit, percent, accent, highlight }) {
  const bars = 8;
  const filled = Math.round((percent / 100) * bars);
  return (
    <div
      className="relative rounded-[20px] p-5 flex flex-col justify-between overflow-hidden transition-all duration-200 hover:scale-[1.02]"
      style={{
        background: highlight ? "#d4f542" : "#1E293B",
        border: highlight ? "none" : "1px solid #1e3a5f",
        minHeight: "160px",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-xs font-semibold"
          style={{ color: highlight ? "#1a1a1a" : "#94a3b8" }}
        >
          <Icon className="h-4 w-4" />
          {title}
        </div>
        <button
          className="rounded-full p-1 transition"
          style={{ color: highlight ? "#1a1a1a99" : "#475569" }}
        >
          <svg width="14" height="14" viewBox="0 0 16 4" fill="currentColor">
            <circle cx="2" cy="2" r="1.5" />
            <circle cx="8" cy="2" r="1.5" />
            <circle cx="14" cy="2" r="1.5" />
          </svg>
        </button>
      </div>
      <div className="flex items-end gap-3 mb-1">
        <span
          className="text-5xl font-black tracking-tighter leading-none"
          style={{ color: highlight ? "#111" : "#f1f5f9" }}
        >
          {value}
        </span>
        <div className="mb-1 flex flex-col items-start gap-1">
          <span
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
            style={{
              background: highlight ? "#111" : accent + "22",
              color: highlight ? "#d4f542" : accent,
            }}
          >
            {percent}%
            <span
              className="inline-block h-3 w-3 rounded-full border-2"
              style={{ borderColor: highlight ? "#d4f542" : accent }}
            />
          </span>
          <span
            className="text-[11px] font-medium"
            style={{ color: highlight ? "#111" : "#475569" }}
          >
            / {max} {unit}
          </span>
        </div>
      </div>
      <div className="flex gap-1 mt-2">
        {Array.from({ length: bars }).map((_, i) => (
          <div
            key={i}
            className="flex-1 rounded-full transition-all duration-300"
            style={{
              height: "10px",
              background: i < filled
                ? (highlight ? "#111" : accent)
                : (highlight ? "#11111166" : "#1e3a5f"),
              opacity: i < filled ? 1 : 0.35,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ResourceLink({ icon: Icon, title, description }) {
  return (
    <button className="w-full flex items-start justify-between p-3.5 rounded-[14px] border border-slate-800/80 bg-[#1a2540]/60 hover:bg-[#1e2d4a] hover:border-slate-700 transition-all duration-150 group text-left">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-800/80 text-slate-400 group-hover:text-slate-200 transition">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-200 group-hover:text-white transition">{title}</div>
          {description && (
            <div className="mt-0.5 text-[11px] text-slate-500 group-hover:text-slate-400 transition line-clamp-1">{description}</div>
          )}
        </div>
      </div>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-600 group-hover:text-slate-300 transition mt-0.5" />
    </button>
  );
}

function OrganizationTab({ livenessThreshold, setLivenessThreshold, gpsTolerance, setGpsTolerance, qrStrict, setQrStrict, handleSave }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard icon={ShieldCheck} title="Active Guards" value="47" max="60" unit="Total" percent={78} accent="#3b82f6" />
        <StatCard icon={MapPin} title="Patrol Checkpoints" value="163" max="200" unit="Zones" percent={81} accent="#22c55e" highlight />
        <StatCard icon={AlertTriangle} title="Open Incidents" value="8" max="50" unit="Max" percent={16} accent="#f59e0b" />
      </div>

      <div
        className="relative rounded-[20px] overflow-hidden flex items-center justify-between p-5"
        style={{ background: "linear-gradient(120deg, #0f172a 60%, #1e293b)", border: "1px solid #1e3a5f" }}
      >
        <div className="space-y-1">
          <div className="text-[11px] font-semibold text-blue-400 uppercase tracking-widest">S.P.O.T Enterprise</div>
          <div className="text-lg font-black text-white leading-tight">Scale Your<br />Security Operations</div>
          <p className="text-xs text-slate-400 max-w-xs">Unlock unlimited guard slots, advanced analytics, and AI-driven threat prediction.</p>
        </div>
        <div className="shrink-0 ml-4">
          <button className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-slate-900 shadow-lg hover:bg-slate-100 transition-all duration-200 hover:scale-105">
            Upgrade
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </div>
        <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-blue-500/10 pointer-events-none" />
        <div className="absolute -right-4 -bottom-6 h-24 w-24 rounded-full bg-blue-600/10 pointer-events-none" />
      </div>

      <div className="rounded-[20px] border border-slate-800/80 bg-[#1E293B] p-5 space-y-5">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-3 flex items-center gap-2">
          <Sliders className="h-3.5 w-3.5 text-blue-400" />
          Patrol Operational Tolerances
        </h3>
        <div className="space-y-5 text-xs">
          <div>
            <div className="flex justify-between font-semibold mb-2">
              <span className="text-slate-300">Biometric Face Liveness Threshold</span>
              <span className="font-mono text-blue-400 bg-blue-500/10 rounded-full px-2 py-0.5">{livenessThreshold}% Pass Score</span>
            </div>
            <input
              type="range" min="80" max="99" value={livenessThreshold}
              onChange={(e) => setLivenessThreshold(e.target.value)}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer"
              style={{ accentColor: "#3b82f6", background: `linear-gradient(to right, #3b82f6 ${((livenessThreshold - 80) / 19) * 100}%, #1e3a5f ${((livenessThreshold - 80) / 19) * 100}%)` }}
            />
            <p className="mt-1.5 text-[11px] text-slate-500">Requires AI liveness confidence before checkpoint verification.</p>
          </div>
          <div>
            <div className="flex justify-between font-semibold mb-2">
              <span className="text-slate-300">GPS Geofence Tolerance Radius</span>
              <span className="font-mono text-emerald-400 bg-emerald-500/10 rounded-full px-2 py-0.5">{gpsTolerance} Meters</span>
            </div>
            <input
              type="range" min="5" max="50" value={gpsTolerance}
              onChange={(e) => setGpsTolerance(e.target.value)}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer"
              style={{ accentColor: "#22c55e", background: `linear-gradient(to right, #22c55e ${((gpsTolerance - 5) / 45) * 100}%, #1e3a5f ${((gpsTolerance - 5) / 45) * 100}%)` }}
            />
          </div>
          <div
            className="flex items-center justify-between p-3.5 rounded-[14px] bg-slate-900/60 border border-slate-800 cursor-pointer select-none"
            onClick={() => setQrStrict(!qrStrict)}
          >
            <div className="flex items-center gap-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition ${qrStrict ? "bg-blue-500/20" : "bg-slate-800"}`}>
                <QrCode className={`h-4 w-4 ${qrStrict ? "text-blue-400" : "text-slate-500"}`} />
              </div>
              <div>
                <div className="font-bold text-white">Enforce Sequential QR Checkpoint Scans</div>
                <div className="text-[11px] text-slate-400">Guards cannot bypass checkpoints out of order</div>
              </div>
            </div>
            <div className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${qrStrict ? "bg-blue-600" : "bg-slate-700"}`}>
              <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${qrStrict ? "translate-x-5" : "translate-x-0"}`} />
            </div>
          </div>
        </div>
        <div className="pt-3 border-t border-slate-800 flex justify-end">
          <button onClick={handleSave} className="btn-primary py-2 px-5 text-xs font-bold flex items-center gap-2">
            <Save className="h-4 w-4" /> Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}

function DiagnosticsTab() {
  const items = [
    { label: "Database Engine", value: "Cloud Firestore v10.12.2", color: "text-emerald-400" },
    { label: "Realtime Listener", value: "Connected & Listening", color: "text-emerald-400" },
    { label: "Auth Provider", value: "Firebase Authentication", color: "text-blue-400" },
    { label: "Telemetry Push", value: "Active (WebSocket)", color: "text-emerald-400" },
    { label: "Geofence Engine", value: "Running - 47 Active Zones", color: "text-blue-400" },
    { label: "AI Liveness API", value: "Online - avg 340ms", color: "text-emerald-400" },
    { label: "Last Backup", value: "Today, 03:00 AM", color: "text-slate-300" },
  ];
  return (
    <div className="rounded-[20px] border border-slate-800/80 bg-[#1E293B] p-5 space-y-3">
      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-3 flex items-center gap-2">
        <Database className="h-3.5 w-3.5 text-emerald-400" />
        Firebase Cloud Sync & System Diagnostics
      </h3>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between rounded-[12px] bg-slate-900/60 border border-slate-800 px-4 py-3 text-xs">
            <span className="text-slate-400">{item.label}</span>
            <span className={`font-mono font-semibold ${item.color}`}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountAccessTab() {
  const { createManagedAccount } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'admin', clientId: '', company: '' });
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setStatus('');
    try {
      await createManagedAccount(form);
      setStatus('Account created. The user can sign in with the credentials provided.');
      setForm({ name: '', email: '', password: '', role: 'admin', clientId: '', company: '' });
    } catch (error) {
      setStatus(error.message || 'Account creation failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5 rounded-[20px] border border-slate-800/80 bg-[#1E293B] p-5">
      <div><h3 className="text-sm font-bold text-white">Create managed account</h3><p className="mt-1 text-xs text-slate-400">Only SuperAdmins can provision platform access. Client accounts must reference their client record ID.</p></div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <input required className="input-spot" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Full name" />
        <select className="input-spot" value={form.role} onChange={(e) => update('role', e.target.value)}><option value="admin">Admin</option><option value="client">Client</option><option value="superadmin">SuperAdmin</option></select>
        <input required type="email" className="input-spot" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="Email address" />
        <input required minLength={6} type="password" className="input-spot" value={form.password} onChange={(e) => update('password', e.target.value)} placeholder="Temporary password" />
        <input className="input-spot" value={form.company} onChange={(e) => update('company', e.target.value)} placeholder="Company / agency" />
        <input className="input-spot" value={form.clientId} onChange={(e) => update('clientId', e.target.value)} placeholder="Client record ID (for Client)" />
      </div>
      {status && <p className={`rounded-lg border p-3 text-xs ${status.startsWith('Account created') ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-300'}`}>{status}</p>}
      <div className="flex justify-end"><button disabled={saving} className="btn-primary" type="submit"><Users className="h-4 w-4" />{saving ? 'Creating...' : 'Create account'}</button></div>
    </form>
  );
}

function PlaceholderTab({ label }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-slate-700 bg-slate-800/30 py-20 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800">
        <Settings className="h-7 w-7 text-slate-500" />
      </div>
      <p className="text-sm font-semibold text-slate-400">{label} Settings</p>
      <p className="mt-1 text-xs text-slate-600">Configuration options coming soon.</p>
    </div>
  );
}

export default function SettingsPage() {
  const { addToast } = useSpot();
  const [activeTab, setActiveTab] = useState("organization");
  const [livenessThreshold, setLivenessThreshold] = useState(95);
  const [gpsTolerance, setGpsTolerance] = useState(15);
  const [qrStrict, setQrStrict] = useState(true);

  const handleSave = () => {
    addToast("Settings Saved", "Patrol operational parameters successfully updated.", "success");
  };

  return (
    <Layout title="">
      {/* Big heading - matches reference image style */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white leading-tight tracking-tight">
            Managing{" "}
            <span className="inline-flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/20 text-lg">??</span>
              {" "}Your System
            </span>
            <br />
            and{" "}
            <span className="inline-flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#d4f542]/20 text-lg">???</span>
              {" "}Workflows
            </span>
          </h1>
          <p className="mt-2 text-sm text-slate-400 max-w-lg">
            Agency Profiles, Patrol Parameters, Liveness Thresholds & Firebase Diagnostics
          </p>
        </div>
        <button className="shrink-0 flex items-center gap-2 rounded-full bg-slate-900 border border-slate-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 hover:border-slate-600 transition-all duration-200 hover:scale-105 shadow-lg">
          <span className="text-base">+</span> Create a New Patrol Route
        </button>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-5 items-start">
        {/* LEFT: main content */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Tab navigation */}
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-150"
                style={{
                  background: activeTab === tab.id ? "#111827" : "transparent",
                  color: activeTab === tab.id ? "#fff" : "#64748b",
                  border: activeTab === tab.id ? "1px solid #334155" : "1px solid transparent",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === "organization" && (
            <OrganizationTab
              livenessThreshold={livenessThreshold}
              setLivenessThreshold={setLivenessThreshold}
              gpsTolerance={gpsTolerance}
              setGpsTolerance={setGpsTolerance}
              qrStrict={qrStrict}
              setQrStrict={setQrStrict}
              handleSave={handleSave}
            />
          )}
          {activeTab === "diagnostics" && <DiagnosticsTab />}
          {!["organization", "diagnostics"].includes(activeTab) && (
            <PlaceholderTab label={TABS.find((t) => t.id === activeTab)?.label} />
          )}
        </div>

        {/* RIGHT: Resources panel */}
        <div className="w-64 xl:w-72 shrink-0 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Users2, label: "Community" },
              { icon: GraduationCap, label: "Academy" },
            ].map(({ icon: Icon, label }) => (
              <button
                key={label}
                className="flex flex-col items-center gap-2 rounded-[16px] border border-slate-800/80 bg-[#1E293B] p-4 text-xs font-semibold text-slate-300 hover:border-slate-700 hover:text-white transition-all duration-150 hover:scale-[1.03]"
              >
                <Icon className="h-6 w-6 text-slate-400" />
                {label}
              </button>
            ))}
          </div>
          <ResourceLink icon={HelpCircle} title="Help Center" description="Explore our detailed documentation and setup guides" />
          <ResourceLink icon={Users2} title="Guard Directory" description="Find and manage your registered security guards" />
          <ResourceLink icon={MessageSquare} title="Incident Reports" description="Access filed incident reports and updates" />
          <ResourceLink icon={BarChart2} title="Analytics" description="View operational stats and performance metrics" />
          <ResourceLink icon={BookOpen} title="Use Cases" description="Get inspired by all the ways S.P.O.T can protect your sites" />
        </div>
      </div>
    </Layout>
  );
}
