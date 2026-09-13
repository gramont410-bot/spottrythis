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

async function checkFinal() {
  const colName = 'devices';
  const snap = await getDocs(collection(db, colName));
  console.log(`\nCollection: "${colName}" - Found ${snap.size} documents:`);
  snap.forEach(doc => {
    console.log(`  ID: ${doc.id} =>`, JSON.stringify(doc.data(), null, 2));
  });

  const usersSnap = await getDocs(collection(db, 'users'));
  console.log(`\nCollection: "users" - Found ${usersSnap.size} documents:`);
  usersSnap.forEach(doc => {
    console.log(`  ID: ${doc.id} =>`, JSON.stringify(doc.data(), null, 2));
  });
}

checkFinal().catch(console.error);
