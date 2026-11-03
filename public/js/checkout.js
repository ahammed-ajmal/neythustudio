import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, addDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { clearCart, getCartTotal } from './cart.js';
import { CONFIG } from './config.js';

const checkoutForm = document.getElementById('checkout-form');
const zipInput = document.getElementById('zip');
const postOfficeSelect = document.getElementById('post-office');
const postOfficeManual = document.getElementById('post-office-manual');
const cityInput = document.getElementById('city');
const stateInput = document.getElementById('state');
const areaLocalityInput = document.getElementById('area-locality');
const pincodeStatus = document.getElementById('pincode-status');
const pincodeIcon = document.getElementById('pincode-icon');

let currentUser = null;
const pincodeCache = new Map();
let currentPincodeFetchController = null;

// Auth Check & Auto-fill Saved Address
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        const emailInput = document.getElementById('email');
        if (emailInput && !emailInput.value) {
            emailInput.value = user.email || '';
        }
        const nameInput = document.getElementById('name');
        if (nameInput && !nameInput.value && user.displayName) {
            nameInput.value = user.displayName;
        }
        const phoneInput = document.getElementById('phone');
        if (phoneInput && !phoneInput.value && user.phoneNumber) {
            phoneInput.value = user.phoneNumber;
        }

        // Auto-fill from saved addresses if fields are currently empty
        try {
            const addressesCol = collection(db, `users/${user.uid}/addresses`);
            const addrSnap = await getDocs(addressesCol);
            if (!addrSnap.empty) {
                let savedAddr = null;
                addrSnap.forEach(snap => {
                    const data = snap.data();
                    if (!savedAddr || data.isDefault) {
                        savedAddr = data;
                    }
                });

                if (savedAddr) {
                    const houseInput = document.getElementById('house-no');
                    const bldInput = document.getElementById('building-name');
                    const streetInput = document.getElementById('street-road');
                    const areaInput = document.getElementById('area-locality');
                    const landmarkInput = document.getElementById('landmark');
                    const zipInputEl = document.getElementById('zip');
                    const cityInputEl = document.getElementById('city');
                    const stateInputEl = document.getElementById('state');

                    if (phoneInput && !phoneInput.value && savedAddr.phone) {
                        phoneInput.value = savedAddr.phone;
                    }
                    if (nameInput && !nameInput.value && savedAddr.name) {
                        nameInput.value = savedAddr.name;
                    }

                    if (streetInput && !streetInput.value) {
                        if (houseInput && savedAddr.houseNo) houseInput.value = savedAddr.houseNo;
                        if (bldInput && savedAddr.buildingName) bldInput.value = savedAddr.buildingName;
                        if (savedAddr.streetRoad) {
                            streetInput.value = savedAddr.streetRoad;
                        } else if (savedAddr.address) {
                            streetInput.value = savedAddr.address;
                        }
                        if (areaInput && savedAddr.areaLocality) areaInput.value = savedAddr.areaLocality;
                        if (landmarkInput && savedAddr.landmark) landmarkInput.value = savedAddr.landmark;
                        if (cityInputEl && savedAddr.city) cityInputEl.value = savedAddr.city;
                        if (stateInputEl && savedAddr.state) stateInputEl.value = savedAddr.state;
                        if (zipInputEl && savedAddr.zip) {
                            zipInputEl.value = savedAddr.zip;
                            lookupPincode(savedAddr.zip);
                        }
                    }
                }
            }
        } catch (addrLoadErr) {
            console.warn("Could not prefill saved address:", addrLoadErr);
        }
    } else {
        window.location.href = 'login.html?redirect=checkout.html';
    }
});

// Load Cart Summary
document.addEventListener('DOMContentLoaded', () => {
    const cart = JSON.parse(localStorage.getItem('neythu_cart') || localStorage.getItem('jasmnl_cart') || '[]');
    const itemsContainer = document.getElementById('checkout-items');

    if (cart.length === 0) {
        window.location.href = 'shop.html';
        return;
    }

    if (itemsContainer) {
        itemsContainer.innerHTML = cart.map(item => {
            const metaParts = [];
            if (item.color) metaParts.push(`Shade: ${item.color}`);
            if (item.type) metaParts.push(`Stitch: ${item.type}`);
            if (item.size && item.size !== 'Standard') metaParts.push(`Fit: ${item.size}`);

            const metaStr = metaParts.length > 0
                ? `<div style="font-size:0.8rem; color:#777; margin-top:2px;">${metaParts.join(' | ')}</div>`
                : '';

            return `
                <div class="order-item" style="display:flex; justify-content:space-between; margin-bottom: 15px; border-bottom: 1px dashed #e0e0e0; padding-bottom: 10px;">
                    <div>
                        <strong>${item.name}</strong> <span style="color:#666;">(x${item.quantity || 1})</span>
                        ${metaStr}
                    </div>
                    <span style="font-weight: 500;">₹${(item.price * (item.quantity || 1)).toFixed(2)}</span>
                </div>
            `;
        }).join('');
    }

    const total = getCartTotal();
    const totalEl = document.getElementById('checkout-total');
    if (totalEl) totalEl.innerText = '₹' + total.toFixed(2);
    const btnTotalEl = document.getElementById('btn-total-amount');
    if (btnTotalEl) btnTotalEl.innerText = '₹' + total.toFixed(2);
});

// Helper to escape HTML characters
function escapeHTML(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Post Office manual toggle
if (postOfficeSelect) {
    postOfficeSelect.addEventListener('change', (e) => {
        const selectedVal = e.target.value;
        if (selectedVal === '__manual__') {
            if (postOfficeManual) {
                postOfficeManual.style.display = 'block';
                postOfficeManual.focus();
            }
        } else {
            if (postOfficeManual) {
                postOfficeManual.style.display = 'none';
            }
            // Auto-fill Area / Locality if empty
            if (areaLocalityInput && !areaLocalityInput.value && selectedVal) {
                areaLocalityInput.value = selectedVal;
            }
        }
    });
}

// PIN Code Auto-fetch logic
async function lookupPincode(pincode) {
    if (!pincode || pincode.length !== 6) {
        if (pincodeStatus) {
            pincodeStatus.className = 'pincode-status';
            pincodeStatus.innerHTML = '<i class="fa-solid fa-bolt"></i> Enter 6-digit PIN code to auto-fetch location';
        }
        if (pincodeIcon) {
            pincodeIcon.innerHTML = '<i class="fa-solid fa-map-pin"></i>';
        }
        if (postOfficeSelect) {
            postOfficeSelect.innerHTML = '<option value="">-- Enter PIN Code first --</option>';
        }
        if (postOfficeManual) {
            postOfficeManual.style.display = 'none';
        }
        return;
    }

    // Check memory cache
    if (pincodeCache.has(pincode)) {
        applyPincodeData(pincodeCache.get(pincode));
        return;
    }

    // Abort previous in-flight request if user kept typing
    if (currentPincodeFetchController) {
        currentPincodeFetchController.abort();
    }
    currentPincodeFetchController = new AbortController();

    if (pincodeStatus) {
        pincodeStatus.className = 'pincode-status loading';
        pincodeStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Fetching Post Offices & location for PIN ${pincode}...`;
    }
    if (pincodeIcon) {
        pincodeIcon.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    }
    if (postOfficeSelect) {
        postOfficeSelect.innerHTML = `<option value="">⏳ Loading Post Offices for ${pincode}...</option>`;
    }

    try {
        const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`, {
            signal: currentPincodeFetchController.signal
        });
        const data = await response.json();

        if (Array.isArray(data) && data[0]?.Status === 'Success' && data[0]?.PostOffice?.length > 0) {
            const offices = data[0].PostOffice;
            const primary = offices[0];
            const city = primary.District || primary.Block || primary.Circle || '';
            const state = primary.State || '';
            const postOffices = [...new Set(offices.map(o => o.Name).filter(Boolean))];

            const result = { city, state, postOffices, pincode };
            pincodeCache.set(pincode, result);
            applyPincodeData(result);
        } else {
            if (pincodeStatus) {
                pincodeStatus.className = 'pincode-status error';
                pincodeStatus.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> PIN code not recognized. Please fill Post Office, City & State manually.';
            }
            if (pincodeIcon) {
                pincodeIcon.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:#c53030;"></i>';
            }
            if (postOfficeSelect) {
                postOfficeSelect.innerHTML = `
                    <option value="" selected>-- No Post Offices found --</option>
                    <option value="__manual__">+ Type Post Office manually</option>
                `;
            }
            if (postOfficeManual) {
                postOfficeManual.style.display = 'block';
            }
        }
    } catch (err) {
        if (err.name === 'AbortError') return;
        console.warn('Pincode fetch error:', err);
        if (pincodeStatus) {
            pincodeStatus.className = 'pincode-status error';
            pincodeStatus.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Could not auto-detect location. Please enter manually.';
        }
        if (pincodeIcon) {
            pincodeIcon.innerHTML = '<i class="fa-solid fa-map-pin"></i>';
        }
        if (postOfficeSelect) {
            postOfficeSelect.innerHTML = `
                <option value="" selected>-- Could not load Post Offices --</option>
                <option value="__manual__">+ Type Post Office manually</option>
            `;
        }
        if (postOfficeManual) {
            postOfficeManual.style.display = 'block';
        }
    }
}

function applyPincodeData(result) {
    // 1. Fill Post Offices in select dropdown WITHOUT auto-selecting any post office
    if (postOfficeSelect && result.postOffices && result.postOffices.length > 0) {
        const count = result.postOffices.length;
        let optionsHtml = `<option value="" selected>-- Select Post Office (${count} available) --</option>`;

        result.postOffices.forEach((po) => {
            optionsHtml += `<option value="${escapeHTML(po)}">${escapeHTML(po)}</option>`;
        });
        optionsHtml += `<option value="__manual__">+ Type Post Office manually</option>`;

        postOfficeSelect.innerHTML = optionsHtml;
        postOfficeSelect.value = ''; // Ensure placeholder is selected, not the first post office
        postOfficeSelect.classList.remove('auto-filled-highlight');
        void postOfficeSelect.offsetWidth;
        postOfficeSelect.classList.add('auto-filled-highlight');

        if (postOfficeManual) {
            postOfficeManual.style.display = 'none';
            postOfficeManual.value = '';
        }
    }

    // 2. Fill City
    if (cityInput && result.city) {
        cityInput.value = result.city;
        cityInput.classList.remove('auto-filled-highlight');
        void cityInput.offsetWidth;
        cityInput.classList.add('auto-filled-highlight');
    }

    // 3. Fill State
    if (stateInput && result.state) {
        stateInput.value = result.state;
        stateInput.classList.remove('auto-filled-highlight');
        void stateInput.offsetWidth;
        stateInput.classList.add('auto-filled-highlight');
    }

    // 4. Update Status and Icon
    if (pincodeStatus) {
        const poCount = result.postOffices ? result.postOffices.length : 0;
        pincodeStatus.className = 'pincode-status success';
        pincodeStatus.innerHTML = `<i class="fa-solid fa-circle-check"></i> Found: <strong>${escapeHTML(result.city)}, ${escapeHTML(result.state)}</strong> (${poCount} Post Office${poCount > 1 ? 's' : ''})`;
    }

    if (pincodeIcon) {
        pincodeIcon.innerHTML = '<i class="fa-solid fa-circle-check" style="color:#216e2b;"></i>';
    }
}

// Bind PIN code input listeners
if (zipInput) {
    zipInput.addEventListener('input', (e) => {
        const raw = e.target.value;
        const cleaned = raw.replace(/\D/g, '').slice(0, 6);
        if (raw !== cleaned) {
            e.target.value = cleaned;
        }

        if (cleaned.length === 6) {
            lookupPincode(cleaned);
        } else {
            if (pincodeStatus) {
                pincodeStatus.className = 'pincode-status';
                pincodeStatus.innerHTML = '<i class="fa-solid fa-bolt"></i> Enter 6-digit PIN code to auto-fetch location';
            }
            if (pincodeIcon) {
                pincodeIcon.innerHTML = '<i class="fa-solid fa-map-pin"></i>';
            }
            if (postOfficeSelect) {
                postOfficeSelect.innerHTML = '<option value="">-- Enter PIN Code first --</option>';
            }
            if (postOfficeManual) {
                postOfficeManual.style.display = 'none';
            }
        }
    });

    zipInput.addEventListener('blur', (e) => {
        const val = e.target.value.trim();
        if (val.length === 6) {
            lookupPincode(val);
        }
    });

    zipInput.addEventListener('paste', (e) => {
        setTimeout(() => {
            const cleaned = zipInput.value.replace(/\D/g, '').slice(0, 6);
            zipInput.value = cleaned;
            if (cleaned.length === 6) {
                lookupPincode(cleaned);
            }
        }, 10);
    });
}

// Handle Order Submission
if (checkoutForm) {
    checkoutForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!currentUser) {
            alert("You must be logged in to place an order.");
            return;
        }

        const name = document.getElementById('name').value.trim();
        const email = document.getElementById('email').value.trim();
        const phone = document.getElementById('phone').value.trim();

        const houseNo = document.getElementById('house-no').value.trim();
        const buildingName = document.getElementById('building-name') ? document.getElementById('building-name').value.trim() : '';
        const streetRoad = document.getElementById('street-road').value.trim();
        const areaLocality = document.getElementById('area-locality').value.trim();
        const landmark = document.getElementById('landmark') ? document.getElementById('landmark').value.trim() : '';
        const zip = zipInput ? zipInput.value.trim() : '';

        let postOffice = '';
        if (postOfficeSelect && postOfficeSelect.value) {
            if (postOfficeSelect.value === '__manual__' && postOfficeManual) {
                postOffice = postOfficeManual.value.trim();
            } else if (postOfficeSelect.value !== '__manual__') {
                postOffice = postOfficeSelect.value.trim();
            }
        } else if (postOfficeManual && postOfficeManual.value) {
            postOffice = postOfficeManual.value.trim();
        }

        const city = cityInput ? cityInput.value.trim() : '';
        const state = stateInput ? stateInput.value.trim() : '';
        const cart = JSON.parse(localStorage.getItem('neythu_cart') || localStorage.getItem('jasmnl_cart') || '[]');
        const total = getCartTotal();

        if (!houseNo) {
            alert("Please enter your House / Flat No.");
            document.getElementById('house-no')?.focus();
            return;
        }

        if (!streetRoad) {
            alert("Please enter your Street / Road.");
            document.getElementById('street-road')?.focus();
            return;
        }

        if (!areaLocality) {
            alert("Please enter your Area / Locality.");
            document.getElementById('area-locality')?.focus();
            return;
        }

        if (!zip || zip.length !== 6) {
            alert("Please enter a valid 6-digit PIN code.");
            if (zipInput) zipInput.focus();
            return;
        }

        if (!city) {
            alert("Please enter your City / Town / Village.");
            if (cityInput) cityInput.focus();
            return;
        }

        // Build full composite address string for shipping labels, receipts, admin view & WhatsApp
        const addressParts = [];
        if (houseNo) addressParts.push(houseNo);
        if (buildingName) addressParts.push(buildingName);
        if (streetRoad) addressParts.push(streetRoad);
        if (areaLocality) addressParts.push(areaLocality);
        if (landmark) addressParts.push(`Near ${landmark}`);
        if (postOffice) addressParts.push(`PO: ${postOffice}`);

        const fullStreetAddress = addressParts.join(', ');

        const submitBtn = checkoutForm.querySelector('button[type="submit"]');
        const origText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Initializing Secure Payment...';

        try {
            // 1. Get Firebase Auth ID Token for secure backend authentication
            const idToken = await currentUser.getIdToken();

            const customerPayload = {
                name,
                email,
                phone,
                houseNo,
                buildingName,
                streetRoad,
                areaLocality,
                landmark,
                zip,
                postOffice,
                city,
                state: state || '',
                address: fullStreetAddress
            };

            // 2. Request backend to create Cashfree order and payment session
            const response = await fetch(`${CONFIG.BACKEND_URL}/api/create-order`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    customerDetails: customerPayload,
                    items: cart,
                    totalAmount: total
                })
            });

            const data = await response.json();

            if (!response.ok || !data.paymentSessionId) {
                throw new Error(data.error || 'Could not initiate payment session with Cashfree.');
            }

            // 3. Launch Cashfree Web JS SDK v3 Modal
            if (typeof Cashfree === 'undefined') {
                throw new Error('Cashfree SDK is still loading. Please try again in a few moments.');
            }

            const cashfree = Cashfree({ mode: CONFIG.CASHFREE_MODE || 'sandbox' });
            
            const checkoutOptions = {
                paymentSessionId: data.paymentSessionId,
                redirectTarget: "_modal"
            };

            cashfree.checkout(checkoutOptions).then(async (result) => {
                if (result.error) {
                    console.warn("Cashfree checkout notice:", result.error);
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = origText;
                    if (result.error.message && result.error.message !== 'Popup closed') {
                        alert("Payment status: " + result.error.message);
                    }
                    return;
                }

                if (result.redirect) {
                    // Cashfree handles redirect to return_url
                    return;
                }

                // Payment completed inside modal -> Verify with backend
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying Payment...';
                try {
                    const verifyRes = await fetch(`${CONFIG.BACKEND_URL}/api/verify-payment`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ orderId: data.orderId })
                    });
                    const verifyData = await verifyRes.json();

                    if (verifyData.isPaid || verifyData.orderStatus === 'PAID') {
                        clearCart();
                        window.location.href = `order-success.html?order_id=${encodeURIComponent(data.orderId)}`;
                    } else {
                        alert(`Payment finished with status: ${verifyData.orderStatus || 'Pending'}. If amount was deducted, please view your orders in profile.`);
                        window.location.href = "profile.html";
                    }
                } catch (verifyErr) {
                    console.error("Verification error:", verifyErr);
                    clearCart();
                    window.location.href = `order-success.html?order_id=${encodeURIComponent(data.orderId)}`;
                }
            });

        } catch (error) {
            console.error("Error initiating payment:", error);
            alert("Payment initiation failed: " + error.message);
            submitBtn.disabled = false;
            submitBtn.innerHTML = origText;
        }
    });
}
