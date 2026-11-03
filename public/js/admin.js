import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, addDoc, getDocs, query, orderBy, deleteDoc, doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Admin Check Helper
async function checkAdminStatus(user) {
    if (!user) return false;
    try {
        const idTokenResult = await user.getIdTokenResult();
        return !!idTokenResult.claims.admin;
    } catch (error) {
        console.error("Error checking admin status:", error);
        return false;
    }
}

// Auth Guard
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'login.html?redirect=admin.html';
        return;
    }

    const admin = await checkAdminStatus(user);
    if (!admin) {
        alert("Access Denied: You do not have admin privileges.");
        window.location.href = 'index.html';
    }
});

// --- Product Management ---

let currentCategories = [];
let currentProductTypes = [];
const adminProductsCache = new Map();

const productForm = document.getElementById('add-product-form');

if (productForm) {
    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('p-name').value.trim();
        const category = document.getElementById('p-category').value;
        const type = document.getElementById('p-type').value;
        const color = document.getElementById('p-color').value.trim();
        const price = parseFloat(document.getElementById('p-price').value);
        const offerPriceVal = document.getElementById('p-offer-price').value.trim();
        const offerPrice = offerPriceVal ? parseFloat(offerPriceVal) : null;
        const description = document.getElementById('p-desc').value.trim();

        if (addProductPhotos.length === 0) {
            alert("Please upload at least one photo for this crochet piece.");
            return;
        }

        const image = addProductPhotos[0];
        const images = [...addProductPhotos];

        if (!category) {
            alert("Please select a Category. You can add new categories in the Settings tab.");
            return;
        }

        if (!type) {
            alert("Please select a Product Type. You can add new product types in the Settings tab.");
            return;
        }

        const submitBtn = productForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerText;
        submitBtn.disabled = true;
        submitBtn.innerText = "Adding Product...";

        try {
            await addDoc(collection(db, "products"), {
                name,
                category,
                type,
                color,
                price,
                offerPrice,
                image,
                images,
                description,
                createdAt: new Date()
            });
            localStorage.removeItem('neythu_products_cache');
            alert("Product Added Successfully!");
            productForm.reset();
            addProductPhotos = [];
            renderPhotosGallery('p');
            loadAdminProducts(); // Refresh list
        } catch (error) {
            console.error("Error adding product: ", error);
            alert("Error adding product: " + error.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = originalText;
        }
    });
}

async function loadAdminProducts() {
    const tbody = document.getElementById('admin-products-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 25px;">Loading products...</td></tr>';

    try {
        const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);

        adminProductsCache.clear();

        if (querySnapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 25px; color: var(--text-light);">No products found in Firestore.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        querySnapshot.forEach((docSnap) => {
            const p = docSnap.data();
            adminProductsCache.set(docSnap.id, { id: docSnap.id, ...p });

            const priceFormatted = !isNaN(p.price) ? `₹${Number(p.price).toFixed(2)}` : '₹0.00';
            const offerPriceFormatted = (p.offerPrice !== undefined && p.offerPrice !== null && !isNaN(p.offerPrice))
                ? `<span style="color:#2e7d32; font-weight:600;">₹${Number(p.offerPrice).toFixed(2)}</span>`
                : `<span style="color:#999;">-</span>`;

            const allImages = Array.isArray(p.images) && p.images.length > 0
                ? p.images
                : (p.image ? [p.image] : []);
            const mainImg = allImages[0] || 'https://via.placeholder.com/50?text=No+Img';
            const extraCount = allImages.length > 1 ? allImages.length : null;

            const row = `
                <tr>
                    <td>
                        <div style="position:relative; width:50px; height:50px; display:inline-block;">
                            <img src="${mainImg}" alt="${p.name || 'Product'}" style="width:50px; height:50px; object-fit:cover; border-radius:4px;" onerror="this.src='https://via.placeholder.com/50?text=No+Img'">
                            ${extraCount ? `<span style="position:absolute; bottom:-3px; right:-3px; background:var(--primary-sage-dark); color:white; font-size:0.62rem; font-weight:700; padding:1px 5px; border-radius:10px; border:1px solid #fff;" title="${extraCount} photos">${extraCount} 📷</span>` : ''}
                        </div>
                    </td>
                    <td><strong>${p.name || 'Untitled'}</strong></td>
                    <td>${p.category || '-'}</td>
                    <td>${p.type || '-'}</td>
                    <td>${p.color ? `<span style="display:inline-block; padding: 2px 8px; background:#f5f5f5; border:1px solid #e0e0e0; border-radius:4px; font-size:0.85rem;">${p.color}</span>` : '-'}</td>
                    <td>${priceFormatted}</td>
                    <td>${offerPriceFormatted}</td>
                    <td style="white-space: nowrap;">
                        <button class="btn-action-edit" onclick="window.openEditProductModal('${docSnap.id}')" title="Edit this crochet piece">
                            <i class="fa-solid fa-pen-to-square"></i> Edit
                        </button>
                        <button class="btn-action-delete" onclick="window.deleteProduct('${docSnap.id}')" title="Delete this crochet piece">
                            <i class="fa-solid fa-trash-can"></i> Delete
                        </button>
                    </td>
                </tr>
            `;
            tbody.innerHTML += row;
        });

    } catch (e) {
        console.error("Error loading products:", e);
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 25px; color: #d32f2f;">Error loading data: ${e.message}</td></tr>`;
    }
}

window.deleteProduct = async (id) => {
    if (confirm("Are you sure you want to delete this product?")) {
        try {
            await deleteDoc(doc(db, "products", id));
            localStorage.removeItem('neythu_products_cache');
            loadAdminProducts();
        } catch (error) {
            console.error("Error deleting product:", error);
            alert("Error deleting product: " + error.message);
        }
    }
};

// --- Edit Product Modal Logic ---

window.openEditProductModal = async (id) => {
    let product = adminProductsCache.get(id);
    if (!product) {
        try {
            const snap = await getDoc(doc(db, "products", id));
            if (snap.exists()) {
                product = { id: snap.id, ...snap.data() };
            }
        } catch (e) {
            console.error("Error fetching product details:", e);
        }
    }

    if (!product) {
        alert("Product not found.");
        return;
    }

    document.getElementById('edit-p-id').value = id;
    document.getElementById('edit-p-name').value = product.name || '';

    // Populate category dropdown
    const catSelect = document.getElementById('edit-p-category');
    if (catSelect) {
        catSelect.innerHTML = '<option value="">-- Select Crochet Category --</option>' +
            currentCategories.map(cat => `<option value="${cat.name}">${cat.name}</option>`).join('');
        if (product.category && !currentCategories.some(c => c.name === product.category)) {
            const opt = document.createElement('option');
            opt.value = product.category;
            opt.textContent = product.category;
            catSelect.appendChild(opt);
        }
        catSelect.value = product.category || '';
    }

    // Populate stitch type dropdown
    const typeSelect = document.getElementById('edit-p-type');
    if (typeSelect) {
        typeSelect.innerHTML = '<option value="">-- Select Stitch / Style --</option>' +
            currentProductTypes.map(t => `<option value="${t.name}">${t.name}</option>`).join('');
        if (product.type && !currentProductTypes.some(t => t.name === product.type)) {
            const opt = document.createElement('option');
            opt.value = product.type;
            opt.textContent = product.type;
            typeSelect.appendChild(opt);
        }
        typeSelect.value = product.type || '';
    }

    document.getElementById('edit-p-color').value = product.color || '';
    document.getElementById('edit-p-price').value = (product.price !== undefined && product.price !== null) ? product.price : '';
    document.getElementById('edit-p-offer-price').value = (product.offerPrice !== undefined && product.offerPrice !== null) ? product.offerPrice : '';
    
    // Load all photos into edit gallery
    editProductPhotos = Array.isArray(product.images) && product.images.length > 0
        ? [...product.images]
        : (product.image ? [product.image] : []);
    renderPhotosGallery('edit-p');

    document.getElementById('edit-p-desc').value = product.description || '';

    const modal = document.getElementById('edit-product-modal');
    if (modal) {
        modal.classList.add('active');
    }
};

window.closeEditProductModal = () => {
    const modal = document.getElementById('edit-product-modal');
    if (modal) {
        modal.classList.remove('active');
    }
};

// Edit Form Submission
const editProductForm = document.getElementById('edit-product-form');
if (editProductForm) {
    editProductForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = document.getElementById('edit-p-id').value;
        const name = document.getElementById('edit-p-name').value.trim();
        const category = document.getElementById('edit-p-category').value;
        const type = document.getElementById('edit-p-type').value;
        const color = document.getElementById('edit-p-color').value.trim();
        const price = parseFloat(document.getElementById('edit-p-price').value);
        const offerPriceVal = document.getElementById('edit-p-offer-price').value.trim();
        const offerPrice = offerPriceVal ? parseFloat(offerPriceVal) : null;
        const description = document.getElementById('edit-p-desc').value.trim();

        if (!id) {
            alert("Product ID is missing.");
            return;
        }

        if (editProductPhotos.length === 0) {
            alert("Please upload or provide at least one photo for this crochet piece.");
            return;
        }

        const image = editProductPhotos[0];
        const images = [...editProductPhotos];

        if (!category) {
            alert("Please select a Category.");
            return;
        }

        if (!type) {
            alert("Please select a Stitch / Style Type.");
            return;
        }

        const submitBtn = document.getElementById('edit-p-submit-btn');
        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving Changes...';

        try {
            await updateDoc(doc(db, "products", id), {
                name,
                category,
                type,
                color,
                price,
                offerPrice,
                image,
                images,
                description,
                updatedAt: new Date()
            });
            localStorage.removeItem('neythu_products_cache');
            alert("Crochet piece updated successfully!");
            window.closeEditProductModal();
            loadAdminProducts(); // Refresh list
        } catch (error) {
            console.error("Error updating product: ", error);
            alert("Error updating product: " + error.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    });
}

// Live Image URL preview listener
const editImageInput = document.getElementById('edit-p-image');
if (editImageInput) {
    editImageInput.addEventListener('input', (e) => {
        const preview = document.getElementById('edit-p-preview');
        if (preview) {
            const val = e.target.value.trim();
            if (val) {
                preview.src = val;
                preview.style.display = 'block';
            } else {
                preview.style.display = 'none';
            }
        }
    });
}

// Close modal when clicking backdrop or pressing Escape
const editModalOverlay = document.getElementById('edit-product-modal');
if (editModalOverlay) {
    editModalOverlay.addEventListener('click', (e) => {
        if (e.target === editModalOverlay) {
            window.closeEditProductModal();
        }
    });
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        window.closeEditProductModal();
    }
});


// --- Order Management & Courier Tracking ---

let adminOrdersData = {}; // Store for access
let currentOrdersFilter = 'all';
let searchOrdersQuery = '';

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

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

function showAdminToast(message, type = 'success') {
    let toast = document.getElementById('admin-order-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'admin-order-toast';
        toast.style.cssText = `
            position: fixed;
            bottom: 25px;
            right: 25px;
            z-index: 10000;
            padding: 12px 22px;
            border-radius: 6px;
            color: #fff;
            font-size: 0.92rem;
            font-weight: 500;
            box-shadow: 0 4px 15px rgba(0,0,0,0.15);
            display: flex;
            align-items: center;
            gap: 10px;
            transition: opacity 0.3s ease, transform 0.3s ease;
            opacity: 0;
            transform: translateY(15px);
            pointer-events: none;
        `;
        document.body.appendChild(toast);
    }
    toast.style.backgroundColor = type === 'error' ? '#d32f2f' : '#2e7d32';
    toast.innerHTML = `<i class="fa-solid ${type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i> ${escapeHtml(message)}`;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(15px)';
    }, 3500);
}

async function loadOrders() {
    const list = document.getElementById('admin-orders-list');
    if (!list) return;

    try {
        list.innerHTML = '<p style="color: var(--text-light); padding: 20px 0;"><i class="fa-solid fa-spinner fa-spin"></i> Loading studio orders...</p>';
        const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);

        adminOrdersData = {};
        if (querySnapshot.empty) {
            renderAdminOrders();
            return;
        }

        querySnapshot.forEach((docSnap) => {
            adminOrdersData[docSnap.id] = docSnap.data();
        });

        renderAdminOrders();

    } catch (e) {
        console.error("Error loading orders:", e);
        list.innerHTML = `<p style="color: red;">Error loading orders: ${escapeHtml(e.message)}</p>`;
    }
}

function renderAdminOrders() {
    const list = document.getElementById('admin-orders-list');
    if (!list) return;

    const allIds = Object.keys(adminOrdersData);

    // Compute filter counts
    const counts = {
        all: allIds.length,
        pending: 0,
        booked: 0,
        shipped: 0,
        delivered: 0,
        cancelled: 0
    };

    allIds.forEach(id => {
        const status = (adminOrdersData[id].status || 'pending').toLowerCase();
        if (counts[status] !== undefined) {
            counts[status]++;
        }
    });

    // Update filter badge counts
    const countEl = (name) => document.getElementById(`count-order-${name}`);
    if (countEl('all')) countEl('all').textContent = counts.all;
    if (countEl('pending')) countEl('pending').textContent = counts.pending;
    if (countEl('booked')) countEl('booked').textContent = counts.booked;
    if (countEl('shipped')) countEl('shipped').textContent = counts.shipped;
    if (countEl('delivered')) countEl('delivered').textContent = counts.delivered;
    if (countEl('cancelled')) countEl('cancelled').textContent = counts.cancelled;

    if (allIds.length === 0) {
        list.innerHTML = '<p style="color: var(--text-light); padding: 25px 0; text-align: center;"><i class="fa-solid fa-receipt" style="font-size: 2rem; margin-bottom: 10px; display: block; opacity: 0.5;"></i>No orders placed yet.</p>';
        return;
    }

    // Filter by tab & search query
    const filteredIds = allIds.filter(id => {
        const order = adminOrdersData[id];
        const status = (order.status || 'pending').toLowerCase();

        // Status tab filter
        if (currentOrdersFilter !== 'all' && status !== currentOrdersFilter) {
            return false;
        }

        // Search query filter
        if (searchOrdersQuery.trim()) {
            const q = searchOrdersQuery.toLowerCase().trim();
            const orderIdShort = id.slice(0, 8).toLowerCase();
            const customerName = (order.customerDetails?.name || '').toLowerCase();
            const phone = (order.customerDetails?.phone || '').toLowerCase();
            const email = (order.userEmail || '').toLowerCase();
            const tracking = (order.trackingCode || '').toLowerCase();
            const courier = (order.courier || '').toLowerCase();

            const matches = orderIdShort.includes(q) ||
                customerName.includes(q) ||
                phone.includes(q) ||
                email.includes(q) ||
                tracking.includes(q) ||
                courier.includes(q);

            if (!matches) return false;
        }

        return true;
    });

    if (filteredIds.length === 0) {
        list.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; background: #fafafa; border: 1px dashed var(--border-light); border-radius: 8px;">
                <i class="fa-solid fa-filter" style="font-size: 1.8rem; color: var(--text-light); margin-bottom: 10px;"></i>
                <h4 style="margin-bottom: 5px; color: var(--text-dark);">No matching orders found</h4>
                <p style="color: var(--text-light); font-size: 0.9rem; margin-bottom: 15px;">No orders match the current filter "${escapeHtml(currentOrdersFilter)}" or search query.</p>
                <button type="button" class="btn-secondary-outline btn-sm" onclick="window.filterAdminOrders('all')">View All Orders</button>
            </div>
        `;
        return;
    }

    list.innerHTML = '';

    filteredIds.forEach(id => {
        const order = adminOrdersData[id];
        const rawDate = order.createdAt;
        let dateStr = 'N/A';
        if (rawDate && typeof rawDate.toDate === 'function') {
            dateStr = rawDate.toDate().toLocaleString('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short'
            });
        } else if (rawDate) {
            dateStr = new Date(rawDate).toLocaleString('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short'
            });
        }

        const status = (order.status || 'pending').toLowerCase();
        const hasTracking = Boolean(order.trackingCode && order.trackingCode.trim());
        const isBooked = status === 'booked';
        const trackingCode = order.trackingCode ? order.trackingCode.trim() : '';
        const courier = order.courier || 'India Post Speed Post';
        const trackingUrl = order.trackingUrl || getCourierTrackingUrl(courier, trackingCode);

        // Build item details list
        const itemsHtml = (order.items && Array.isArray(order.items))
            ? order.items.map(item => {
                const meta = [];
                if (item.color) meta.push(`Shade: ${escapeHtml(item.color)}`);
                if (item.type) meta.push(`Stitch: ${escapeHtml(item.type)}`);
                if (item.size && item.size !== 'Standard') meta.push(`Fit: ${escapeHtml(item.size)}`);
                const metaStr = meta.length > 0 ? ` <span style="color:#666; font-size:0.85rem;">(${meta.join(', ')})</span>` : '';
                return `<li><strong>${escapeHtml(item.name || 'Crochet Piece')}</strong> (x${item.quantity || 1})${metaStr}</li>`;
            }).join('')
            : '<li>No item details</li>';

        // Status badge icon & label
        let statusIcon = 'fa-clock';
        let statusClass = 'status-pending';
        let statusLabel = 'PENDING';

        if (status === 'paid') {
            statusIcon = 'fa-circle-check';
            statusClass = 'status-delivered';
            statusLabel = 'PAID (CASHFREE)';
        } else if (status === 'pending_payment') {
            statusIcon = 'fa-clock';
            statusClass = 'status-pending';
            statusLabel = 'PAYMENT PENDING';
        } else if (status === 'booked') {
            statusIcon = 'fa-box';
            statusClass = 'status-booked';
            statusLabel = 'BOOKED';
        } else if (status === 'processing') {
            statusIcon = 'fa-spinner';
            statusClass = 'status-processing';
            statusLabel = 'PROCESSING';
        } else if (status === 'shipped') {
            statusIcon = 'fa-truck-fast';
            statusClass = 'status-shipped';
            statusLabel = 'SHIPPED';
        } else if (status === 'delivered') {
            statusIcon = 'fa-circle-check';
            statusClass = 'status-delivered';
            statusLabel = 'DELIVERED';
        } else if (status === 'cancelled') {
            statusIcon = 'fa-circle-xmark';
            statusClass = 'status-cancelled';
            statusLabel = 'CANCELLED';
        }

        // Tracking Box (Shown if trackingCode is assigned or order is marked booked)
        let trackingBoxHtml = '';
        if (hasTracking || isBooked) {
            trackingBoxHtml = `
                <div class="order-tracking-card" id="tracking-card-${id}">
                    <div class="order-tracking-card-header">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <i class="fa-solid fa-truck-fast" style="color: #0284c7; font-size: 1.1rem;"></i>
                            <strong style="color: #0369a1; font-size: 0.95rem;">Courier Booking & Tracking</strong>
                            ${isBooked ? '<span style="background:#e0f2fe; color:#0284c7; padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:700;">LIVE FOR CUSTOMER</span>' : ''}
                        </div>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            ${trackingUrl ? `
                                <a href="${escapeHtml(trackingUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm" style="padding: 5px 12px; font-size: 0.8rem; text-decoration: none; display: inline-flex; align-items: center; gap: 5px; background: #0284c7; border-color: #0284c7; color: #fff;">
                                    <i class="fa-solid fa-arrow-up-right-from-square"></i> Track Package
                                </a>
                            ` : ''}
                            <button type="button" class="btn-secondary-outline btn-sm" onclick="window.toggleTrackingForm('${id}')" style="padding: 5px 10px; font-size: 0.8rem;" title="Edit tracking info">
                                <i class="fa-solid fa-pen"></i> Edit Tracking
                            </button>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 15px; flex-wrap: wrap; margin-top: 6px; font-size: 0.9rem;">
                        <div>
                            <span style="color: var(--text-light); font-size: 0.82rem;">Courier Partner:</span>
                            <strong style="color: var(--text-dark); margin-left: 4px;">${escapeHtml(courier)}</strong>
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="color: var(--text-light); font-size: 0.82rem;">Tracking / AWB:</span>
                            ${hasTracking ? `
                                <span class="tracking-code-pill">${escapeHtml(trackingCode)}</span>
                                <button type="button" onclick="window.copyTrackingCode('${escapeHtml(trackingCode)}', this)" title="Copy tracking code" style="background: none; border: none; cursor: pointer; color: #0284c7; padding: 2px 5px; font-size: 0.85rem;">
                                    <i class="fa-regular fa-copy"></i>
                                </button>
                            ` : `
                                <span style="color: #d97706; font-size: 0.85rem; font-style: italic;">No tracking code entered yet</span>
                            `}
                        </div>
                    </div>
                </div>
            `;
        }

        // Inline Tracking Edit Form
        // If order is marked booked but has no tracking code, show form open by default
        const showFormByDefault = isBooked && !hasTracking;
        const trackingFormHtml = `
            <div class="order-tracking-form-box" id="order-form-${id}" style="display: ${showFormByDefault ? 'block' : 'none'};">
                <h5>
                    <i class="fa-solid fa-barcode" style="color: var(--primary-sage-dark);"></i>
                    Update Order Status & Tracking Code
                </h5>
                <p style="font-size: 0.85rem; color: var(--text-light); margin-bottom: 12px;">
                    When you book the courier parcel, enter the tracking/consignment number below. The customer will immediately see this code in their profile account and can track their shipment in real time.
                </p>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 12px;">
                    <div class="form-group" style="margin-bottom: 0;">
                        <label style="font-size: 0.82rem; font-weight: 600; margin-bottom: 4px;">Order Status</label>
                        <select class="form-control" id="order-status-sel-${id}" onchange="window.onOrderStatusChange('${id}', this.value)" style="margin-bottom: 0;">
                            <option value="paid" ${status === 'paid' ? 'selected' : ''}>💳 Paid (Cashfree)</option>
                            <option value="pending_payment" ${status === 'pending_payment' ? 'selected' : ''}>⏳ Payment Pending</option>
                            <option value="pending" ${status === 'pending' ? 'selected' : ''}>Pending (Unbooked)</option>
                            <option value="processing" ${status === 'processing' ? 'selected' : ''}>Processing / Crafting</option>
                            <option value="booked" ${status === 'booked' ? 'selected' : ''}>📦 Booked with Courier</option>
                            <option value="shipped" ${status === 'shipped' ? 'selected' : ''}>🚚 Shipped / In Transit</option>
                            <option value="delivered" ${status === 'delivered' ? 'selected' : ''}>✅ Delivered</option>
                            <option value="cancelled" ${status === 'cancelled' ? 'selected' : ''}>❌ Cancelled</option>
                        </select>
                    </div>

                    <div class="form-group" style="margin-bottom: 0;">
                        <label style="font-size: 0.82rem; font-weight: 600; margin-bottom: 4px;">Courier Partner</label>
                        <select class="form-control" id="order-courier-${id}" onchange="window.updateDefaultTrackUrl('${id}')" style="margin-bottom: 0;">
                            <option value="India Post Speed Post" ${courier.includes('India Post') || courier.includes('Speed Post') ? 'selected' : ''}>India Post Speed Post</option>
                            <option value="Delhivery" ${courier.toLowerCase().includes('delhivery') ? 'selected' : ''}>Delhivery</option>
                            <option value="DTDC" ${courier.toLowerCase().includes('dtdc') ? 'selected' : ''}>DTDC Express</option>
                            <option value="Blue Dart" ${courier.toLowerCase().includes('blue dart') ? 'selected' : ''}>Blue Dart</option>
                            <option value="The Professional Couriers" ${courier.toLowerCase().includes('professional') ? 'selected' : ''}>The Professional Couriers</option>
                            <option value="Other Courier" ${(!courier.includes('India Post') && !courier.includes('Delhivery') && !courier.includes('DTDC') && !courier.includes('Blue Dart') && !courier.includes('Professional')) ? 'selected' : ''}>Other Courier</option>
                        </select>
                    </div>

                    <div class="form-group" style="margin-bottom: 0;">
                        <label style="font-size: 0.82rem; font-weight: 600; margin-bottom: 4px;">Tracking / AWB Number <span style="color:#d32f2f;">*</span></label>
                        <input type="text" class="form-control" id="order-tracking-${id}" value="${escapeHtml(trackingCode)}" placeholder="e.g. EK987654321IN" oninput="window.updateDefaultTrackUrl('${id}')" style="margin-bottom: 0;">
                    </div>
                </div>

                <div class="form-group" style="margin-bottom: 15px;">
                    <label style="font-size: 0.82rem; font-weight: 600; margin-bottom: 4px;">Live Courier Tracking URL <span style="color:var(--text-light); font-weight:normal;">(Auto-filled or custom)</span></label>
                    <input type="url" class="form-control" id="order-trackurl-${id}" value="${escapeHtml(order.trackingUrl || '')}" placeholder="https://..." style="margin-bottom: 0;">
                </div>

                <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                    <button type="button" class="btn btn-sm" id="btn-save-track-${id}" onclick="window.saveOrderTracking('${id}')">
                        <i class="fa-solid fa-check"></i> Save Tracking & Status
                    </button>
                    <button type="button" class="btn-secondary-outline btn-sm" onclick="window.toggleTrackingForm('${id}', false)">
                        Cancel
                    </button>
                    <span id="save-track-msg-${id}" style="font-size: 0.85rem; font-weight: 500;"></span>
                </div>
            </div>
        `;

        const card = `
            <div class="order-card" id="order-card-${id}">
                <div class="order-header">
                    <div>
                        <span style="font-size: 1.1rem; color: var(--text-dark);">Order #${escapeHtml(id.slice(0, 8)).toUpperCase()}</span>
                        <span style="color: var(--text-light); font-size: 0.85rem; font-weight: normal; margin-left: 8px;">
                            <i class="fa-regular fa-calendar"></i> ${dateStr}
                        </span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span class="order-status ${statusClass}">
                            <i class="fa-solid ${statusIcon}"></i> ${statusLabel}
                        </span>
                    </div>
                </div>

                <div style="margin-bottom: 12px; font-size: 0.95rem; line-height: 1.6;">
                    <strong>Customer:</strong> ${escapeHtml(order.customerDetails?.name || 'Guest')} (${escapeHtml(order.userEmail || 'No email')})<br>
                    <strong>Phone:</strong> ${order.customerDetails?.phone ? `<a href="tel:${escapeHtml(order.customerDetails.phone)}" style="color:var(--primary-sage-dark); font-weight:600;">${escapeHtml(order.customerDetails.phone)}</a>` : 'N/A'}<br>
                    <strong>Address:</strong> ${escapeHtml(order.customerDetails?.address || 'N/A')}${order.customerDetails?.city ? ', ' + escapeHtml(order.customerDetails.city) : ''}${order.customerDetails?.state ? ', ' + escapeHtml(order.customerDetails.state) : ''}${order.customerDetails?.zip ? ' - ' + escapeHtml(order.customerDetails.zip) : ''}<br>
                    <strong>Payment:</strong> <span style="background: #e8f5e9; color: #2e7d32; font-weight: 600; padding: 2px 7px; border-radius: 4px; font-size: 0.85rem;"><i class="fa-solid fa-shield-halved"></i> ${order.paymentMethod === 'cashfree' ? 'Cashfree Online' : (order.paymentMethod || 'Online')} (${escapeHtml(order.paymentStatus || order.status || 'PAID')})</span> ${order.paymentDetails?.cfPaymentId ? `<span style="font-size:0.8rem; color:#666; margin-left:4px;">ID: ${escapeHtml(order.paymentDetails.cfPaymentId)}</span>` : ''}
                </div>

                <div style="margin-bottom: 12px;">
                    <strong>Items Ordered:</strong>
                    <ul style="padding-left: 20px; font-size: 0.9rem; margin-top: 6px; line-height: 1.6;">
                        ${itemsHtml}
                    </ul>
                </div>

                ${trackingBoxHtml}
                ${trackingFormHtml}

                <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #eee; padding-top:14px; margin-top: 14px; flex-wrap:wrap; gap:12px;">
                    <div>
                        <strong style="font-size: 1.1rem; color: var(--text-dark);">
                            Total: ₹${order.totalAmount ? Number(order.totalAmount).toFixed(2) : '0.00'} ${order.deliveryCharge ? `<span style="font-size:0.82rem; color:#666; font-weight:normal;">(incl. ₹${Number(order.deliveryCharge).toFixed(0)} delivery)</span>` : ''}
                        </strong>
                    </div>

                    <div style="display:flex; gap:10px; align-items:center; flex-wrap: wrap;">
                        ${!isBooked && !hasTracking ? `
                            <button type="button" class="btn btn-sm" onclick="window.markOrderAsBooked('${id}')" style="background: #0284c7; border-color: #0284c7; color: #fff;" title="Book order with courier & add tracking code">
                                <i class="fa-solid fa-box"></i> Book Order & Add Tracking
                            </button>
                        ` : ''}

                        <button type="button" onclick="window.sendOrderWhatsApp('${id}')" style="background-color:#25D366; color:white; border:none; padding:7px 14px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:0.85rem; display:inline-flex; align-items:center; gap:6px;">
                            <i class="fa-brands fa-whatsapp" style="font-size: 1rem;"></i> WhatsApp
                        </button>

                        <button type="button" class="btn-secondary-outline btn-sm" onclick="window.toggleTrackingForm('${id}')" title="Change status or tracking">
                            <i class="fa-solid fa-sliders"></i> Status & Tracking
                        </button>
                    </div>
                </div>
            </div>
        `;

        list.innerHTML += card;
    });
}

// Quick action to mark an order as booked and add tracking code
window.markOrderAsBooked = (orderId) => {
    window.toggleTrackingForm(orderId, true);
    const statusSel = document.getElementById(`order-status-sel-${orderId}`);
    if (statusSel) {
        statusSel.value = 'booked';
    }
    const trackingInput = document.getElementById(`order-tracking-${orderId}`);
    if (trackingInput) {
        trackingInput.focus();
        trackingInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    window.updateDefaultTrackUrl(orderId);
};

window.toggleTrackingForm = (orderId, forceState) => {
    const formBox = document.getElementById(`order-form-${orderId}`);
    if (!formBox) return;

    if (forceState !== undefined) {
        formBox.style.display = forceState ? 'block' : 'none';
    } else {
        formBox.style.display = formBox.style.display === 'none' ? 'block' : 'none';
    }

    if (formBox.style.display === 'block') {
        const trackingInput = document.getElementById(`order-tracking-${orderId}`);
        if (trackingInput && !trackingInput.value) {
            trackingInput.focus();
        }
        window.updateDefaultTrackUrl(orderId);
    }
};

window.onOrderStatusChange = (orderId, newStatus) => {
    if (newStatus === 'booked') {
        const trackingInput = document.getElementById(`order-tracking-${orderId}`);
        if (trackingInput) {
            trackingInput.focus();
        }
    }
    window.updateDefaultTrackUrl(orderId);
};

window.updateDefaultTrackUrl = (orderId) => {
    const courierEl = document.getElementById(`order-courier-${orderId}`);
    const trackingEl = document.getElementById(`order-tracking-${orderId}`);
    const urlEl = document.getElementById(`order-trackurl-${orderId}`);
    if (!courierEl || !trackingEl || !urlEl) return;

    const courier = courierEl.value;
    const code = trackingEl.value.trim();

    // Only auto-generate if URL is empty or matches previous auto-generation patterns
    const currentUrl = urlEl.value.trim();
    const isAutoOrEmpty = !currentUrl ||
        currentUrl.includes('delhivery.com') ||
        currentUrl.includes('indiapost.gov.in') ||
        currentUrl.includes('track.dtdc.com') ||
        currentUrl.includes('bluedart.com') ||
        currentUrl.includes('17track.net');

    if (isAutoOrEmpty && code) {
        urlEl.value = getCourierTrackingUrl(courier, code);
    }
};

window.saveOrderTracking = async (orderId) => {
    const statusSel = document.getElementById(`order-status-sel-${orderId}`);
    const courierSel = document.getElementById(`order-courier-${orderId}`);
    const trackingInput = document.getElementById(`order-tracking-${orderId}`);
    const urlInput = document.getElementById(`order-trackurl-${orderId}`);
    const saveBtn = document.getElementById(`btn-save-track-${orderId}`);
    const msgEl = document.getElementById(`save-track-msg-${orderId}`);

    if (!statusSel || !courierSel || !trackingInput || !urlInput) return;

    const newStatus = statusSel.value;
    const courier = courierSel.value;
    const trackingCode = trackingInput.value.trim();
    let trackingUrl = urlInput.value.trim();

    // If order is marked as "booked", require the tracking code so the customer can track
    if (newStatus === 'booked' && !trackingCode) {
        alert("Please enter the courier tracking / consignment code for this booked order so the customer can track their parcel.");
        trackingInput.focus();
        return;
    }

    if (trackingCode && !trackingUrl) {
        trackingUrl = getCourierTrackingUrl(courier, trackingCode);
        urlInput.value = trackingUrl;
    }

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    }

    try {
        const orderRef = doc(db, "orders", orderId);
        const updateData = {
            status: newStatus,
            updatedAt: new Date()
        };

        if (trackingCode) {
            updateData.trackingCode = trackingCode;
            updateData.courier = courier;
            updateData.trackingUrl = trackingUrl;
        }

        if (newStatus === 'booked') {
            updateData.bookedAt = new Date();
        }

        await updateDoc(orderRef, updateData);

        // Update local cache
        if (adminOrdersData[orderId]) {
            adminOrdersData[orderId].status = newStatus;
            if (trackingCode) {
                adminOrdersData[orderId].trackingCode = trackingCode;
                adminOrdersData[orderId].courier = courier;
                adminOrdersData[orderId].trackingUrl = trackingUrl;
            }
            if (newStatus === 'booked') {
                adminOrdersData[orderId].bookedAt = updateData.bookedAt;
            }
        }

        showAdminToast(
            newStatus === 'booked'
                ? `Order #${orderId.slice(0, 8)} marked as Booked with tracking code ${trackingCode}!`
                : `Order #${orderId.slice(0, 8)} updated successfully!`
        );

        // Re-render orders to reflect badge and tracking box
        renderAdminOrders();

    } catch (err) {
        console.error("Error saving order tracking:", err);
        alert("Error saving tracking: " + err.message);
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Save Tracking & Status';
        }
    }
};

window.copyTrackingCode = (code, btn) => {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
        const original = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check" style="color: #2e7d32;"></i>';
        showAdminToast(`Copied tracking code: ${code}`);
        setTimeout(() => {
            btn.innerHTML = original;
        }, 2000);
    }).catch(err => {
        console.warn('Clipboard copy failed:', err);
    });
};

window.filterAdminOrders = (status) => {
    currentOrdersFilter = status;

    // Update active class on filter tab buttons
    document.querySelectorAll('.orders-filter-btn').forEach(btn => {
        if (btn.getAttribute('data-filter') === status) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    renderAdminOrders();
};

window.refreshAdminOrders = () => {
    loadOrders();
};

// Search listener
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('orders-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchOrdersQuery = e.target.value;
            renderAdminOrders();
        });
    }
});

window.sendOrderWhatsApp = (orderId) => {
    const order = adminOrdersData[orderId];
    if (!order) return;

    const customer = order.customerDetails || {};
    const customerName = customer.name || 'Customer';
    const isBooked = (order.status === 'booked' || order.status === 'shipped') && order.trackingCode;

    const itemsList = (order.items && Array.isArray(order.items) && order.items.length > 0)
        ? order.items.map(item => {
            const meta = [];
            if (item.color) meta.push(`Color: ${item.color}`);
            if (item.type) meta.push(`Type: ${item.type}`);
            if (item.size && item.size !== 'Standard') meta.push(`Size: ${item.size}`);
            const metaStr = meta.length > 0 ? ` [${meta.join(', ')}]` : '';
            return `- ${item.name}${metaStr} (Qty: ${item.quantity || 1})`;
        }).join('\n')
        : '- Handcrafted Crochet Piece';

    // Build shipping address section if details exist
    let addressSection = '';
    const addressParts = [
        customer.address,
        customer.city,
        customer.state,
        customer.zip ? `PIN: ${customer.zip}` : ''
    ].filter(Boolean);
    if (addressParts.length > 0) {
        addressSection = `\n\n*Shipping Address:*\n${addressParts.join(', ')}`;
    }

    let message = '';
    if (isBooked) {
        const trackingLink = order.trackingUrl || getCourierTrackingUrl(order.courier, order.trackingCode);
        message = `*Shipment Dispatch & Tracking - NEYTHU STUDIO* 🧶📦\n\n` +
            `Hello ${customerName}, exciting news! Your handcrafted crochet piece has been booked and dispatched with our courier partner.\n\n` +
            `*Order ID:* #${orderId.slice(0, 8)}\n` +
            `*Status:* Booked & Ready for Transit\n` +
            `*Courier Partner:* ${order.courier || 'India Post Speed Post'}\n` +
            `*Tracking / AWB Number:* ${order.trackingCode}\n` +
            (trackingLink ? `*Live Parcel Tracking Link:* ${trackingLink}\n\n` : '\n') +
            `*Items Dispatched:*\n${itemsList}` +
            `${addressSection}\n\n` +
            `You can also view this tracking code anytime in your Neythu Studio account profile under "My Orders".\n\n` +
            `With warmth,\n*NEYTHU STUDIO*`;
    } else {
        message = `*Order Confirmation - NEYTHU STUDIO* 🧶🌿\n\n` +
            `Hello ${customerName}, thank you for ordering handcrafted crochet with us!\n\n` +
            `*Order ID:* #${orderId.slice(0, 8)}\n\n` +
            `*Items:*\n${itemsList}\n\n` +
            `*Total Amount:* ₹${order.totalAmount ? Number(order.totalAmount).toFixed(2) : '0.00'}` +
            `${addressSection}\n\n` +
            `Your handcrafted piece has been received and our artisans are preparing it with care. We will update you on dispatch and tracking soon.\n\n` +
            `With warmth,\n*NEYTHU STUDIO*`;
    }

    // Clean phone number (strip +, spaces, hyphens; add 91 if 10-digit Indian number)
    let cleanPhone = (customer.phone || '').toString().replace(/\D/g, '');
    if (cleanPhone.length === 10) {
        cleanPhone = '91' + cleanPhone;
    }

    // Crucial: encodeURIComponent encodes '&', '#', emojis, spaces, etc., so URLs never cut off
    const encodedMessage = encodeURIComponent(message);
    const url = cleanPhone
        ? `https://wa.me/${cleanPhone}?text=${encodedMessage}`
        : `https://wa.me/?text=${encodedMessage}`;

    window.open(url, '_blank');
};


// --- Settings Management (Product Categories & Product Types) ---

async function loadCategories() {
    const listEl = document.getElementById('settings-category-list');
    if (!listEl) return;

    try {
        const q = query(collection(db, "categories"), orderBy("name", "asc"));
        const snapshot = await getDocs(q);

        currentCategories = [];
        snapshot.forEach(docSnap => {
            currentCategories.push({ id: docSnap.id, ...docSnap.data() });
        });

        localStorage.setItem('neythu_categories', JSON.stringify(currentCategories));
        renderCategories();
    } catch (err) {
        console.warn("Could not load categories from Firestore (using fallback):", err);
        const saved = localStorage.getItem('neythu_categories') || localStorage.getItem('jasmnl_categories');
        if (saved) {
            try {
                currentCategories = JSON.parse(saved);
            } catch (e) {
                currentCategories = [];
            }
        } else {
            currentCategories = [];
        }
        renderCategories();
    }
}

function renderCategories() {
    const listEl = document.getElementById('settings-category-list');
    const selectEl = document.getElementById('p-category');
    const countBadge = document.getElementById('cat-count');

    if (countBadge) countBadge.textContent = currentCategories.length;

    // Render in Settings tab
    if (listEl) {
        if (currentCategories.length === 0) {
            listEl.innerHTML = '<li class="settings-empty">No categories found. Add one above.</li>';
        } else {
            listEl.innerHTML = currentCategories.map(cat => `
                <li class="settings-item">
                    <span class="settings-item-text">
                        <i class="fa-solid fa-tag" style="margin-right:8px; color: var(--primary-sage-dark);"></i>${cat.name}
                    </span>
                    <button class="settings-delete-btn" onclick="window.deleteCategory('${cat.id}', '${cat.name.replace(/'/g, "\\'")}')">
                        <i class="fa-solid fa-trash-can"></i> Delete
                    </button>
                </li>
            `).join('');
        }
    }

    // Populate dropdown in Add Product Form
    if (selectEl) {
        const previousVal = selectEl.value;
        selectEl.innerHTML = '<option value="">-- Select Crochet Category --</option>' +
            currentCategories.map(cat => `<option value="${cat.name}">${cat.name}</option>`).join('');
        if (previousVal && currentCategories.some(c => c.name === previousVal)) {
            selectEl.value = previousVal;
        }
    }
}

async function loadProductTypes() {
    const listEl = document.getElementById('settings-type-list');
    if (!listEl) return;

    try {
        const q = query(collection(db, "productTypes"), orderBy("name", "asc"));
        const snapshot = await getDocs(q);

        currentProductTypes = [];
        snapshot.forEach(docSnap => {
            currentProductTypes.push({ id: docSnap.id, ...docSnap.data() });
        });

        localStorage.setItem('neythu_product_types', JSON.stringify(currentProductTypes));
        renderProductTypes();
    } catch (err) {
        console.warn("Could not load product types from Firestore (using fallback):", err);
        const saved = localStorage.getItem('neythu_product_types') || localStorage.getItem('jasmnl_product_types');
        if (saved) {
            try {
                currentProductTypes = JSON.parse(saved);
            } catch (e) {
                currentProductTypes = [];
            }
        } else {
            currentProductTypes = [];
        }
        renderProductTypes();
    }
}

function renderProductTypes() {
    const listEl = document.getElementById('settings-type-list');
    const selectEl = document.getElementById('p-type');
    const countBadge = document.getElementById('type-count');

    if (countBadge) countBadge.textContent = currentProductTypes.length;

    // Render in Settings tab
    if (listEl) {
        if (currentProductTypes.length === 0) {
            listEl.innerHTML = '<li class="settings-empty">No stitch / pattern types found. Add one above.</li>';
        } else {
            listEl.innerHTML = currentProductTypes.map(t => `
                <li class="settings-item">
                    <span class="settings-item-text">
                        <i class="fa-solid fa-layer-group" style="margin-right:8px; color: var(--accent-gold);"></i>${t.name}
                    </span>
                    <button class="settings-delete-btn" onclick="window.deleteProductType('${t.id}', '${t.name.replace(/'/g, "\\'")}')">
                        <i class="fa-solid fa-trash-can"></i> Delete
                    </button>
                </li>
            `).join('');
        }
    }

    // Populate dropdown in Add Product Form
    if (selectEl) {
        const previousVal = selectEl.value;
        selectEl.innerHTML = '<option value="">-- Select Stitch / Style --</option>' +
            currentProductTypes.map(t => `<option value="${t.name}">${t.name}</option>`).join('');
        if (previousVal && currentProductTypes.some(t => t.name === previousVal)) {
            selectEl.value = previousVal;
        }
    }
}

// Add Category Form
const addCatForm = document.getElementById('add-category-form');
if (addCatForm) {
    addCatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('new-category-name');
        const name = input.value.trim();
        if (!name) return;

        if (currentCategories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
            alert(`Category "${name}" already exists.`);
            return;
        }

        const submitBtn = addCatForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;

        try {
            await addDoc(collection(db, "categories"), {
                name,
                createdAt: new Date()
            });
            input.value = '';
            await loadCategories();
        } catch (error) {
            console.error("Error adding category:", error);
            alert("Could not save to Firestore (" + error.message + "). Saved locally.");
            // Local fallback
            currentCategories.push({ id: 'local_' + Date.now(), name });
            localStorage.setItem('neythu_categories', JSON.stringify(currentCategories));
            renderCategories();
            input.value = '';
        } finally {
            submitBtn.disabled = false;
        }
    });
}

// Delete Category
window.deleteCategory = async (id, name) => {
    if (!confirm(`Are you sure you want to delete category "${name}"?`)) return;

    try {
        if (!id.startsWith('local_')) {
            await deleteDoc(doc(db, "categories", id));
        }
        currentCategories = currentCategories.filter(c => c.id !== id);
        localStorage.setItem('neythu_categories', JSON.stringify(currentCategories));
        renderCategories();
    } catch (error) {
        console.error("Error deleting category:", error);
        currentCategories = currentCategories.filter(c => c.id !== id);
        localStorage.setItem('neythu_categories', JSON.stringify(currentCategories));
        renderCategories();
    }
};

// Clear All Categories
window.clearAllCategories = async () => {
    if (currentCategories.length === 0) {
        alert("No categories to delete.");
        return;
    }
    if (!confirm(`Are you sure you want to delete ALL ${currentCategories.length} categories? This cannot be undone.`)) return;

    try {
        const deletePromises = currentCategories.map(cat => {
            if (!cat.id.startsWith('local_')) {
                return deleteDoc(doc(db, "categories", cat.id));
            }
            return Promise.resolve();
        });
        await Promise.all(deletePromises);
        currentCategories = [];
        localStorage.setItem('neythu_categories', JSON.stringify([]));
        renderCategories();
    } catch (error) {
        console.error("Error clearing categories:", error);
        alert("Could not delete some categories: " + error.message);
        await loadCategories();
    }
};

// Add Product Type Form
const addTypeForm = document.getElementById('add-type-form');
if (addTypeForm) {
    addTypeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('new-type-name');
        const name = input.value.trim();
        if (!name) return;

        if (currentProductTypes.some(t => t.name.toLowerCase() === name.toLowerCase())) {
            alert(`Product Type "${name}" already exists.`);
            return;
        }

        const submitBtn = addTypeForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;

        try {
            await addDoc(collection(db, "productTypes"), {
                name,
                createdAt: new Date()
            });
            input.value = '';
            await loadProductTypes();
        } catch (error) {
            console.error("Error adding product type:", error);
            alert("Could not save to Firestore (" + error.message + "). Saved locally.");
            // Local fallback
            currentProductTypes.push({ id: 'local_' + Date.now(), name });
            localStorage.setItem('neythu_product_types', JSON.stringify(currentProductTypes));
            renderProductTypes();
            input.value = '';
        } finally {
            submitBtn.disabled = false;
        }
    });
}

// Delete Product Type
window.deleteProductType = async (id, name) => {
    if (!confirm(`Are you sure you want to delete product type "${name}"?`)) return;

    try {
        if (!id.startsWith('local_')) {
            await deleteDoc(doc(db, "productTypes", id));
        }
        currentProductTypes = currentProductTypes.filter(t => t.id !== id);
        localStorage.setItem('neythu_product_types', JSON.stringify(currentProductTypes));
        renderProductTypes();
    } catch (error) {
        console.error("Error deleting product type:", error);
        currentProductTypes = currentProductTypes.filter(t => t.id !== id);
        localStorage.setItem('neythu_product_types', JSON.stringify(currentProductTypes));
        renderProductTypes();
    }
};

// Clear All Product Types
window.clearAllProductTypes = async () => {
    if (currentProductTypes.length === 0) {
        alert("No stitch/pattern types to delete.");
        return;
    }
    if (!confirm(`Are you sure you want to delete ALL ${currentProductTypes.length} stitch/pattern types? This cannot be undone.`)) return;

    try {
        const deletePromises = currentProductTypes.map(t => {
            if (!t.id.startsWith('local_')) {
                return deleteDoc(doc(db, "productTypes", t.id));
            }
            return Promise.resolve();
        });
        await Promise.all(deletePromises);
        currentProductTypes = [];
        localStorage.setItem('neythu_product_types', JSON.stringify([]));
        renderProductTypes();
    } catch (error) {
        console.error("Error clearing product types:", error);
        alert("Could not delete some stitch types: " + error.message);
        await loadProductTypes();
    }
};


// --- Cloudinary Image Upload & Browser Compression ---

const CLOUDINARY_DEFAULT_CLOUD = 'gbthx3ec';
const CLOUDINARY_DEFAULT_PRESET = 'neythu_products';

function getCloudinaryConfig() {
    return {
        cloudName: localStorage.getItem('neythu_cloudinary_cloud_name') || CLOUDINARY_DEFAULT_CLOUD,
        preset: localStorage.getItem('neythu_cloudinary_preset') || CLOUDINARY_DEFAULT_PRESET
    };
}

// Compress high-res camera photos before upload using canvas
async function compressImage(file, maxDimension = 1600, quality = 0.82) {
    return new Promise((resolve) => {
        if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.type === 'image/gif') {
            resolve(file);
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > maxDimension || height > maxDimension) {
                    if (width > height) {
                        height = Math.round((height * maxDimension) / width);
                        width = maxDimension;
                    } else {
                        width = Math.round((width * maxDimension) / height);
                        height = maxDimension;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        if (blob && blob.size < file.size) {
                            resolve(blob);
                        } else {
                            resolve(file);
                        }
                    },
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = () => resolve(file);
            img.src = e.target.result;
        };
        reader.onerror = () => resolve(file);
        reader.readAsDataURL(file);
    });
}

// Upload file directly to Cloudinary using Unsigned Preset
async function uploadToCloudinary(file, statusCallback) {
    const { cloudName, preset } = getCloudinaryConfig();

    if (!cloudName) {
        throw new Error("Cloudinary Cloud Name is missing. Check Settings.");
    }
    if (!preset) {
        throw new Error("Cloudinary Upload Preset is missing. Check Settings.");
    }

    if (statusCallback) statusCallback('Compressing photo...', 'uploading');
    const compressed = await compressImage(file);

    if (statusCallback) statusCallback('Uploading to Cloudinary...', 'uploading');

    const formData = new FormData();
    formData.append('file', compressed, file.name || 'crochet_piece.jpg');
    formData.append('upload_preset', preset);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body: formData
    });

    const data = await response.json();
    if (!response.ok) {
        const errorMsg = data.error?.message || 'Upload failed';
        if (errorMsg.includes('preset') || errorMsg.includes('unsigned')) {
            throw new Error(`Cloudinary preset error: "${errorMsg}". Please ensure preset "${preset}" is created and set to "Unsigned" in your Cloudinary Dashboard.`);
        }
        throw new Error(errorMsg);
    }

    return data.secure_url;
}

// --- Multi-Image Gallery State & Handlers ---
let addProductPhotos = [];
let editProductPhotos = [];

function getPhotosArray(prefix) {
    return prefix === 'edit-p' ? editProductPhotos : addProductPhotos;
}

function setPhotosArray(prefix, arr) {
    if (prefix === 'edit-p') {
        editProductPhotos = arr;
    } else {
        addProductPhotos = arr;
    }
}

function renderPhotosGallery(prefix) {
    const photos = getPhotosArray(prefix);
    const gridEl = document.getElementById(`${prefix}-gallery-grid`);
    const dropzoneEl = document.getElementById(`${prefix}-dropzone`);
    const countBadge = document.getElementById(`${prefix}-photo-count`);
    const hiddenInput = document.getElementById(`${prefix}-image`);
    const clearAllBtn = document.getElementById(`${prefix}-clear-all-btn`);

    if (countBadge) {
        countBadge.textContent = `${photos.length} photo${photos.length === 1 ? '' : 's'}`;
    }

    if (hiddenInput) {
        hiddenInput.value = photos[0] || '';
    }

    if (clearAllBtn) {
        clearAllBtn.style.display = photos.length > 0 ? 'inline-flex' : 'none';
    }

    if (!gridEl) return;

    if (photos.length === 0) {
        gridEl.style.display = 'none';
        gridEl.innerHTML = '';
        if (dropzoneEl) dropzoneEl.style.display = 'block';
        return;
    }

    gridEl.style.display = 'grid';
    if (prefix === 'p' && dropzoneEl) {
        dropzoneEl.style.display = 'none';
    }

    const tilesHtml = photos.map((url, index) => {
        const isPrimary = index === 0;
        return `
            <div class="photo-tile ${isPrimary ? 'is-primary' : ''}">
                <img class="photo-tile-img" src="${url}" alt="Photo ${index + 1}" onerror="this.src='images/icons/icon-192x192.png'">
                ${isPrimary ? '<span class="photo-tile-primary-badge">Cover</span>' : ''}
                <div class="photo-tile-actions">
                    ${!isPrimary ? `<button type="button" class="photo-tile-btn" onclick="window.setPrimaryPhoto('${prefix}', ${index})" title="Make this the main cover image">Make Cover</button>` : '<span></span>'}
                    <button type="button" class="photo-tile-btn delete-btn" onclick="window.removePhotoAtIndex('${prefix}', ${index})" title="Delete photo">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    const addMoreTile = `
        <div class="add-more-tile" onclick="document.getElementById('${prefix}-image-file').click()" title="Add more photos">
            <i class="fa-solid fa-plus" style="font-size: 1.5rem; color: var(--primary-sage-dark);"></i>
            <span style="font-size: 0.75rem; font-weight: 600;">Add Photo</span>
        </div>
    `;

    gridEl.innerHTML = tilesHtml + addMoreTile;
}

window.setPrimaryPhoto = (prefix, index) => {
    const photos = getPhotosArray(prefix);
    if (index > 0 && index < photos.length) {
        const [moved] = photos.splice(index, 1);
        photos.unshift(moved);
        setPhotosArray(prefix, photos);
        renderPhotosGallery(prefix);
    }
};

window.removePhotoAtIndex = (prefix, index) => {
    const photos = getPhotosArray(prefix);
    if (index >= 0 && index < photos.length) {
        photos.splice(index, 1);
        setPhotosArray(prefix, photos);
        renderPhotosGallery(prefix);
    }
};

window.clearAllProductPhotos = (prefix) => {
    if (!confirm("Are you sure you want to remove all photos for this piece?")) return;
    setPhotosArray(prefix, []);
    const fileInput = document.getElementById(`${prefix}-image-file`);
    if (fileInput) fileInput.value = '';
    renderPhotosGallery(prefix);
};

window.addManualPhotoUrl = (prefix) => {
    const manualInput = document.getElementById(`${prefix}-manual-url`);
    if (!manualInput) return;
    const url = manualInput.value.trim();
    if (!url) {
        alert("Please enter a valid image URL.");
        return;
    }
    const photos = getPhotosArray(prefix);
    photos.push(url);
    setPhotosArray(prefix, photos);
    manualInput.value = '';
    renderPhotosGallery(prefix);
};

window.toggleManualUrl = (boxId) => {
    const el = document.getElementById(boxId);
    if (!el) return;
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

// Wire up image dropzone and file picker for multi-photo selection
function setupImageUploader(prefix) {
    const fileInput = document.getElementById(`${prefix}-image-file`);
    const dropzone = document.getElementById(`${prefix}-dropzone`);

    if (!fileInput) return;

    if (dropzone) {
        ['dragenter', 'dragover'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.add('drag-over');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove('drag-over');
            });
        });

        dropzone.addEventListener('drop', (e) => {
            const files = e.dataTransfer?.files;
            if (files && files.length > 0) {
                handleFilesSelection(files);
            }
        });
    }

    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFilesSelection(e.target.files);
        }
    });

    async function handleFilesSelection(fileList) {
        const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
        if (files.length === 0) {
            alert('Please select valid image files (JPG, PNG, WEBP).');
            return;
        }

        const gridEl = document.getElementById(`${prefix}-gallery-grid`);
        const dropzoneEl = document.getElementById(`${prefix}-dropzone`);
        if (gridEl) gridEl.style.display = 'grid';
        if (prefix === 'p' && dropzoneEl) dropzoneEl.style.display = 'none';

        for (const file of files) {
            const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
            const tempTile = document.createElement('div');
            tempTile.className = 'photo-tile';
            tempTile.id = tempId;
            tempTile.innerHTML = `
                <img class="photo-tile-img" src="${URL.createObjectURL(file)}" alt="Uploading">
                <div class="photo-tile-uploading-overlay">
                    <i class="fa-solid fa-spinner fa-spin" style="font-size: 1.2rem;"></i>
                    <span>Uploading...</span>
                </div>
            `;

            if (gridEl.lastElementChild && gridEl.lastElementChild.classList.contains('add-more-tile')) {
                gridEl.insertBefore(tempTile, gridEl.lastElementChild);
            } else {
                gridEl.appendChild(tempTile);
            }

            try {
                const uploadedUrl = await uploadToCloudinary(file);
                const photos = getPhotosArray(prefix);
                photos.push(uploadedUrl);
                setPhotosArray(prefix, photos);
            } catch (err) {
                console.error('Upload failed for file:', file.name, err);
                alert(`Upload failed for "${file.name}": ${err.message}`);
            } finally {
                const tile = document.getElementById(tempId);
                if (tile) tile.remove();
                renderPhotosGallery(prefix);
            }
        }

        if (fileInput) fileInput.value = '';
    }
}

// Settings Tab: Save & Test Cloudinary Settings
window.saveCloudinarySettings = () => {
    const cloudNameInput = document.getElementById('cld-cloud-name');
    const presetInput = document.getElementById('cld-upload-preset');

    const cloudName = cloudNameInput ? cloudNameInput.value.trim() : CLOUDINARY_DEFAULT_CLOUD;
    const preset = presetInput ? presetInput.value.trim() : CLOUDINARY_DEFAULT_PRESET;

    if (!cloudName) {
        alert("Please enter a Cloud Name.");
        return;
    }
    if (!preset) {
        alert("Please enter an Upload Preset.");
        return;
    }

    localStorage.setItem('neythu_cloudinary_cloud_name', cloudName);
    localStorage.setItem('neythu_cloudinary_preset', preset);

    alert(`Cloudinary settings saved!\nCloud Name: ${cloudName}\nUpload Preset: ${preset}`);
};

window.testCloudinaryConnection = async () => {
    const resultEl = document.getElementById('cld-test-result');
    const testBtn = document.getElementById('cld-test-btn');
    if (!resultEl) return;

    const cloudName = (document.getElementById('cld-cloud-name')?.value || '').trim() || CLOUDINARY_DEFAULT_CLOUD;
    const preset = (document.getElementById('cld-upload-preset')?.value || '').trim() || CLOUDINARY_DEFAULT_PRESET;

    if (testBtn) testBtn.disabled = true;
    resultEl.innerHTML = '<span style="color:#e65100;"><i class="fa-solid fa-spinner fa-spin"></i> Testing connection to Cloudinary...</span>';

    try {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#97A46D';
        ctx.fillRect(0, 0, 1, 1);
        const dataUrl = canvas.toDataURL('image/png');

        const formData = new FormData();
        formData.append('file', dataUrl);
        formData.append('upload_preset', preset);

        const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
            method: 'POST',
            body: formData
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error?.message || 'Connection test failed');
        }

        resultEl.innerHTML = '<span style="color:#2e7d32;"><i class="fa-solid fa-circle-check"></i> Connection successful! Preset is active.</span>';
        localStorage.setItem('neythu_cloudinary_cloud_name', cloudName);
        localStorage.setItem('neythu_cloudinary_preset', preset);
    } catch (err) {
        console.error('Test error:', err);
        resultEl.innerHTML = `<span style="color:#c62828;"><i class="fa-solid fa-circle-xmark"></i> ${err.message}</span>`;
    } finally {
        if (testBtn) testBtn.disabled = false;
    }
};

function initCloudinarySettings() {
    const cloudNameInput = document.getElementById('cld-cloud-name');
    const presetInput = document.getElementById('cld-upload-preset');

    if (cloudNameInput) {
        cloudNameInput.value = localStorage.getItem('neythu_cloudinary_cloud_name') || CLOUDINARY_DEFAULT_CLOUD;
    }
    if (presetInput) {
        presetInput.value = localStorage.getItem('neythu_cloudinary_preset') || CLOUDINARY_DEFAULT_PRESET;
    }
}

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
    loadAdminProducts();
    loadOrders();
    loadCategories();
    loadProductTypes();
    initCloudinarySettings();
    setupImageUploader('p');
    setupImageUploader('edit-p');
});
