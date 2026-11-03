import { CONFIG } from './config.js';
import { clearCart } from './cart.js';

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('order_id');

    const loadingState = document.getElementById('loading-state');
    const confirmedState = document.getElementById('confirmed-state');
    const failedState = document.getElementById('failed-state');

    if (!orderId) {
        if (loadingState) loadingState.style.display = 'none';
        if (failedState) {
            failedState.style.display = 'block';
            document.getElementById('failed-message').innerText = "No order ID specified.";
        }
        return;
    }

    try {
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/verify-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ orderId })
        });

        const data = await response.json();

        if (loadingState) loadingState.style.display = 'none';

        if (data.isPaid || data.orderStatus === 'PAID') {
            // Payment verified!
            clearCart();

            if (confirmedState) confirmedState.style.display = 'block';

            const displayOrderId = document.getElementById('display-order-id');
            const displayTotal = document.getElementById('display-order-total');
            const displayCustomer = document.getElementById('display-customer-name');
            const displayItems = document.getElementById('display-items-list');

            if (displayOrderId) displayOrderId.innerText = orderId;

            const order = data.orderData || {};
            if (displayTotal && order.totalAmount) {
                displayTotal.innerText = `₹${parseFloat(order.totalAmount).toFixed(2)}`;
            }

            if (displayCustomer && order.customerDetails) {
                displayCustomer.innerText = order.customerDetails.name || 'Valued Patron';
            }

            if (displayItems && Array.isArray(order.items)) {
                displayItems.innerHTML = order.items.map(item => `
                    <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px dashed #eee;">
                        <span><strong>${item.name || 'Crochet Piece'}</strong> &times; ${item.quantity || 1}</span>
                        <span>₹${((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
                    </div>
                `).join('');
            }
        } else {
            // Payment failed or still pending
            if (failedState) {
                failedState.style.display = 'block';
                const msg = document.getElementById('failed-message');
                if (msg) {
                    msg.innerText = `Order status is currently ${data.orderStatus || 'Pending'}. If you completed payment, it may take a few moments to synchronize.`;
                }
            }
        }
    } catch (err) {
        console.error('Error verifying payment on success page:', err);
        // Fallback: If network issue but orderId exists
        if (loadingState) loadingState.style.display = 'none';
        if (confirmedState) {
            confirmedState.style.display = 'block';
            const displayOrderId = document.getElementById('display-order-id');
            if (displayOrderId) displayOrderId.innerText = orderId;
            clearCart();
        }
    }
});
