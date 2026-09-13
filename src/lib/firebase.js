import { deleteApp, initializeApp } from 'firebase/app';
import { getAnalytics, isSupported as isAnalyticsSupported } from 'firebase/analytics';
import { getAuth } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY || "AIzaSyD0Vx5ZKt7DzQI8F5INfyJddWE4d5OkiRQ",
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN || "spot-f503e.firebaseapp.com",
  projectId: import.meta.env.VITE_FB_PROJECT_ID || "spot-f503e",
  storageBucket: import.meta.env.VITE_FB_STORAGE || "spot-f503e.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FB_SENDER || "168845113005",
  appId: import.meta.env.VITE_FB_APP_ID || "1:168845113005:web:154bb5247d63e122f53824",
  measurementId: import.meta.env.VITE_FB_MEASUREMENT_ID || "G-XSZVJJLW18"
};

export const hasFirebaseConfig = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.appId
);

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const functions = getFunctions(app);

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

export const storage = getStorage(app);

export const analyticsPromise = isAnalyticsSupported()
  .then((supported) => (supported && firebaseConfig.measurementId ? getAnalytics(app) : null))
  .catch(() => null);

export function createIsolatedAuth() {
  const isolatedApp = initializeApp(
    firebaseConfig,
    `spot-account-create-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  return {
    app: isolatedApp,
    auth: getAuth(isolatedApp),
    dispose: () => deleteApp(isolatedApp)
  };
}
