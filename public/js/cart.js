// Cart Logic using localStorage

const CART_KEY = 'neythu_cart';
const LEGACY_CART_KEY = 'jasmnl_cart';

// --- Helper Functions ---
function getCart() {
    const cart = localStorage.getItem(CART_KEY) || localStorage.getItem(LEGACY_CART_KEY);
    return cart ? JSON.parse(cart) : [];
}

function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartIcon();
}

function updateCartIcon() {
    const cart = getCart();
    const count = cart.reduce((total, item) => total + (item.quantity || 1), 0);
    const badges = document.querySelectorAll('.cart-count, #cart-count');
    badges.forEach(badge => {
        badge.textContent = count;
        badge.classList.remove('cart-bump');
        void badge.offsetWidth; // trigger DOM reflow for re-animation
        badge.classList.add('cart-bump');
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// --- Cart Operations ---

export function addToCart(product, quantity = 1, options = {}) {
    let cart = getCart();
    const color = options.color !== undefined ? options.color : (product.color || '');
    const type = options.type !== undefined ? options.type : (product.type || '');
    const size = options.size !== undefined ? options.size : (product.size || '');
    const price = typeof product.price === 'number' ? product.price : parseFloat(product.price || 0);

    const existingIndex = cart.findIndex(item =>
        item.id === product.id &&
        (item.color || '') === (color || '') &&
        (item.type || '') === (type || '') &&
        (item.size || '') === (size || '')
    );

    if (existingIndex > -1) {
        cart[existingIndex].quantity = (cart[existingIndex].quantity || 1) + quantity;
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: price,
            image: product.image,
            color: color,
            type: type,
            size: size,
            quantity: quantity
        });
    }

    saveCart(cart);

    // Popdown concise added item notification (auto dismisses within 2.8s)
    showAddedToCartPopup({
        id: product.id,
        name: product.name,
        price: price,
        image: product.image,
        color: color,
        type: type,
        size: size
    }, quantity);
}

export function removeFromCart(index) {
    let cart = getCart();
    cart.splice(index, 1);
    saveCart(cart);
    return cart;
}

export function updateItemQuantity(index, newQty) {
    let cart = getCart();
    if (newQty < 1) return;
    cart[index].quantity = newQty;
    saveCart(cart);
    return cart;
}

export function clearCart() {
    localStorage.removeItem(CART_KEY);
    updateCartIcon();
}

export function getCartTotal() {
    const cart = getCart();
    return cart.reduce((total, item) => total + (item.price * (item.quantity || 1)), 0);
}

// --- Popdown Item Added Toast (Dismisses within seconds) ---

let toastTimeout = null;

export function showAddedToCartPopup(product, quantity = 1) {
    let toast = document.getElementById('cart-toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'cart-toast-notification';
        toast.className = 'cart-toast-notification';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        document.body.appendChild(toast);
    }

    const imageSrc = product.image || 'images/crochet-pattern.svg';
    const formattedPrice = '₹' + Math.round(product.price).toLocaleString('en-IN');
    const qtyText = quantity > 1 ? ` (${quantity})` : '';

    toast.innerHTML = `
        <div class="cart-toast-icon">
            <i class="fa-solid fa-check"></i>
        </div>
        <img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(product.name || 'Crochet piece')}" class="cart-toast-thumb" onerror="this.src='images/crochet-pattern.svg'">
        <div class="cart-toast-info">
            <div class="cart-toast-status">Added to Bag</div>
            <div class="cart-toast-details" title="${escapeHtml(product.name || 'Crochet piece')}">
                ${escapeHtml(product.name || 'Crochet Creation')}${qtyText}
            </div>
            <span class="cart-toast-price">${formattedPrice}</span>
        </div>
        <a href="cart.html" class="cart-toast-btn">
            <span>View Bag</span>
            <i class="fa-solid fa-arrow-right" style="font-size:0.72rem;"></i>
        </a>
        <button type="button" class="cart-toast-close" id="cart-toast-close" aria-label="Close notification">&times;</button>
    `;

    const closeBtn = document.getElementById('cart-toast-close');
    if (closeBtn) closeBtn.addEventListener('click', closeCartPopup);

    // Clear previous timeout if user clicks quickly
    if (toastTimeout) clearTimeout(toastTimeout);

    // Pop down smoothly from top
    requestAnimationFrame(() => {
        toast.classList.add('active');
    });

    // Auto-dismiss within 2.8 seconds
    toastTimeout = setTimeout(() => {
        closeCartPopup();
    }, 2800);
}

export function closeCartPopup() {
    const toast = document.getElementById('cart-toast-notification');
    if (toast) {
        toast.classList.remove('active');
        if (toastTimeout) clearTimeout(toastTimeout);
    }
}

// Make accessible to window
if (typeof window !== 'undefined') {
    window.showAddedToCartPopup = showAddedToCartPopup;
    window.closeCartPopup = closeCartPopup;
}

// --- Event Listeners and Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    updateCartIcon();

    // Add to Cart from Product Detail Page
    const addToCartBtn = document.getElementById('add-to-cart-btn');
    if (addToCartBtn) {
        addToCartBtn.addEventListener('click', () => {
            const nameEl = document.getElementById('prod-name');
            const name = nameEl ? nameEl.innerText.trim() : 'Product';

            const priceEl = document.querySelector('#prod-price .current-price') || document.getElementById('prod-price');
            const priceMatch = priceEl ? priceEl.innerText.match(/([0-9]+(?:\.[0-9]+)?)/) : null;
            const price = priceMatch ? parseFloat(priceMatch[1]) : 0;

            const imageEl = document.getElementById('main-image');
            const image = imageEl ? imageEl.src : '';

            const urlParams = new URLSearchParams(window.location.search);
            const id = urlParams.get('id') || 'unknown';

            const qtyInput = document.getElementById('qty-value');
            const qty = qtyInput ? Math.max(1, parseInt(qtyInput.value) || 1) : 1;

            const colorEl = document.getElementById('prod-color');
            const color = colorEl && colorEl.innerText !== '-' ? colorEl.innerText.trim() : '';

            const typeEl = document.getElementById('prod-type-badge') || document.getElementById('prod-type');
            const type = typeEl && typeEl.innerText !== '-' ? typeEl.innerText.trim() : '';

            const sizeEl = document.getElementById('prod-size') || document.querySelector('.size-option.selected') || document.querySelector('input[name="prod-size"]:checked');
            const size = sizeEl ? (sizeEl.value || sizeEl.innerText || '').trim() : '';

            addToCart({
                id,
                name,
                price,
                image,
                color,
                type,
                size
            }, qty);
        });
    }
});
