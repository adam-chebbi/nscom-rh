import express from "express";
import admin from "firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

let adminApp: admin.app.App | undefined;
let firestoreDatabaseId = "(default)";
let isInitialized = false;

async function initializeFirebase() {
  if (isInitialized) return;
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  try {
    let configPath = path.join(process.cwd(), "firebase-applet-config.json");
    try {
      await fs.access(configPath);
    } catch {
      configPath = path.join(__dirname, "../../firebase-applet-config.json");
    }
    const config = JSON.parse(await fs.readFile(configPath, "utf-8"));
    if (config.firestoreDatabaseId) {
      firestoreDatabaseId = config.firestoreDatabaseId;
    }
  } catch (error) {
    console.warn("Could not read firebase-applet-config.json, using default database ID.");
  }

  if (serviceAccount) {
    try {
      const cert = JSON.parse(serviceAccount);
      if (!admin.apps.length) {
        adminApp = admin.initializeApp({
          credential: admin.credential.cert(cert),
        });
      } else {
        adminApp = admin.app();
      }
      console.log("Firebase Admin initialized successfully.");
    } catch (error) {
      console.error("Error parsing FIREBASE_SERVICE_ACCOUNT:", error);
    }
  } else {
    console.warn("FIREBASE_SERVICE_ACCOUNT not found. User management features will be limited.");
  }
  isInitialized = true;
}

const verifyAdmin = async (req: any, res: any, next: any) => {
  await initializeFirebase();
  if (!admin.apps.length) {
    return res.status(500).json({ error: "Firebase Admin not initialized. Please check FIREBASE_SERVICE_ACCOUNT secret." });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    const db = getFirestore(adminApp, firestoreDatabaseId);
    const userProfile = await db.collection("users").doc(decodedToken.uid).get();
    
    if (!userProfile.exists) {
      return res.status(403).json({ error: "User profile not found" });
    }

    const role = userProfile.data()?.role;
    req.user = { ...decodedToken, role };
    next();
  } catch (error: any) {
    console.error("Error verifying token:", error);
    res.status(401).json({ error: "Invalid token", details: error.message });
  }
};

app.post("/api/users/create", verifyAdmin, async (req: any, res) => {
  if (!admin.apps.length) return res.status(500).json({ error: "Firebase Admin not initialized" });
  
  if (req.user.role !== 'super_admin' && req.user.role !== 'admin_rh') {
    return res.status(403).json({ error: "Permission denied" });
  }

  const { email, password, displayName, role, department } = req.body;
  try {
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName,
    });

    const db = getFirestore(adminApp, firestoreDatabaseId);
    await db.collection("users").doc(userRecord.uid).set({
      uid: userRecord.uid,
      email,
      displayName,
      role,
      department,
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
    });

    res.json({ uid: userRecord.uid });
  } catch (error: any) {
    console.error("Error creating user:", error);
    res.status(500).json({ error: error ? error.message || error.toString() : "Unknown error" });
  }
});

app.post("/api/users/update-password", verifyAdmin, async (req: any, res) => {
  if (!admin.apps.length) return res.status(500).json({ error: "Firebase Admin not initialized" });
  
  if (req.user.role !== 'super_admin' && req.user.role !== 'admin_rh') {
    return res.status(403).json({ error: "Permission denied" });
  }

  const { uid, password } = req.body;
  try {
    try {
      await admin.auth().getUser(uid);
    } catch (authError: any) {
      if (authError.code === 'auth/user-not-found') {
        const db = getFirestore(adminApp, firestoreDatabaseId);
        const userDoc = await db.collection("users").doc(uid).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          await admin.auth().createUser({
            uid: uid,
            email: userData?.email,
            password: password,
            displayName: userData?.displayName
          });
          return res.json({ success: true, message: "User record re-created in Auth and password set." });
        }
      }
      throw authError;
    }
    
    await admin.auth().updateUser(uid, { password });
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error updating password:", error);
    res.status(500).json({ error: error ? error.message || error.toString() : "Unknown error" });
  }
});

app.post("/api/users/delete", verifyAdmin, async (req: any, res) => {
  if (!admin.apps.length) return res.status(500).json({ error: "Firebase Admin not initialized" });
  
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ error: "Permission denied. Only super_admin can delete users." });
  }

  const { uid } = req.body;
  try {
    try {
      await admin.auth().deleteUser(uid);
    } catch (authError: any) {
      if (authError.code !== 'auth/user-not-found') {
        throw authError;
      }
    }
    
    const db = getFirestore(adminApp, firestoreDatabaseId);
    
    const checkinsRef = db.collection("checkins");
    const snapshot = await checkinsRef.where("userId", "==", uid).get();
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    await db.collection("users").doc(uid).delete();
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: error ? error.message || error.toString() : "Unknown error" });
  }
});

export default app;
