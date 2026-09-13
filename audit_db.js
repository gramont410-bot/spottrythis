import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyD0Vx5ZKt7DzQI8F5INfyJddWE4d5OkiRQ",
  authDomain: "spot-f503e.firebaseapp.com",
  projectId: "spot-f503e",
  storageBucket: "spot-f503e.firebasestorage.app",
  messagingSenderId: "168845113005",
  appId: "1:168845113005:web:154bb5247d63e122f53824",
  measurementId: "G-XSZVJJLW18"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const ALL_COLLECTIONS = [
  'users', 'devices', 'sites', 'clients', 'guardLocations',
  'patrolLogs', 'incidents', 'adminLogs', 'attendance',
  'checkpoint_logs', 'reports', 'client_sites', 'guard_schedules_template',
  'patrol_schedules', 'schedules', 'checkpoints', 'routes',
  'approvalRequests', 'auditLogs', 'locationHistory'
];

async function checkAll() {
  for (const colName of ALL_COLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, colName));
      if (snap.size > 0) {
        console.log(`\n✅ Collection: "${colName}" — ${snap.size} doc(s):`);
        snap.forEach(doc => {
          console.log(`   ${doc.id}:`, JSON.stringify(doc.data()));
        });
      } else {
        console.log(`📭 Collection: "${colName}" — empty`);
      }
    } catch (e) {
      console.log(`❌ "${colName}": ${e.message}`);
    }
  }
  console.log('\n--- DONE ---');
}

checkAll().catch(console.error);
