import assert from 'node:assert/strict';
import {initializeApp, deleteApp} from 'firebase/app';
import {getAuth, connectAuthEmulator, signInAnonymously} from 'firebase/auth';
import {getFirestore, connectFirestoreEmulator, collection, doc, getDocFromServer,
  getDocsFromServer, query, where, runTransaction, serverTimestamp} from 'firebase/firestore';

// Permission/transaction integration checks, not a substitute for Android face-flow testing.
const projectId = 'demo-spot-offline';
const app = initializeApp({projectId, apiKey:'demo-key', appId:'demo-attendance'});
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9098', {disableWarnings:true});
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8086);
const uid = (await signInAnonymously(auth)).user.uid;
const seed = await fetch(`http://127.0.0.1:8086/v1/projects/${projectId}/databases/(default)/documents/users/${uid}`, {
  method:'PATCH', headers:{Authorization:'Bearer owner', 'Content-Type':'application/json'},
  body:JSON.stringify({fields:{role:{stringValue:'guard'},assignedSiteId:{stringValue:'site-1'}}})
});
assert.equal(seed.status, 200);
const user = doc(db, 'users', uid);
const attendance = collection(db, 'attendance');
const owned = query(attendance, where('guardId','==',uid));
assert.equal((await getDocsFromServer(owned)).size, 0);

// The profile pointer serializes simultaneous login transactions.
async function openShift() {
  const candidate = doc(attendance);
  return runTransaction(db, async tx => {
    const profile = await tx.get(user);
    const active = profile.data().activeAttendanceId;
    if (active) {
      const existing = await tx.get(doc(attendance,active));
      assert.equal(existing.data().status, 'ON_DUTY');
      return active;
    }
    tx.set(candidate, {guardId:uid,siteId:'site-1',status:'ON_DUTY',timeIn:'10:00 PM',
      date:'2026-09-25',timeOut:'',timeInAt:serverTimestamp(),timeOutAt:null});
    tx.update(user,{activeAttendanceId:candidate.id});
    return candidate.id;
  });
}
const ids = await Promise.all([openShift(),openShift()]);
assert.equal(ids[0],ids[1]);
assert.equal((await getDocsFromServer(owned)).size,1);
const shift = doc(attendance,ids[0]);
const original = (await getDocFromServer(shift)).data();
assert.ok(original.timeInAt.toMillis() > 0);

// A rejected write must roll back the pointer as well.
await assert.rejects(runTransaction(db, async tx => {
  await tx.get(user);
  tx.set(doc(attendance),{guardId:'other-guard',status:'ON_DUTY'});
  tx.update(user,{activeAttendanceId:'invalid'});
}), {code:'permission-denied'});
assert.equal((await getDocFromServer(user)).data().activeAttendanceId,shift.id);

// Closing a shift from the preceding calendar date keeps its original site/date.
await runTransaction(db, async tx => {
  await tx.get(user);
  await tx.get(shift);
  tx.update(shift,{status:'SHIFT_ENDED',timeOut:'06:00 AM',timeOutAt:serverTimestamp(),logoutFaceVerified:true});
  tx.update(user,{activeAttendanceId:''});
});
const ended = (await getDocFromServer(shift)).data();
assert.equal(ended.siteId,original.siteId);
assert.equal(ended.date,original.date);
assert.equal(ended.timeInAt.toMillis(),original.timeInAt.toMillis());
assert.ok(ended.timeOutAt.toMillis() >= ended.timeInAt.toMillis());
assert.equal((await getDocFromServer(user)).data().activeAttendanceId,'');
await assert.rejects(getDocsFromServer(query(attendance,where('guardId','==','other-guard'))),{code:'permission-denied'});
console.log('Attendance rules checks passed: own reads, concurrent atomic open, server timestamps, rejected-write rollback, overnight close, and cross-guard read denial.');
await deleteApp(app);
