import { createContext, useContext, useEffect, useState } from 'react';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  setPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile
  ,getIdTokenResult
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, functions, hasFirebaseConfig, createIsolatedAuth } from '../lib/firebase';

const AuthContext = createContext(null);
const LOCAL_AUTH_KEY = 'spot.local.session';

export const ROLES = Object.freeze({
  SUPER_ADMIN: 'superadmin',
  ADMIN: 'admin',
  CLIENT: 'client',
  GUARD: 'guard'
});

export function normalizeRole(role) {
  const value = String(role || '').trim().toLowerCase();
  if (
    value === 'supervisor' ||
    value === 'supervisor command officer' ||
    value === 'super admin' ||
    value === 'supervisor admin' ||
    value === 'supervisor_admin'
  ) {
    return ROLES.SUPER_ADMIN;
  }
  if (Object.values(ROLES).includes(value)) return value;
  return value || ROLES.GUARD;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const configError = hasFirebaseConfig ? '' : 'Firebase configuration missing in .env. Running with local authentication.';

  useEffect(() => {
    if (hasFirebaseConfig && auth) {
      const unsub = onAuthStateChanged(auth, async (u) => {
        setUser(u);
        if (u) {
          try {
            const token = await getIdTokenResult(u, true);
            const claims = token.claims || {};
            if (db) {
              const snap = await getDoc(doc(db, 'users', u.uid));
              const profileData = snap.exists() ? snap.data() : {};
              const normalizedRole = normalizeRole(profileData.role || claims.role);
              setProfile(snap.exists()
                ? { id: u.uid, ...profileData, role: normalizedRole, clientId: profileData.clientId || claims.clientId || '' }
                : { id: u.uid, role: normalizedRole, clientId: claims.clientId || '', name: u.displayName || u.email, agency: '', phone: '' }
              );
            } else {
              setProfile({ id: u.uid, role: normalizeRole(claims.role), clientId: claims.clientId || '', name: u.displayName || u.email, agency: '', phone: '' });
            }
          } catch {
            setProfile({ id: u.uid, role: ROLES.GUARD, name: u.displayName || u.email, agency: '', phone: '' });
          }
        } else {
          setProfile(null);
        }
        setLoading(false);
      });
      return () => unsub();
    } else {
      try {
        const stored = localStorage.getItem(LOCAL_AUTH_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setUser(parsed.user);
          setProfile(parsed.profile);
        }
      } catch {
        // invalid session
      }
      setLoading(false);
    }
  }, []);

  const login = async (email, password, rememberDevice = false) => {
    const trimmedEmail = email?.trim();
    if (!trimmedEmail || !password) {
      throw new Error('Please enter both email and password.');
    }

    if (hasFirebaseConfig && auth) {
      await setPersistence(auth, rememberDevice ? browserLocalPersistence : browserSessionPersistence);
      await signInWithEmailAndPassword(auth, trimmedEmail, password);
    } else {
      const uid = `local-${Date.now()}`;
      const sessionUser = { uid, email: trimmedEmail };
      const sessionProfile = {
        id: uid,
        name: trimmedEmail.split('@')[0].toUpperCase(),
        email: trimmedEmail,
        role: ROLES.SUPER_ADMIN,
        agency: 'S.P.O.T Command HQ',
        phone: '+63 917 555 0100'
      };

      setUser(sessionUser);
      setProfile(sessionProfile);

      if (rememberDevice) {
        localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify({ user: sessionUser, profile: sessionProfile }));
      }
    }
  };

  const logout = async () => {
    if (hasFirebaseConfig && auth) {
      await signOut(auth);
    }
    localStorage.removeItem(LOCAL_AUTH_KEY);
    setUser(null);
    setProfile(null);
  };

  const updateAccountProfile = async ({ name, role, agency, phone }) => {
    if (!user) throw new Error('No active user session.');
    const trimmedName = name?.trim();
    if (!trimmedName) throw new Error('Display name is required.');

    const normalizedRole = normalizeRole(role || profile?.role);
    const patch = {
      name: trimmedName,
      role: normalizedRole,
      agency: agency || profile?.agency || 'S.P.O.T Command HQ',
      phone: phone || profile?.phone || ''
    };

    if (hasFirebaseConfig && db && auth?.currentUser) {
      try {
        await updateDoc(doc(db, 'users', user.uid), patch);
        await updateProfile(auth.currentUser, { displayName: trimmedName });
      } catch (err) {
        console.warn('Firestore profile update notice:', err);
      }
    }

    const updatedProfile = { ...(profile || {}), id: user.uid, ...patch };
    setProfile(updatedProfile);
    if (!hasFirebaseConfig) {
      localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify({ user, profile: updatedProfile }));
    }
  };

  const hasRole = (...roles) => roles.map(normalizeRole).includes(normalizeRole(profile?.role));

  const changePassword = async ({ currentPassword, newPassword }) => {
    if (!user?.email) throw new Error('No active user session.');
    if (!currentPassword || !newPassword) throw new Error('Current and new password are required.');
    if (newPassword.length < 6) throw new Error('New password must be at least 6 characters.');

    if (hasFirebaseConfig && auth?.currentUser) {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);
    }
  };

  const createManagedAccount = async (account) => {
    if (!hasFirebaseConfig || !functions) {
      throw new Error('Firebase Functions are required to create managed accounts.');
    }
    const payload = { ...account, role: normalizeRole(account.role) };
    try {
      const createAccount = httpsCallable(functions, 'createManagedAccount');
      const result = await createAccount(payload);
      return result.data;
    } catch (error) {
      if (!['functions/not-found', 'functions/unavailable', 'functions/internal'].includes(error.code)) throw error;
      const isolated = createIsolatedAuth();
      try {
        const result = await createUserWithEmailAndPassword(isolated.auth, payload.email, payload.password);
        const profileData = {
          id: result.user.uid,
          email: payload.email,
          name: payload.name,
          displayName: payload.name,
          role: payload.role,
          clientId: payload.clientId || '',
          company: payload.company || '',
          phone: payload.phone || '',
          contractEnd: payload.contractEnd || '',
          status: 'Active',
          createdAt: new Date().toISOString()
        };
        await setDoc(doc(db, 'users', result.user.uid), profileData);
        return { uid: result.user.uid, email: payload.email, role: payload.role, clientId: payload.clientId || '' };
      } finally {
        await isolated.dispose();
      }
    }
  };

  const setManagedPassword = async (uid, password) => {
    if (!hasFirebaseConfig || !functions) throw new Error('Firebase Functions are required to change managed passwords.');
    const result = await httpsCallable(functions, 'setManagedPassword')({ uid, password });
    return result.data;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        login,
        logout,
        updateAccountProfile,
        changePassword,
        createManagedAccount,
        setManagedPassword,
        hasRole,
        role: normalizeRole(profile?.role),
        configError
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
