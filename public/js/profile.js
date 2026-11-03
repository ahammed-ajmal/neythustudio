import { auth, db } from './firebase.js';
import {
    onAuthStateChanged,
    updateProfile,
    signOut,
    sendPasswordResetEmail,
    deleteUser
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    collection,
    getDocs,
    query,
    where,
    orderBy,
    setDoc,
    addDoc,
    doc,
    deleteDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// --- Auth Handling ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    updateUI(user);
    loadOrders(user);
    loadAddresses(user);
});

function updateUI(user) {
    const initials = (user.displayName || "User").split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    document.getElementById('profile-initials').innerText = initials;
    document.getElementById('profile-name-side').innerText = user.displayName || "User";
    document.getElementById('profile-email-side').innerText = user.email || user.phoneNumber || "";

    // Form fields
    document.getElementById('acc-name').value = user.displayName || "";
    document.getElementById('acc-email').value = user.email || user.phoneNumber || "";
    document.getElementById('acc-phone').value = user.phoneNumber || "";

    // Display name in dashboard
    document.querySelectorAll('.user-display-name').forEach(el => el.innerText = user.displayName || "User");
}

// --- Tab Switching ---
window.switchTab = (tabId) => {
    document.querySelectorAll('.profile-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.profile-nav-item').forEach(i => i.classList.remove('active'));

    const targetSection = document.getElementById(tabId);
    if (targetSection) {
        targetSection.classList.add('active');
    }

    // Update sidebar active state
    const navItems = document.querySelectorAll('.profile-nav-item');
    navItems.forEach(item => {
        if (item.innerText.toLowerCase().includes(tabId)) {
            item.classList.add('active');
        }
    });
};

function getCourierTrackingUrl(courier, code) {
    if (!code) return '';
    const cleanCode = code.toString().trim();
    const c = (courier || '').toLowerCase();
    if (c.includes('delhivery')) {
        return `https://www.delhivery.com/track/package/${encodeURIComponent(cleanCode)}`;
    }
    if (c.includes('india post') || c.includes('speed post')) {
        return `https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx`;
    }
    if (c.includes('dtdc')) {
        return `https://track.dtdc.com/ctrk/yourTrack.do`;
    }
    if (c.includes('blue dart') || c.includes('bluedart')) {
        return `https://www.bluedart.com/tracking`;
    }
    if (c.includes('professional')) {
        return `https://www.tpcindia.com/`;
    }
    return `https://t.17track.net/en#nums=${encodeURIComponent(cleanCode)}`;
}

window.copyTrackingCode = (code, btn) => {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
        const original = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check" style="color: #2e7d32;"></i>';
        setTimeout(() => {
            btn.innerHTML = original;
        }, 2000);
    }).catch(err => {
        console.warn('Clipboard write failed:', err);
    });
};

function renderOrderCard(id, order) {
    const rawDate = order.createdAt;
    let dateStr = 'Recent';
    if (rawDate && typeof rawDate.toDate === 'function') {
        dateStr = rawDate.toDate().toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } else if (rawDate) {
        dateStr = new Date(rawDate).toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    const rawStatus = (order.status || 'pending').toLowerCase();
    const status = escapeHtml(order.status || 'Pending');
    const totalAmount = typeof order.totalAmount === 'number' 
        ? order.totalAmount.toFixed(2) 
        : (parseFloat(order.totalAmount) || 0).toFixed(2);
    const items = Array.isArray(order.items) ? order.items : [];

    const itemsHtml = items.map(item => {
        const meta = [];
        if (item.color) meta.push(`Shade: ${escapeHtml(item.color)}`);
        if (item.type) meta.push(`Stitch: ${escapeHtml(item.type)}`);
        if (item.size && item.size !== 'Standard') meta.push(`Fit: ${escapeHtml(item.size)}`);
        const metaStr = meta.length > 0 ? ` <span style="color: var(--text-light); font-size: 0.8rem;">(${meta.join(', ')})</span>` : '';
        return `<li><strong>${escapeHtml(item.name || 'Crochet Piece')}</strong> &times; ${item.quantity || 1}${metaStr}</li>`;
    }).join('');

    // Status styling
    let statusStyle = 'background: var(--primary-sage-light); color: var(--primary-sage-dark); border: 1px solid transparent;';
    let statusIcon = '';
    if (rawStatus === 'paid') {
        statusStyle = 'background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0;';
        statusIcon = '<i class="fa-solid fa-circle-check" style="margin-right: 4px;"></i>';
    } else if (rawStatus === 'pending_payment') {
        statusStyle = 'background: #fffbeb; color: #92400e; border: 1px solid #fde68a;';
        statusIcon = '<i class="fa-solid fa-clock" style="margin-right: 4px;"></i>';
    } else if (rawStatus === 'booked') {
        statusStyle = 'background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd;';
        statusIcon = '<i class="fa-solid fa-box" style="margin-right: 4px;"></i>';
    } else if (rawStatus === 'shipped') {
        statusStyle = 'background: #ecfeff; color: #0e7490; border: 1px solid #cffafe;';
        statusIcon = '<i class="fa-solid fa-truck-fast" style="margin-right: 4px;"></i>';
    } else if (rawStatus === 'delivered') {
        statusStyle = 'background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0;';
        statusIcon = '<i class="fa-solid fa-circle-check" style="margin-right: 4px;"></i>';
    } else if (rawStatus === 'cancelled') {
        statusStyle = 'background: #fef2f2; color: #b91c1c; border: 1px solid #fee2e2;';
        statusIcon = '<i class="fa-solid fa-circle-xmark" style="margin-right: 4px;"></i>';
    }

    // Tracking section (Customer facing)
    let trackingSectionHtml = '';
    if (order.trackingCode && order.trackingCode.trim()) {
        const courier = order.courier || 'India Post Speed Post';
        const trackingCode = order.trackingCode.trim();
        const trackingUrl = order.trackingUrl || getCourierTrackingUrl(courier, trackingCode);

        trackingSectionHtml = `
            <div style="margin-top: 15px; padding: 14px 18px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                <div>
                    <div style="font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; color: #0284c7; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-truck-fast"></i> Shipment Booked & Trackable
                    </div>
                    <div style="margin-top: 5px; font-size: 0.92rem; color: var(--text-dark);">
                        Courier: <strong>${escapeHtml(courier)}</strong>
                    </div>
                    <div style="margin-top: 3px; font-size: 0.92rem; color: var(--text-dark); display: flex; align-items: center; gap: 6px;">
                        Tracking / AWB: 
                        <span style="font-family: monospace; font-weight: 700; background: #fff; padding: 2px 8px; border-radius: 4px; border: 1px solid #bae6fd; color: #0369a1; font-size: 0.95rem;">
                            ${escapeHtml(trackingCode)}
                        </span>
                        <button type="button" onclick="window.copyTrackingCode('${escapeHtml(trackingCode)}', this)" title="Copy tracking code" style="background: none; border: none; cursor: pointer; color: #0284c7; padding: 2px 6px;">
                            <i class="fa-regular fa-copy"></i>
                        </button>
                    </div>
                </div>
                ${trackingUrl ? `
                    <div>
                        <a href="${escapeHtml(trackingUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm" style="padding: 8px 16px; font-size: 0.85rem; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; background: #0284c7; border-color: #0284c7; color: #fff;">
                            <i class="fa-solid fa-location-crosshairs"></i> Track Shipment
                        </a>
                    </div>
                ` : ''}
            </div>
        `;
    }

    return `
        <div class="order-card" style="border: 1px solid var(--border-light); border-radius: 6px; padding: 20px; margin-bottom: 20px; background: var(--bg-white); box-shadow: 0 2px 8px rgba(0,0,0,0.03);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                <strong style="color: var(--text-dark); font-size: 1rem;">Order #${escapeHtml(id.slice(0, 8)).toUpperCase()}</strong>
                <span class="order-status" style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; padding: 5px 12px; border-radius: 20px; ${statusStyle}">${statusIcon}${status}</span>
            </div>
            <div style="color: var(--text-light); font-size: 0.88rem; margin-bottom: 12px; display: flex; gap: 15px; flex-wrap: wrap;">
                <span><i class="fa-regular fa-calendar" style="margin-right: 5px;"></i>${dateStr}</span>
                <span><i class="fa-solid fa-indian-rupee-sign" style="margin-right: 4px;"></i><strong>Total: ₹${totalAmount}</strong></span>
            </div>
            <div style="margin-top: 10px; border-top: 1px dashed var(--border-light); padding-top: 12px;">
                <ul style="font-size: 0.88rem; padding-left: 20px; margin: 0; color: var(--text-dark); line-height: 1.6;">
                    ${itemsHtml || '<li>Handcrafted piece</li>'}
                </ul>
            </div>
            ${trackingSectionHtml}
        </div>
    `;
}

// --- Order Management ---
async function loadOrders(user) {
    const recentList = document.getElementById('recent-orders-list');
    const fullList = document.getElementById('full-orders-list');
    const statOrderCount = document.getElementById('stat-order-count');

    if (!user) {
        if (recentList) recentList.innerHTML = '<p style="color: var(--text-light);">Please sign in to view your orders.</p>';
        if (fullList) fullList.innerHTML = '<p style="color: var(--text-light);">Please sign in to view your orders.</p>';
        return;
    }

    try {
        const ordersMap = new Map();
        let querySucceeded = false;
        let lastError = null;

        // 1. Query by userId (UID is unique and primary)
        if (user.uid) {
            try {
                // Notice: no orderBy("createdAt", "desc") here, preventing Firestore composite index error
                const qUid = query(collection(db, "orders"), where("userId", "==", user.uid));
                const snapUid = await getDocs(qUid);
                snapUid.forEach(docSnap => {
                    ordersMap.set(docSnap.id, docSnap.data());
                });
                querySucceeded = true;
            } catch (errUid) {
                console.warn("Could not query orders by userId:", errUid);
                lastError = errUid;
            }
        }

        // 2. Query by userEmail (to catch any orders placed/linked by email)
        if (user.email) {
            try {
                const qEmail = query(collection(db, "orders"), where("userEmail", "==", user.email));
                const snapEmail = await getDocs(qEmail);
                snapEmail.forEach(docSnap => {
                    ordersMap.set(docSnap.id, docSnap.data());
                });
                querySucceeded = true;
            } catch (errEmail) {
                console.warn("Could not query orders by userEmail:", errEmail);
                lastError = errEmail;
            }
        }

        // If all attempts failed with errors, throw the error
        if (!querySucceeded && lastError) {
            throw lastError;
        }

        // Convert Map to array
        const ordersList = [];
        ordersMap.forEach((data, id) => {
            ordersList.push({ id, data });
        });

        // Client-side sort by createdAt descending (safe, instantaneous, no Firestore index needed)
        ordersList.sort((a, b) => {
            const timeA = a.data.createdAt?.toMillis ? a.data.createdAt.toMillis() : 
                          (a.data.createdAt?.seconds ? a.data.createdAt.seconds * 1000 : 
                          new Date(a.data.createdAt || 0).getTime());
            const timeB = b.data.createdAt?.toMillis ? b.data.createdAt.toMillis() : 
                          (b.data.createdAt?.seconds ? b.data.createdAt.seconds * 1000 : 
                          new Date(b.data.createdAt || 0).getTime());
            return timeB - timeA;
        });

        if (statOrderCount) {
            statOrderCount.innerText = ordersList.length;
        }

        const emptyHtml = `
            <div style="text-align: center; padding: 30px 15px; background: var(--cosmic-latte-soft); border-radius: 6px; border: 1px dashed var(--border-light);">
                <i class="fa-solid fa-basket-shopping" style="font-size: 2rem; color: var(--primary-sage); margin-bottom: 12px; display: block;"></i>
                <p style="margin-bottom: 12px; color: var(--text-dark); font-weight: 500;">You haven't placed any crochet orders yet.</p>
                <a href="shop.html" class="btn" style="display: inline-block; padding: 8px 18px; font-size: 0.85rem;">Explore Collection</a>
            </div>
        `;

        if (ordersList.length === 0) {
            if (recentList) recentList.innerHTML = emptyHtml;
            if (fullList) fullList.innerHTML = emptyHtml;
            return;
        }

        const recentOrders = ordersList.slice(0, 3);
        if (recentList) {
            recentList.innerHTML = recentOrders.map(o => renderOrderCard(o.id, o.data)).join('');
        }
        if (fullList) {
            fullList.innerHTML = ordersList.map(o => renderOrderCard(o.id, o.data)).join('');
        }

    } catch (e) {
        console.error("Error loading orders:", e);
        const errorHtml = `
            <div style="padding: 20px; background: #fff5f5; border: 1px solid #fed7d7; border-radius: 6px; color: #c53030;">
                <p style="margin-bottom: 6px; font-weight: 500;">Unable to load orders right now.</p>
                <p style="font-size: 0.85rem; margin-bottom: 12px; color: #742a2a;">${escapeHtml(e.message || 'Please check your connection.')}</p>
                <button class="btn btn-secondary" style="padding: 6px 14px; font-size: 0.8rem;" onclick="location.reload()">
                    <i class="fa-solid fa-rotate-right"></i> Retry
                </button>
            </div>
        `;
        if (recentList) recentList.innerHTML = errorHtml;
        if (fullList) fullList.innerHTML = errorHtml;
    }
}

// --- Account Management ---
const accountForm = document.getElementById('account-form');
if (accountForm) {
    accountForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newName = document.getElementById('acc-name').value;
        const phone = document.getElementById('acc-phone').value;

        try {
            await updateProfile(auth.currentUser, { displayName: newName });
            // Note: Phone number update in Firebase Auth requires verification normally.
            // For now, we update the profile name.
            alert("Profile Updated!");
            window.location.reload();
        } catch (error) {
            alert("Update Failed: " + error.message);
        }
    });
}

function renderAddressCard(id, addr) {
    const type = addr.type || 'Shipping Address';
    const name = escapeHtml(addr.name || 'Recipient');
    const phone = escapeHtml(addr.phone || '');
    const address = escapeHtml(addr.address || '');
    const city = escapeHtml(addr.city || '');
    const state = escapeHtml(addr.state || '');
    const zip = escapeHtml(addr.zip || '');
    const isDefault = addr.isDefault ? `<span style="font-size: 0.72rem; background: var(--primary-sage-light); color: var(--primary-sage-dark); font-weight: 600; padding: 2px 8px; border-radius: 4px; letter-spacing: 0.5px;">DEFAULT</span>` : '';

    const locationLine = [city, state, zip ? `PIN: ${zip}` : ''].filter(Boolean).join(', ');

    return `
        <div class="address-card" style="border: 1px solid var(--border-light); padding: 22px; border-radius: 8px; background: var(--bg-white); box-shadow: 0 2px 10px rgba(0,0,0,0.03); display: flex; flex-direction: column; justify-content: space-between;">
            <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 8px; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-location-dot" style="color: var(--primary-sage); font-size: 1.05rem;"></i>
                        <strong style="color: var(--text-dark); font-size: 0.95rem;">${escapeHtml(type)}</strong>
                    </div>
                    ${isDefault}
                </div>
                <div style="font-size: 1rem; color: var(--text-dark); font-weight: 600; margin-bottom: 8px;">
                    ${name}
                </div>
                <p style="font-size: 0.88rem; color: var(--text-light); line-height: 1.6; margin: 0 0 12px 0;">
                    ${address}<br>
                    ${locationLine ? `<strong>${locationLine}</strong><br>` : ''}
                    ${phone ? `<span style="color: var(--text-dark);"><i class="fa-solid fa-phone" style="font-size: 0.78rem; margin-right: 5px; color: var(--primary-sage-dark);"></i>${phone}</span>` : ''}
                </p>
            </div>
            <div style="border-top: 1px dashed var(--border-light); padding-top: 12px; margin-top: 10px; display: flex; justify-content: flex-end;">
                <button onclick="window.deleteAddress('${id}')" style="color: #d32f2f; border: none; background: none; cursor: pointer; font-size: 0.85rem; font-weight: 500; display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px;">
                    <i class="fa-solid fa-trash-can"></i> Remove
                </button>
            </div>
        </div>
    `;
}

// --- Address Management ---
async function loadAddresses(user) {
    const list = document.getElementById('addresses-list');
    if (!list) return;
    list.innerHTML = '<p style="color: var(--text-light); grid-column: 1 / -1;">Loading addresses...</p>';

    const uid = typeof user === 'string' ? user : (user?.uid);
    if (!uid) {
        list.innerHTML = '<p style="color: var(--text-light); grid-column: 1 / -1;">Please sign in to view saved addresses.</p>';
        return;
    }

    try {
        const addressesCol = collection(db, `users/${uid}/addresses`);
        let querySnapshot = await getDocs(addressesCol);

        // If no addresses saved yet, check previous orders and auto-import them
        if (querySnapshot.empty) {
            try {
                const qOrders = query(collection(db, "orders"), where("userId", "==", uid));
                const ordersSnap = await getDocs(qOrders);
                const uniqueAddresses = new Map();

                ordersSnap.forEach((orderDoc) => {
                    const orderData = orderDoc.data();
                    const details = orderData.customerDetails;
                    if (details && (details.address || details.streetRoad) && details.city) {
                        const addrString = details.address || [details.houseNo, details.streetRoad, details.areaLocality].filter(Boolean).join(', ');
                        const key = `${details.zip || ''}_${addrString}`.toLowerCase();
                        if (!uniqueAddresses.has(key)) {
                            uniqueAddresses.set(key, {
                                name: details.name || user?.displayName || 'Customer',
                                phone: details.phone || user?.phoneNumber || '',
                                email: details.email || user?.email || '',
                                houseNo: details.houseNo || '',
                                buildingName: details.buildingName || '',
                                streetRoad: details.streetRoad || '',
                                areaLocality: details.areaLocality || '',
                                landmark: details.landmark || '',
                                postOffice: details.postOffice || '',
                                address: addrString,
                                city: details.city || '',
                                state: details.state || '',
                                zip: details.zip || '',
                                type: 'Delivery Address',
                                isDefault: uniqueAddresses.size === 0,
                                createdAt: serverTimestamp()
                            });
                        }
                    }
                });

                if (uniqueAddresses.size > 0) {
                    for (const [_, addrObj] of uniqueAddresses) {
                        await addDoc(addressesCol, addrObj);
                    }
                    querySnapshot = await getDocs(addressesCol);
                }
            } catch (syncErr) {
                console.warn("Could not sync addresses from past orders:", syncErr);
            }
        }

        if (querySnapshot.empty) {
            list.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; background: var(--cosmic-latte-soft); border-radius: 6px; border: 1px dashed var(--border-light);">
                    <i class="fa-solid fa-location-dot" style="font-size: 2rem; color: var(--primary-sage); margin-bottom: 12px; display: block;"></i>
                    <p style="margin-bottom: 12px; color: var(--text-dark); font-weight: 500;">No saved addresses yet.</p>
                    <p style="color: var(--text-light); font-size: 0.88rem; margin-bottom: 15px;">When you place an order, your delivery address will automatically be saved here for easy future checkouts.</p>
                    <button class="btn btn-secondary" onclick="showAddAddressForm()" style="padding: 8px 18px; font-size: 0.85rem;">Add Address Now</button>
                </div>
            `;
            return;
        }

        let html = '';
        querySnapshot.forEach((snap) => {
            html += renderAddressCard(snap.id, snap.data());
        });
        list.innerHTML = html;

    } catch (e) {
        console.error("Error loading addresses:", e);
        list.innerHTML = '<p style="color: var(--text-light); grid-column: 1 / -1;">Unable to load addresses. Please refresh the page.</p>';
    }
}

window.showAddAddressForm = () => {
    const modal = document.getElementById('address-modal');
    if (modal) {
        modal.style.display = 'flex';
        if (auth.currentUser) {
            const nameField = document.getElementById('modal-addr-name');
            const phoneField = document.getElementById('modal-addr-phone');
            if (nameField && !nameField.value && auth.currentUser.displayName) {
                nameField.value = auth.currentUser.displayName;
            }
            if (phoneField && !phoneField.value && auth.currentUser.phoneNumber) {
                phoneField.value = auth.currentUser.phoneNumber;
            }
        }
    } else {
        const name = prompt("Name:");
        const address = prompt("Address:");
        const city = prompt("City:");
        const zip = prompt("ZIP:");
        const phone = prompt("Phone:");
        if (name && address && city && zip && phone) {
            saveAddress({ name, address, city, zip, phone, type: 'Home' });
        }
    }
};

window.closeAddressModal = () => {
    const modal = document.getElementById('address-modal');
    if (modal) {
        modal.style.display = 'none';
        const form = document.getElementById('new-address-form');
        if (form) form.reset();
    }
};

// Form listener for new address modal
const newAddrForm = document.getElementById('new-address-form');
if (newAddrForm) {
    newAddrForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const addrData = {
            name: document.getElementById('modal-addr-name')?.value.trim() || '',
            phone: document.getElementById('modal-addr-phone')?.value.trim() || '',
            address: document.getElementById('modal-addr-address')?.value.trim() || '',
            city: document.getElementById('modal-addr-city')?.value.trim() || '',
            state: document.getElementById('modal-addr-state')?.value.trim() || '',
            zip: document.getElementById('modal-addr-zip')?.value.trim() || '',
            type: document.getElementById('modal-addr-type')?.value || 'Home',
            createdAt: serverTimestamp()
        };
        await saveAddress(addrData);
        closeAddressModal();
    });
}

async function saveAddress(addr) {
    const uid = auth.currentUser?.uid;
    if (!uid) {
        alert("Please sign in to save an address.");
        return;
    }
    try {
        const addressesCol = collection(db, `users/${uid}/addresses`);
        await addDoc(addressesCol, addr);
        loadAddresses(auth.currentUser);
    } catch (e) {
        console.error("Error saving address:", e);
        alert("Error saving address: " + e.message);
    }
}

window.deleteAddress = async (id) => {
    if (confirm("Are you sure you want to remove this address?")) {
        try {
            await deleteDoc(doc(db, `users/${auth.currentUser.uid}/addresses`, id));
            loadAddresses(auth.currentUser);
        } catch (e) {
            console.error("Error deleting address:", e);
            alert("Could not remove address: " + e.message);
        }
    }
};

// --- Security ---
const resetBtn = document.getElementById('send-reset-email');
if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
        try {
            const actionCodeSettings = {
                url: `${window.location.origin}/reset-password.html`,
                handleCodeInApp: false
            };
            try {
                await sendPasswordResetEmail(auth, auth.currentUser.email, actionCodeSettings);
            } catch (err) {
                await sendPasswordResetEmail(auth, auth.currentUser.email);
            }
            alert("Reset email sent to " + auth.currentUser.email);
        } catch (e) {
            alert(e.message);
        }
    });
}

const deleteAccBtn = document.getElementById('delete-account-btn');
if (deleteAccBtn) {
    deleteAccBtn.addEventListener('click', async () => {
        if (confirm("CRITICAL: This will permanently delete your account. Proceed?")) {
            try {
                await deleteUser(auth.currentUser);
                window.location.href = 'index.html';
            } catch (e) {
                alert("For security, you must have logged in recently to delete your account. Please log out and back in, then try again.");
            }
        }
    });
}

// --- Logout ---
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        await signOut(auth);
        window.location.href = 'index.html';
    });
}
