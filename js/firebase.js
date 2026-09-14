// ============================================================
//  OmniPrep — js/firebase.js
//  Firebase initialisation and shared helper functions.
//  Every page that needs Firebase imports from this file.
// ============================================================

import { initializeApp }                    from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
}                                           from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  collection,
  query,
  orderBy,
  getDocs,
  serverTimestamp,
}                                           from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';


// ============================================================
//  FIREBASE CONFIG — OmniPrep project
// ============================================================
const firebaseConfig = {
  apiKey:            "AIzaSyBms19XljACGTZvgnVfcSMwSYbHhLzOVUw",
  authDomain:        "omniprep-64e0f.firebaseapp.com",
  projectId:         "omniprep-64e0f",
  storageBucket:     "omniprep-64e0f.firebasestorage.app",
  messagingSenderId: "597675016242",
  appId:             "1:597675016242:web:390be6f0a0527f9c52fc2b",
  measurementId:     "G-281ZER4NCT",
};


// ============================================================
//  INITIALISE
// ============================================================
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);


// ============================================================
//  AUTH HELPERS
// ============================================================

/**
 * Returns a Promise that resolves with the current Firebase user,
 * or null if no one is logged in.
 */
function getCurrentUser() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user);
    });
  });
}


/**
 * Checks login and active subscription.
 * Redirects to login.html if either check fails.
 * Returns student Firestore data if all is valid.
 */
async function requireAuth() {
  const user = await getCurrentUser();

  if (!user) {
    window.location.href = 'login.html';
    return null;
  }

  const snap = await getDoc(doc(db, 'students', user.uid));

  if (!snap.exists()) {
    await signOut(auth);
    window.location.href = 'login.html';
    return null;
  }

  // OmniPrep is free — no expiry check needed
  const data = snap.data();
  return { uid: user.uid, ...data };
}


/**
 * Logs the current user out and redirects to login.html.
 */
async function logout() {
  await signOut(auth);
  sessionStorage.removeItem('op_user');
  window.location.href = 'login.html';
}


// ============================================================
//  STUDENT PROFILE HELPERS
// ============================================================

/**
 * Fetches student Firestore document by UID.
 */
async function getStudentProfile(uid) {
  try {
    const snap = await getDoc(doc(db, 'students', uid));
    return snap.exists() ? { uid, ...snap.data() } : null;
  } catch (err) {
    console.error('getStudentProfile:', err);
    return null;
  }
}


/**
 * Updates specific fields on the student Firestore document.
 */
async function updateStudentProfile(uid, fields) {
  try {
    await updateDoc(doc(db, 'students', uid), {
      ...fields,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.error('updateStudentProfile:', err);
    return false;
  }
}


// ============================================================
//  SESSION HELPERS
// ============================================================

/**
 * Saves a completed exam session to Firestore.
 * Returns the new session document ID, or null on failure.
 *
 * sessionData shape:
 * {
 *   score, correct, wrong, skipped,
 *   timeUsed, mode,
 *   subjects: { "Mathematics": 72, ... },
 *   errors:   [ { num, subject, type, q, opts, correct, yours, explain } ],
 *   totalQuestions,
 * }
 */
async function saveSession(uid, sessionData) {
  try {
    const ref = await addDoc(
      collection(db, 'students', uid, 'sessions'),
      { ...sessionData, createdAt: serverTimestamp() }
    );
    return ref.id;
  } catch (err) {
    console.error('saveSession:', err);
    return null;
  }
}


/**
 * Fetches all sessions for a student, newest first.
 */
async function getSessions(uid) {
  try {
    const q    = query(
      collection(db, 'students', uid, 'sessions'),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('getSessions:', err);
    return [];
  }
}


/**
 * Fetches a single session by ID.
 */
async function getSession(uid, sessionId) {
  try {
    const snap = await getDoc(
      doc(db, 'students', uid, 'sessions', sessionId)
    );
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (err) {
    console.error('getSession:', err);
    return null;
  }
}


// ============================================================
//  UTILITY HELPERS
// ============================================================

/**
 * Days remaining until exam date.
 * Returns a number (negative if passed).
 */
function daysUntilExam(examDateString) {
  if (!examDateString) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const exam  = new Date(examDateString); exam.setHours(0, 0, 0, 0);
  return Math.round((exam - today) / (1000 * 60 * 60 * 24));
}


/**
 * Formats a Firestore Timestamp or ISO string.
 * e.g. "23 April 2026"
 */
function formatDate(dateValue) {
  if (!dateValue) return '—';
  const d = dateValue.toDate ? dateValue.toDate() : new Date(dateValue);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}


/**
 * Formats seconds into a readable duration.
 * e.g. 5820 → "1h 37m"
 */
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}


/**
 * Correct/total → percentage string.
 * e.g. scorePercent(38, 60) → "63%"
 */
function scorePercent(correct, total) {
  if (!total) return '0%';
  return Math.round((correct / total) * 100) + '%';
}


/**
 * UTME score out of 400.
 */
function calcUTMEScore(correct, totalQuestions) {
  if (!totalQuestions) return 0;
  return Math.round((correct / totalQuestions) * 400);
}


/**
 * Grade label from score.
 */
function getGradeLabel(score) {
  if (score >= 300) return { label: 'Excellent',        cls: 'badge-green' };
  if (score >= 250) return { label: 'Above Average',    cls: 'badge-blue'  };
  if (score >= 200) return { label: 'Average',          cls: 'badge-amber' };
  return               { label: 'Needs Improvement',  cls: 'badge-red'   };
}


/**
 * Motivational message from score.
 */
function getScoreMessage(score) {
  if (score >= 300) return 'Outstanding! You are well on track for your target university.';
  if (score >= 250) return 'Great job! A little more work and you will be at the top.';
  if (score >= 200) return 'Good effort — keep pushing. Review your corrections carefully.';
  return                   'Keep going. Every session makes you better. Study the vault.';
}


// ============================================================
//  EXPORTS
// ============================================================
export {
  // Firebase instances
  app,
  auth,
  db,

  // Auth SDK functions
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,

  // Firestore SDK functions
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  collection,
  query,
  orderBy,
  getDocs,
  serverTimestamp,

  // Auth helpers
  getCurrentUser,
  requireAuth,
  logout,

  // Student helpers
  getStudentProfile,
  updateStudentProfile,

  // Session helpers
  saveSession,
  getSessions,
  getSession,

  // Utility helpers
  daysUntilExam,
  formatDate,
  formatDuration,
  scorePercent,
  calcUTMEScore,
  getGradeLabel,
  getScoreMessage,
};
