const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Cashfree Configuration
const CASHFREE_ENV = (process.env.CASHFREE_ENV || 'sandbox').toLowerCase();
const CASHFREE_BASE_URL = CASHFREE_ENV === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';
const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID;
const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY;
const CASHFREE_API_VERSION = process.env.CASHFREE_API_VERSION || '2023-08-01';

// Initialize Firebase Admin SDK
try {
    let credential;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        // Provided via environment variable on Render
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        credential = admin.credential.cert(serviceAccount);
    } else {
        // Fallback to local serviceAccountKey.json if present
        const localKeyPath = path.resolve(__dirname, '../serviceAccountKey.json');
        const serverKeyPath = path.resolve(__dirname, 'serviceAccountKey.json');
        if (fs.existsSync(serverKeyPath)) {
            credential = admin.credential.cert(require(serverKeyPath));
        } else if (fs.existsSync(localKeyPath)) {
            credential = admin.credential.cert(require(localKeyPath));
        } else {
            console.warn('⚠️ No serviceAccountKey.json found. Using default application credentials.');
            credential = admin.credential.applicationDefault();
        }
    }

    if (!admin.apps.length) {
        admin.initializeApp({ credential });
    }
    console.log('✅ Firebase Admin initialized successfully');
} catch (err) {
    console.error('❌ Failed to initialize Firebase Admin:', err.message);
}

const db = admin.firestore();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure CORS - Allow any origin dynamically with full preflight support
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-version', 'x-client-id', 'x-client-secret']
}));
app.options('*', cors());

// Auth verification middleware
async function authenticateUser(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    }

    const token = authHeader.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error('Token verification error:', error.message);
        return res.status(401).json({ error: 'Unauthorized: Invalid Firebase token' });
    }
}

// Health check
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        service: 'Neythu Studio Payment Service',
        cashfree_env: CASHFREE_ENV,
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', env: CASHFREE_ENV });
});

// Helper: Normalize Indian phone numbers for Cashfree (must be 10 digits without +91)
function sanitizePhone(phone) {
    if (!phone) return '9999999999';
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 10) {
        return digits.slice(-10);
    }
    return digits.padEnd(10, '0');
}

// 1. CREATE CASHFREE ORDER
app.post('/api/create-order', authenticateUser, async (req, res) => {
    try {
        const { customerDetails, items, totalAmount } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Cart is empty' });
        }

        if (!totalAmount || Number(totalAmount) <= 0) {
            return res.status(400).json({ error: 'Invalid total amount' });
        }

        if (!CASHFREE_APP_ID || !CASHFREE_SECRET_KEY) {
            return res.status(500).json({
                error: 'Cashfree credentials are not configured on the server. Please set CASHFREE_APP_ID and CASHFREE_SECRET_KEY in environment variables.'
            });
        }

        // Generate clean unique Order ID
        const timestamp = Date.now().toString().slice(-6);
        const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
        const orderId = `NEYTHU_${timestamp}_${randomHex}`;

        const numericAmount = parseFloat(Number(totalAmount).toFixed(2));
        const customerPhone = sanitizePhone(customerDetails?.phone);
        const customerName = (customerDetails?.name || req.user.name || 'Crochet Patron').trim();
        const customerEmail = (customerDetails?.email || req.user.email || 'customer@neythustudio.com').trim();
        const customerId = (req.user.uid || `cust_${Date.now()}`).substring(0, 50);

        const frontendUrl = process.env.FRONTEND_URL || 'https://neythu-studio.web.app';
        const returnUrl = `${frontendUrl}/order-success.html?order_id={order_id}`;

        const cashfreePayload = {
            order_id: orderId,
            order_amount: numericAmount,
            order_currency: 'INR',
            customer_details: {
                customer_id: customerId,
                customer_name: customerName,
                customer_email: customerEmail,
                customer_phone: customerPhone
            },
            order_meta: {
                return_url: returnUrl
            },
            order_note: `Neythu Studio Handcrafted Order (${items.length} piece${items.length > 1 ? 's' : ''})`
        };

        // Call Cashfree PG Orders API
        const cfResponse = await fetch(`${CASHFREE_BASE_URL}/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-version': CASHFREE_API_VERSION,
                'x-client-id': CASHFREE_APP_ID,
                'x-client-secret': CASHFREE_SECRET_KEY
            },
            body: JSON.stringify(cashfreePayload)
        });

        const cfData = await cfResponse.json();

        if (!cfResponse.ok || !cfData.payment_session_id) {
            console.error('Cashfree order creation error:', cfData);
            return res.status(cfResponse.status || 500).json({
                error: cfData.message || 'Failed to initiate Cashfree payment session',
                details: cfData
            });
        }

        // Store order in Firestore under 'orders' with matching ID
        const orderDocData = {
            orderId: orderId,
            cfOrderId: cfData.cf_order_id,
            paymentSessionId: cfData.payment_session_id,
            userId: req.user.uid,
            userEmail: req.user.email || customerEmail,
            customerDetails: customerDetails || {},
            items: items,
            totalAmount: numericAmount,
            paymentMethod: 'cashfree',
            paymentStatus: 'PENDING',
            status: 'pending_payment',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            cashfreeEnv: CASHFREE_ENV
        };

        await db.collection('orders').doc(orderId).set(orderDocData);

        // Also save customer address if provided
        try {
            if (customerDetails && customerDetails.zip && customerDetails.address) {
                const addressesCol = db.collection(`users/${req.user.uid}/addresses`);
                const existingSnap = await addressesCol.get();

                let alreadyExists = false;
                existingSnap.forEach(snap => {
                    const data = snap.data();
                    if (data.zip === customerDetails.zip && data.address === customerDetails.address) {
                        alreadyExists = true;
                    }
                });

                if (!alreadyExists) {
                    await addressesCol.add({
                        name: customerDetails.name || '',
                        phone: customerDetails.phone || '',
                        email: customerDetails.email || req.user.email || '',
                        houseNo: customerDetails.houseNo || '',
                        buildingName: customerDetails.buildingName || '',
                        streetRoad: customerDetails.streetRoad || '',
                        areaLocality: customerDetails.areaLocality || '',
                        landmark: customerDetails.landmark || '',
                        postOffice: customerDetails.postOffice || '',
                        address: customerDetails.address || '',
                        city: customerDetails.city || '',
                        state: customerDetails.state || '',
                        zip: customerDetails.zip || '',
                        type: 'Delivery Address',
                        isDefault: existingSnap.empty,
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                }
            }
        } catch (addrErr) {
            console.warn('Could not auto-save address in Firestore:', addrErr.message);
        }

        res.json({
            success: true,
            orderId: orderId,
            paymentSessionId: cfData.payment_session_id,
            environment: CASHFREE_ENV
        });
    } catch (error) {
        console.error('Error in /api/create-order:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

// 2. VERIFY CASHFREE PAYMENT
app.post('/api/verify-payment', async (req, res) => {
    try {
        const { orderId } = req.body;
        if (!orderId) {
            return res.status(400).json({ error: 'orderId is required' });
        }

        if (!CASHFREE_APP_ID || !CASHFREE_SECRET_KEY) {
            return res.status(500).json({ error: 'Cashfree credentials not set' });
        }

        // Fetch Order details from Cashfree
        const cfOrderRes = await fetch(`${CASHFREE_BASE_URL}/orders/${encodeURIComponent(orderId)}`, {
            method: 'GET',
            headers: {
                'x-api-version': CASHFREE_API_VERSION,
                'x-client-id': CASHFREE_APP_ID,
                'x-client-secret': CASHFREE_SECRET_KEY
            }
        });

        const cfOrderData = await cfOrderRes.json();

        if (!cfOrderRes.ok) {
            return res.status(cfOrderRes.status).json({
                error: cfOrderData.message || 'Could not fetch order from Cashfree',
                details: cfOrderData
            });
        }

        // Fetch payment attempts for this order
        let paymentDetails = null;
        try {
            const cfPaymentsRes = await fetch(`${CASHFREE_BASE_URL}/orders/${encodeURIComponent(orderId)}/payments`, {
                method: 'GET',
                headers: {
                    'x-api-version': CASHFREE_API_VERSION,
                    'x-client-id': CASHFREE_APP_ID,
                    'x-client-secret': CASHFREE_SECRET_KEY
                }
            });
            if (cfPaymentsRes.ok) {
                const paymentsList = await cfPaymentsRes.json();
                if (Array.isArray(paymentsList) && paymentsList.length > 0) {
                    paymentDetails = paymentsList.find(p => p.payment_status === 'SUCCESS') || paymentsList[0];
                }
            }
        } catch (payFetchErr) {
            console.warn('Error fetching payment details from Cashfree:', payFetchErr.message);
        }

        const isPaid = cfOrderData.order_status === 'PAID';

        // Update Firestore order
        const orderRef = db.collection('orders').doc(orderId);
        const orderDoc = await orderRef.get();

        if (orderDoc.exists) {
            const updatePayload = {
                orderStatus: cfOrderData.order_status,
                paymentStatus: isPaid ? 'PAID' : cfOrderData.order_status,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            if (isPaid) {
                // Change status from 'pending_payment' to 'paid' (or standard active order status)
                updatePayload.status = 'paid';
                updatePayload.paidAt = admin.firestore.FieldValue.serverTimestamp();
            }

            if (paymentDetails) {
                updatePayload.paymentDetails = {
                    cfPaymentId: paymentDetails.cf_payment_id || null,
                    paymentMethod: paymentDetails.payment_method || null,
                    paymentStatus: paymentDetails.payment_status || null,
                    paymentTime: paymentDetails.payment_time || null,
                    bankReference: paymentDetails.bank_reference || null
                };
            }

            await orderRef.update(updatePayload);
        }

        res.json({
            success: true,
            isPaid: isPaid,
            orderStatus: cfOrderData.order_status,
            orderId: orderId,
            orderData: orderDoc.exists ? orderDoc.data() : null
        });
    } catch (error) {
        console.error('Error in /api/verify-payment:', error);
        res.status(500).json({ error: error.message || 'Payment verification failed' });
    }
});

// 3. CASHFREE WEBHOOK LISTENER
app.post('/api/cashfree-webhook', async (req, res) => {
    try {
        const eventData = req.body;
        console.log('Received Cashfree Webhook:', JSON.stringify(eventData));

        const orderId = eventData?.data?.order?.order_id;
        const paymentStatus = eventData?.data?.payment?.payment_status;

        if (orderId && paymentStatus === 'SUCCESS') {
            const orderRef = db.collection('orders').doc(orderId);
            const docSnap = await orderRef.get();
            if (docSnap.exists) {
                await orderRef.update({
                    status: 'paid',
                    paymentStatus: 'PAID',
                    paymentDetails: {
                        cfPaymentId: eventData?.data?.payment?.cf_payment_id || null,
                        paymentMethod: eventData?.data?.payment?.payment_method || null,
                        paymentTime: eventData?.data?.payment?.payment_time || null
                    },
                    paidAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedViaWebhook: true
                });
                console.log(`Order ${orderId} marked as PAID via webhook`);
            }
        }

        res.status(200).send('Webhook received');
    } catch (err) {
        console.error('Webhook processing error:', err.message);
        res.status(500).send('Webhook handler error');
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Neythu Studio Backend running on port ${PORT}`);
    console.log(`💳 Cashfree Mode: ${CASHFREE_ENV.toUpperCase()} (${CASHFREE_BASE_URL})`);
});
