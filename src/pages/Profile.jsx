import React, { useState } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { useSpot } from '../context/SpotContext';
import { UserCheck, Shield, Key, Save, Phone, Mail, Building2, CheckCircle2, Lock } from 'lucide-react';

export default function Profile() {
  const { profile, updateAccountProfile, changePassword, user } = useAuth();
  const { addToast } = useSpot();

  const [name, setName] = useState(profile?.name || '');
  const [role, setRole] = useState(profile?.role || 'superadmin');
  const [agency, setAgency] = useState(profile?.agency || 'S.P.O.T Command HQ');
  const [phone, setPhone] = useState(profile?.phone || '+63 917 555 0100');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingPass, setIsChangingPass] = useState(false);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateAccountProfile({ name, role, agency, phone });
      addToast('Profile Updated', 'Your profile details have been saved.', 'success');
    } catch (err) {
      addToast('Update Failed', err.message || 'Failed to update profile.', 'danger');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setIsChangingPass(true);
    try {
      await changePassword({ currentPassword, newPassword });
      addToast('Password Changed', 'Your account password was updated.', 'success');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      addToast('Password Change Failed', err.message || 'Failed to update password.', 'danger');
    } finally {
      setIsChangingPass(false);
    }
  };

  return (
    <Layout
      title="Supervisor Command Profile"
      subtitle="Edit Operator Profile Credentials, Roles, Agency & Security Credentials"
    >
      <div className="max-w-4xl space-y-6">
        {/* Profile Card Header */}
        <div className="card-spot flex flex-col sm:flex-row items-center gap-6 p-6">
          <div className="h-20 w-20 rounded-2xl bg-blue-600 flex items-center justify-center text-white text-3xl font-bold shadow-xl border-2 border-blue-400 shrink-0">
            {name ? name.charAt(0) : 'S'}
          </div>

          <div className="flex-1 text-center sm:text-left min-w-0">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h2 className="text-xl font-bold text-white">{name || 'Supervisor Command Officer'}</h2>
              <span className="badge-info text-xs font-bold">2FA AUTHENTICATED</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">{user?.email || 'supervisor@spot.security.org'}</p>

            <div className="mt-3 flex flex-wrap justify-center sm:justify-start gap-3 text-xs">
              <span className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300">
                Role: <strong className="text-white">{role}</strong>
              </span>
              <span className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300">
                Agency: <strong className="text-blue-400">{agency}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Dynamic Edit Profile Form */}
        <div className="card-spot space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider border-b border-slate-800 pb-3 flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-blue-400" /> Edit Profile Information
          </h3>

          <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-400 font-bold uppercase tracking-wider mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-spot"
                  placeholder="e.g. Captain Marcus Vance"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold uppercase tracking-wider mb-1">Official Role</label>
                <input
                  type="text"
                  required
                  value={role}
                  readOnly
                  className="input-spot cursor-not-allowed opacity-70"
                  aria-describedby="role-help"
                />
                <p id="role-help" className="mt-1 text-[10px] text-slate-500">Role changes are managed by a SuperAdmin.</p>
              </div>

              <div>
                <label className="block text-slate-400 font-bold uppercase tracking-wider mb-1">Agency Designation</label>
                <input
                  type="text"
                  required
                  value={agency}
                  onChange={(e) => setAgency(e.target.value)}
                  className="input-spot"
                  placeholder="e.g. S.P.O.T Command HQ"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold uppercase tracking-wider mb-1">Contact Phone</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="input-spot"
                  placeholder="+63 917 000 0000"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button type="submit" disabled={isSaving} className="btn-primary py-2 px-5 text-xs font-bold">
                <Save className="h-4 w-4 mr-1" /> {isSaving ? 'Saving Changes...' : 'Save Profile Changes'}
              </button>
            </div>
          </form>
        </div>

        {/* Change Password Form */}
        <div className="card-spot space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider border-b border-slate-800 pb-3 flex items-center gap-2">
            <Lock className="h-4 w-4 text-emerald-400" /> Security Credentials
          </h3>

          <form onSubmit={handleChangePassword} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-400 font-bold uppercase tracking-wider mb-1">Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="input-spot"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold uppercase tracking-wider mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input-spot"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button type="submit" disabled={isChangingPass || !currentPassword || !newPassword} className="btn-secondary py-2 px-5 text-xs font-bold">
                <Key className="h-4 w-4 mr-1 text-emerald-400" /> {isChangingPass ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}
