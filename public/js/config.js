// Neythu Studio Configuration

export const CONFIG = {
    // Backend API Base URL
    // When running locally, it points to local server (http://localhost:5000)
    // When deployed to production, update this with your Render service URL (e.g., https://neythu-backend.onrender.com)
    BACKEND_URL: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:5000'
        : 'https://neythu-studio-backend.onrender.com', // Replace with your actual Render URL after deploying

    // Cashfree Environment: "sandbox" (Test Mode) or "production" (Live Mode)
    CASHFREE_MODE: 'sandbox'
};
