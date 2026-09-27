import assert from 'node:assert/strict';
import {initializeApp, deleteApp} from 'firebase/app';
import {getAuth, connectAuthEmulator, signInAnonymously} from 'firebase/auth';
import {getFirestore, connectFirestoreEmulator, collection, doc, setDoc, getDocsFromServer, getDocFromServer, query, where, documentId, limit} from 'firebase/firestore';

// All requests use the isolated local demo project; no production credentials or data.
const projectId = 'demo-spot-offline';
const app = initializeApp({projectId, apiKey: 'demo-key', appId: 'demo-app'});
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9098', {disableWarnings: true});
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8086);
const uid = (await signInAnonymously(auth)).user.uid;
const adminBase = `http://127.0.0.1:8086/v1/projects/${projectId}/databases/(default)/documents`;
const seed = await fetch(`${adminBase}/users/${uid}`, {method: 'PATCH', headers: {'Authorization': 'Bearer owner', 'Content-Type': 'application/json'}, body: JSON.stringify({fields:{role:{stringValue:'guard'},assignedSiteId:{stringValue:'test-site'}}})});
assert.equal(seed.status, 200, await seed.text());
let checks = 0;
for (const name of ['locationHistory', 'incidents']) {
  const id = `test-${uid}-${name}`;
  const ref = doc(db, name, id);
  const owner = where('guardId', '==', uid);
  const oldQuery = query(collection(db, name), owner, where(documentId(), '==', id));
  try {
    const result = await getDocsFromServer(oldQuery);
    console.log(`${name}: original query returned ${result.size} rows`);
  } catch (e) {
    assert.equal(e.code, 'permission-denied');
    console.log(`${name}: reproduced original query PERMISSION_DENIED for missing record`);
  }
  const fixedQuery = query(collection(db, name), owner, where('offlineActionId', '==', id), limit(1));
  assert.equal((await getDocsFromServer(fixedQuery)).empty, true); checks++;
  await setDoc(ref, {guardId:uid, siteId:'test-site', offlineActionId:id, title:'Test evidence'}); checks++;
  assert.equal((await getDocsFromServer(fixedQuery)).size, 1); checks++;
  // A retry detects the existing record; immutable evidence is not overwritten.
  await assert.rejects(setDoc(ref, {guardId:uid, siteId:'test-site', offlineActionId:id, title:'Overwrite'}), {code:'permission-denied'}); checks++;
  assert.equal((await getDocFromServer(ref)).data().title, 'Test evidence'); checks++;
  await assert.rejects(getDocsFromServer(query(collection(db, name), where('guardId', '==', 'another-guard'), where('offlineActionId', '==', id), limit(1))), {code:'permission-denied'}); checks++;
  await assert.rejects(setDoc(doc(db, name, `wrong-owner-${uid}`), {guardId:'another-guard',offlineActionId:'wrong'}), {code:'permission-denied'}); checks++;
  console.log(`${name}: corrected lookup, create, retry and owner restrictions passed`);
}
console.log(`${checks} emulator assertions passed against the user's exact rules.`);
await deleteApp(app);
