const admin = require("firebase-admin");

// 1. Path to your service account key
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// 2. ENTER THE EMAIL OR UID HERE
const identifier = process.argv[2] || "neythustudio@gmail.com";

async function setAdminClaim() {
  try {
    let user;
    try {
      // Try searching by email
      user = await admin.auth().getUserByEmail(identifier);
    } catch (e) {
      // If email fails, try searching by UID
      user = await admin.auth().getUser(identifier);
    }

    await admin.auth().setCustomUserClaims(user.uid, { admin: true });
    console.log(`\x1b[32mSUCCESS: Admin role set for ${user.email || user.uid}\x1b[0m`);
    console.log("Note: You must log out and log back in on the website for changes to take effect.");
    process.exit(0);
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      console.error(`\x1b[31mERROR: User "${identifier}" not found.\x1b[0m`);
      console.log("\x1b[33mHow to fix:\x1b[0m");
      console.log("1. Go to your website and SIGN UP or LOGIN with this email first.");
      console.log("2. Then run this script again.");
      console.log("3. Alternatively, copy the 'User UID' from the Firebase Console (Authentication tab) and paste it into this script.");
    } else {
      console.error("\x1b[31mAn unexpected error occurred:\x1b[0m", error.message);
    }
    process.exit(1);
  }
}

setAdminClaim();