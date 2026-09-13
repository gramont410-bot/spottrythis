import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadString } from 'firebase/storage';
import { db, auth, hasFirebaseConfig, storage } from './firebase';

const noop = () => {};

export function subscribeCollection(name, cb, onError = () => {}, constraints = []) {
  if (!hasFirebaseConfig) {
    cb([]);
    return noop;
  }

  const source = constraints.length ? query(collection(db, name), ...constraints) : collection(db, name);
  return onSnapshot(source, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, onError);
}

function logAdminAction(action, collectionName, targetId, details = {}) {
  // Prevent infinite loops and don't log to the log itself
  if (collectionName === 'adminLogs' || !hasFirebaseConfig) return;
  
  const userId = auth.currentUser?.uid || 'system';
  
  // Fire and forget
  addDoc(collection(db, 'adminLogs'), {
    action,
    collection: collectionName,
    targetId,
    details,
    userId,
    timestamp: serverTimestamp()
  }).catch(() => {});
}

export async function addItem(name, data) {
  const ref = await addDoc(collection(db, name), { ...data, createdAt: serverTimestamp() });
  logAdminAction('CREATE', name, ref.id, data);
  return ref.id;
}

export async function setItem(name, id, data) {
  await setDoc(doc(db, name, id), { ...data, createdAt: serverTimestamp() }, { merge: true });
  logAdminAction('UPDATE', name, id, data);
  return id;
}

export async function updateItem(name, id, patch) {
  await updateDoc(doc(db, name, id), patch);
  logAdminAction('UPDATE', name, id, patch);
}

export async function removeItem(name, id) {
  await deleteDoc(doc(db, name, id));
  logAdminAction('DELETE', name, id, { id });
}

export async function uploadDataUrl(path, dataUrl) {
  if (!hasFirebaseConfig || !storage || !dataUrl) return '';

  const fileRef = ref(storage, path);
  await uploadString(fileRef, dataUrl, 'data_url');
  return getDownloadURL(fileRef);
}
