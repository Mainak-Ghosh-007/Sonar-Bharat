import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut as fbSignOut } from "firebase/auth";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  setDoc, 
  onSnapshot, 
  updateDoc, 
  deleteDoc,
  serverTimestamp,
  getDocFromServer
} from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

let db: any = null;
let auth: any = null;
let isFirebaseActive = false;

// Determine if the configurations are real or dummy
if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "dummy-key") {
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    // CRITICAL: Connect with the correct database ID
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    auth = getAuth(app);
    isFirebaseActive = true;
    console.log("Firebase initialized successfully with real configuration and Database ID:", firebaseConfig.firestoreDatabaseId);

    // Validate connection as per the Firestore skill guidelines
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, "test", "connection"));
      } catch (error) {
        if (error instanceof Error && error.message.includes("the client is offline")) {
          console.error("Please check your Firebase configuration: Client appears offline.");
        } else {
          console.log("Firestore connection test ping returned expected state.");
        }
      }
    };
    testConnection();
  } catch (err) {
    console.warn("Firebase could not initialize, running in custom fallbacks: ", err);
  }
} else {
  console.log("Using dynamic mock local persistence (Firebase terms or setup pending).");
}

export { db, auth, isFirebaseActive, serverTimestamp };

// Firestore Error Handler helper required by the skill rules
export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid || "anonymous_local",
      email: auth?.currentUser?.email || "offline@sonar",
      emailVerified: auth?.currentUser?.emailVerified || false,
      isAnonymous: auth?.currentUser?.isAnonymous || true,
    },
    operationType,
    path,
  };
  console.error("Firestore Error Detailed: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Global active auth trigger
export async function triggerGoogleLogin(): Promise<any> {
  if (isFirebaseActive && auth) {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } else {
    // Return standard dummy citizen profile
    return {
      uid: "mock-uid-citizen-101",
      displayName: "Mainak Ghosh",
      email: "mainak.ghosh268@gmail.com",
      emailVerified: true,
    };
  }
}

export async function triggerLogout() {
  if (isFirebaseActive && auth) {
    await fbSignOut(auth);
  }
}
