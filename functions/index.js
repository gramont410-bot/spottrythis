import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import axios from 'axios';

admin.initializeApp();

async function writePatrolAudit(action, targetId, data, details) {
  await admin.firestore().collection('adminLogs').add({
    action,
    collection: data.collectionName || 'field_telemetry',
    targetId,
    actor: data.guardName || data.guardId || 'Field Guard',
    category: 'Patrol Behavior',
    severity: data.verified === false ? 'Warning' : 'Info',
    details,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
}

export const auditCheckpointScan = onDocumentCreated('checkpoint_logs/{logId}', async (event) => {
  const data = event.data?.data();
  if (!data) return;
  await writePatrolAudit('CHECKPOINT_SCAN', event.params.logId, data, {
    guardId: data.guardId || '',
    checkpointId: data.checkpointId || data.locationId || '',
    checkpointName: data.checkpointName || data.locationName || 'Checkpoint',
    siteId: data.siteId || '',
    clientId: data.clientId || '',
    verified: Boolean(data.verified),
    scanTimestamp: data.timestamp || null
  });
});

export const auditGuardLocation = onDocumentWritten('guardLocations/{locationId}', async (event) => {
  const data = event.data?.after?.data();
  if (!data) return;
  await writePatrolAudit('GUARD_LOCATION_UPDATE', event.params.locationId, data, {
    guardId: data.guardId || data.userId || '',
    latitude: data.lat ?? data.latitude ?? null,
    longitude: data.lng ?? data.longitude ?? null,
    accuracy: data.accuracy || data.gpsAccuracy || null,
    status: data.tracking ? 'On Patrol' : (data.status || 'Idle'),
    clientId: data.clientId || '',
    siteId: data.siteId || '',
    patrolId: data.patrolId || data.patrolLogId || '',
    recordedAt: data.updatedAt || data.deviceTimestamp || data.timestamp || data.createdAt || null
  });
});

export const auditPatrolRecord = onDocumentCreated('patrolLogs/{patrolId}', async (event) => {
  const data = event.data?.data();
  if (!data) return;
  await writePatrolAudit('PATROL_ACTIVITY', event.params.patrolId, data, {
    guardId: data.guardId || '',
    siteName: data.siteName || '',
    routeName: data.routeName || data.routeId || '',
    status: data.status || 'In Progress',
    progressPct: data.progressPct || 0,
    completedCount: data.completedCount || 0,
    totalCount: data.totalCount || 0
  });
});


export const auditCurrentPatrolRecord = onDocumentCreated('patrol_logs/{patrolId}', async (event) => {
  const data = event.data?.data();
  if (!data) return;
  await writePatrolAudit('PATROL_ACTIVITY', event.params.patrolId, data, {
    guardId: data.guardId || '',
    clientId: data.clientId || '',
    siteId: data.siteId || '',
    siteName: data.siteName || '',
    patrolTime: data.patrolTime || data.scheduledTime || '',
    status: data.status || 'IN_PROGRESS',
    startedLate: Boolean(data.startedLate),
    completedCheckpoints: data.completedCheckpoints || 0,
    totalCheckpoints: data.totalCheckpoints || 0
  });
});

export const verifyFaceMatch = onCall(async (request) => {
  const { candidateDataUrl, referenceDataUrl } = request.data || {};

  if (!candidateDataUrl || !referenceDataUrl) {
    throw new HttpsError('invalid-argument', 'Both candidate and reference images are required.');
  }

  const endpoint = process.env.AZURE_FACE_ENDPOINT;
  const key = process.env.AZURE_FACE_KEY;

  if (!endpoint || !key) {
    throw new HttpsError(
      'failed-precondition',
      'Azure Face API is not configured. Set AZURE_FACE_ENDPOINT and AZURE_FACE_KEY in Firebase Functions environment.'
    );
  }

  try {
    const detect1 = await axios.post(
      `${endpoint.replace(/\/$/, '')}/face/v1.0/detect?returnFaceId=true&returnFaceLandmarks=false`,
      { url: candidateDataUrl },
      {
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'application/json'
        }
      }
    );

    const detect2 = await axios.post(
      `${endpoint.replace(/\/$/, '')}/face/v1.0/detect?returnFaceId=true&returnFaceLandmarks=false`,
      { url: referenceDataUrl },
      {
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'application/json'
        }
      }
    );

    const face1 = detect1.data?.[0];
    const face2 = detect2.data?.[0];

    if (!face1 || !face2) {
      return { success: false, score: 0, reason: 'No faces detected in one of the inputs.' };
    }

    const verify = await axios.post(
      `${endpoint.replace(/\/$/, '')}/face/v1.0/verify`,
      {
        faceId1: face1.faceId,
        faceId2: face2.faceId
      },
      {
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'application/json'
        }
      }
    );

    const score = Number(verify.data?.confidence || 0);
    const success = Boolean(verify.data?.isIdentical) && score >= 0.5;

    return {
      success,
      score,
      reason: success ? 'Face matched' : 'Face does not match',
      source: 'azure-face-api'
    };
  } catch (error) {
    const message = error?.response?.data?.error?.message || error.message || 'Face verification failed';
    throw new HttpsError('internal', message);
  }
});

export const createManagedAccount = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in before creating an account.');

  const caller = await admin.firestore().doc(`users/${request.auth.uid}`).get();
  const callerRole = String(caller.data()?.role || '').toLowerCase();
  if (!['superadmin', 'super admin', 'supervisor', 'supervisor admin', 'supervisor_admin', 'supervisor command officer'].includes(callerRole)) {
    throw new HttpsError('permission-denied', 'Only an operations administrator can create managed accounts.');
  }

  const { email, password, name, role, clientId = '', company = '', phone = '', contractEnd = '' } = request.data || {};
  const normalizedRole = String(role || '').toLowerCase();
  if (!['superadmin', 'admin', 'client'].includes(normalizedRole)) {
    throw new HttpsError('invalid-argument', 'Account role must be SuperAdmin, Admin, or Client.');
  }
  if (!email || !password || !name) {
    throw new HttpsError('invalid-argument', 'Name, email, and password are required.');
  }
  if (normalizedRole === 'client' && !clientId) {
    throw new HttpsError('invalid-argument', 'A Client account must be linked to a client record.');
  }

  try {
    const user = await admin.auth().createUser({ email, password, displayName: name });
    await admin.auth().setCustomUserClaims(user.uid, { role: normalizedRole, clientId });
    await admin.firestore().doc(`users/${user.uid}`).set({
      id: user.uid,
      email,
      name,
      displayName: name,
      role: normalizedRole,
      clientId,
      company,
      phone,
      contractEnd,
      status: 'Active',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return { uid: user.uid, email, role: normalizedRole, clientId };
  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'An account with this email already exists.');
    }
    console.error('Managed account creation failed:', error);
    throw new HttpsError('internal', 'The managed account could not be created.');
  }
});

export const setManagedPassword = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in before changing a managed password.');
  const caller = await admin.firestore().doc(`users/${request.auth.uid}`).get();
  if (String(caller.data()?.role || '').toLowerCase() !== 'superadmin') throw new HttpsError('permission-denied', 'Only a SuperAdmin can set a client password.');
  const { uid, password } = request.data || {};
  if (!uid || !password || password.length < 6) throw new HttpsError('invalid-argument', 'A user ID and password of at least six characters are required.');
  await admin.auth().updateUser(uid, { password });
  await admin.firestore().doc(`users/${uid}`).set({ passwordUpdatedAt: admin.firestore.FieldValue.serverTimestamp(), mustChangePassword: true }, { merge: true });
  await admin.firestore().collection('adminLogs').add({ action: 'PASSWORD_RESET', collection: 'users', targetId: uid, actor: request.auth.uid, category: 'Security', severity: 'Warning', details: 'Temporary password set by SuperAdmin', timestamp: admin.firestore.FieldValue.serverTimestamp() });
  return { success: true };
});

export const archiveExpiredClients = onSchedule('every 24 hours', async () => {
  const db = admin.firestore();
  const clients = await db.collection('clients').where('status', '==', 'Active').get();
  const today = new Date();
  const batch = db.batch();
  for (const client of clients.docs) {
    const end = client.data().contractEnd;
    if (!end || new Date(end) > today) continue;
    const clientId = client.id;
    batch.set(client.ref, { status: 'Archived', archivedAt: admin.firestore.FieldValue.serverTimestamp(), loginEnabled: false }, { merge: true });
    const related = await db.collection('users').where('clientId', '==', clientId).get();
    related.docs.forEach((user) => batch.set(user.ref, { status: 'Archived', disabledAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }));
    const sites = await db.collection('sites').where('clientId', '==', clientId).get();
    sites.docs.forEach((site) => batch.set(site.ref, { status: 'Archived', archivedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }));
    const checkpoints = await db.collection('checkpoints').where('clientId', '==', clientId).get();
    checkpoints.docs.forEach((checkpoint) => batch.set(checkpoint.ref, { status: 'Archived', syncStatus: 'archived' }, { merge: true }));
  }
  await batch.commit();
});
