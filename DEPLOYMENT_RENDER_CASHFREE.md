# Neythu Studio - Cashfree Payment Gateway & Render Backend Setup

This document guides you through setting up and running your **Cashfree Payment Gateway (Test Mode)** using the **Render** backend for Neythu Studio.

---

## 📁 What Has Been Created & Configured

1. **`server/` (Render Backend)**
   - `server/server.js`: Express server handling Cashfree PG order creation, payment verification, and webhook notifications.
   - `server/package.json`: Dependencies (`express`, `cors`, `dotenv`, `firebase-admin`).
   - `server/.env.example`: Template for environment variables.
   - `render.yaml`: Blueprint for 1-click deployment on Render.

2. **`public/` (Frontend)**
   - `public/checkout.html`: Cashfree SDK integration (`https://sdk.cashfree.com/js/v3/cashfree.js`), updated Section 3 to **Cashfree Payments ONLY** (UPI, Cards, NetBanking), and payment security badges.
   - `public/js/config.js`: Central configuration file managing `BACKEND_URL` and `CASHFREE_MODE`.
   - `public/js/checkout.js`: Initiates Cashfree session via backend and triggers Cashfree Checkout Modal.
   - `public/order-success.html` & `public/js/order-success.js`: Dedicated post-payment confirmation page that verifies payment status and clears cart.
   - `public/js/profile.js` & `public/js/admin.js`: Updated to display `Paid (Cashfree)` status and payment transaction details.

---

## 🔑 Step 1: Get Cashfree Test Mode Credentials

1. Go to the [Cashfree Merchant Dashboard](https://merchant.cashfree.com/).
2. In the top navbar, toggle the switch from **Production** to **Test Mode / Sandbox**.
3. In the left menu, click **Developers** > **API Keys**.
4. Generate or copy your:
   - **App ID / Client ID** (e.g., `TEST...`)
   - **Secret Key** (e.g., `cfsk_ma_test_...`)

---

## 💻 Step 2: Test Locally

1. Open `server/.env` (or copy `server/.env.example` to `server/.env`).
2. Add your Cashfree test credentials:
   ```env
   PORT=5000
   CASHFREE_ENV=sandbox
   CASHFREE_APP_ID=YOUR_TEST_APP_ID_HERE
   CASHFREE_SECRET_KEY=YOUR_TEST_SECRET_KEY_HERE
   CASHFREE_API_VERSION=2023-08-01
   FRONTEND_URL=http://localhost:5000
   ALLOWED_ORIGINS=http://localhost:5000,http://localhost:3000,http://127.0.0.1:5500,https://neythu-studio.web.app
   ```
3. Start the server:
   ```bash
   cd server
   npm start
   ```
   You should see:
   ```
   ✅ Firebase Admin initialized successfully
   🚀 Neythu Studio Backend running on port 5000
   💳 Cashfree Mode: SANDBOX
   ```

---

## 🚀 Step 3: Deploy Backend to Render (Free)

1. Push your repository to GitHub.
2. Sign in to [Render](https://render.com/). 
3. Click **New +** > **Web Service**.
4. Select your GitHub repository.
5. Configure the service:
   - **Name**: `neythu-studio-backend`
   - **Region**: Singapore or closest to India
   - **Root Directory**: `server`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: `Free`
6. Under **Environment Variables**, add:
   | Key | Value |
   |---|---|
   | `PORT` | `5000` |
   | `CASHFREE_ENV` | `sandbox` |
   | `CASHFREE_APP_ID` | *Your Cashfree Test App ID* |
   | `CASHFREE_SECRET_KEY` | *Your Cashfree Test Secret Key* |
   | `CASHFREE_API_VERSION` | `2023-08-01` |
   | `FRONTEND_URL` | `https://neythu-studio.web.app` |
   | `ALLOWED_ORIGINS` | `https://neythu-studio.web.app,https://neythu-studio.firebaseapp.com` |
   | `FIREBASE_SERVICE_ACCOUNT` | *Copy & paste the entire content of `serviceAccountKey.json`* |
7. Click **Deploy Web Service**.
8. Once deployed, Render will provide your public URL (e.g. `https://neythu-studio-backend.onrender.com`).

---

## 🔗 Step 4: Link Frontend to Render

Open `public/js/config.js` and update `BACKEND_URL`:
```javascript
export const CONFIG = {
    BACKEND_URL: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:5000'
        : 'https://YOUR_ACTUAL_RENDER_NAME.onrender.com', // <-- Put your Render URL here

    CASHFREE_MODE: 'sandbox'
};
```
Deploy the frontend to Firebase:
```bash
firebase deploy --only hosting
```

---

## 🧪 Testing in Cashfree Sandbox

When checking out on the website:
- Click **Proceed to Pay**.
- The Cashfree Checkout Modal will appear.
- Select **UPI** and enter any test UPI handle like `success@upi`, or select **Cards** and use Cashfree test card numbers (Card Number `4012 0000 0000 0002`, any future MM/YY, CVV `123`).
- On completing the simulated payment, you will see the **Order Confirmed** screen, and the order will be recorded in Firestore with status `paid`!
