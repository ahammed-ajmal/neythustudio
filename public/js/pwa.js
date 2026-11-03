/**
 * NEYTHU STUDIO - Progressive Web App (PWA) Manager
 * Handles Service Worker registration, mobile view detection,
 * install prompts, and responsive download popup.
 */

(function () {
    'use strict';

    let deferredPrompt = null;
    const DISMISS_KEY = 'neythu_pwa_dismissed_until';
    const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours snooze if user dismisses

    // Bypass admin dashboard
    function isAdminPage() {
        return window.location.pathname.toLowerCase().includes('admin');
    }

    // Detect if already installed / running in standalone mode
    function isAppInstalled() {
        return (
            window.matchMedia('(display-mode: standalone)').matches ||
            window.navigator.standalone === true ||
            document.referrer.includes('android-app://')
        );
    }

    // Detect mobile view (width <= 768px or touch mobile device)
    function isMobileView() {
        const isSmallScreen = window.innerWidth <= 768;
        const isMobileDevice = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        return isSmallScreen || (isMobileDevice && hasTouch);
    }

    // Detect iOS
    function isIOS() {
        return (
            /iPad|iPhone|iPod/.test(navigator.userAgent) &&
            !window.MSStream
        );
    }

    // Check if user dismissed popup recently
    function isDismissed() {
        try {
            const until = localStorage.getItem(DISMISS_KEY);
            if (!until) return false;
            return Date.now() < parseInt(until, 10);
        } catch (e) {
            return false;
        }
    }

    function recordDismissal() {
        try {
            localStorage.setItem(DISMISS_KEY, (Date.now() + DISMISS_DURATION_MS).toString());
        } catch (e) {}
    }

    // Register Service Worker
    function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker
                    .register('./service-worker.js', { scope: './' })
                    .then((reg) => {
                        console.log('[PWA] Service Worker registered with scope:', reg.scope);
                    })
                    .catch((err) => {
                        console.warn('[PWA] Service Worker registration failed:', err);
                    });
            });
        }
    }

    // Build the Mobile Download Popup DOM
    function createInstallPopup() {
        if (isAdminPage()) return;
        if (document.getElementById('pwa-download-popup')) return;

        const popup = document.createElement('div');
        popup.id = 'pwa-download-popup';
        popup.className = 'pwa-download-popup';
        popup.setAttribute('role', 'dialog');
        popup.setAttribute('aria-label', 'Download Neythu Studio App');

        popup.innerHTML = `
            <div class="pwa-popup-card">
                <button type="button" class="pwa-popup-close" id="pwa-popup-close-btn" aria-label="Close download popup">&times;</button>
                
                <!-- Main Install View (Clean & Simple) -->
                <div class="pwa-view-main" id="pwa-view-main">
                    <div class="pwa-popup-content">
                        <img src="images/icons/icon-192x192.png" alt="Neythu Studio" class="pwa-popup-icon">
                        <div class="pwa-popup-text">
                            <h4 class="pwa-popup-title">NEYTHU STUDIO</h4>
                            <p class="pwa-popup-desc">Install app for faster shopping</p>
                        </div>
                    </div>

                    <button type="button" class="pwa-install-btn" id="pwa-install-trigger-btn">
                        <i class="fa-solid fa-download"></i>
                        <span>Download App</span>
                    </button>
                </div>

                <!-- Step-by-Step Instructions View (for iOS or manual browser install) -->
                <div class="pwa-view-guide" id="pwa-view-guide">
                    <div class="pwa-guide-header">
                        <h4 id="pwa-guide-title">How to Install Neythu Studio</h4>
                        <button type="button" class="pwa-guide-back-btn" id="pwa-guide-back-btn" aria-label="Back">&times;</button>
                    </div>
                    <div class="pwa-guide-steps" id="pwa-guide-steps">
                        <!-- Populated dynamically based on platform -->
                    </div>
                    <button type="button" class="pwa-guide-gotit-btn" id="pwa-guide-gotit-btn">Got it</button>
                </div>
            </div>
        `;

        document.body.appendChild(popup);

        // Bind events
        const closeBtn = document.getElementById('pwa-popup-close-btn');
        const dismissBtn = document.getElementById('pwa-dismiss-btn');
        const installBtn = document.getElementById('pwa-install-trigger-btn');
        const guideBackBtn = document.getElementById('pwa-guide-back-btn');
        const guideGotItBtn = document.getElementById('pwa-guide-gotit-btn');

        function dismissPopup() {
            recordDismissal();
            hidePopup();
        }

        if (closeBtn) closeBtn.addEventListener('click', dismissPopup);
        if (dismissBtn) dismissBtn.addEventListener('click', dismissPopup);

        if (installBtn) {
            installBtn.addEventListener('click', handleInstallClick);
        }

        if (guideBackBtn) {
            guideBackBtn.addEventListener('click', showMainView);
        }

        if (guideGotItBtn) {
            guideGotItBtn.addEventListener('click', () => {
                showMainView();
                dismissPopup();
            });
        }
    }

    function showMainView() {
        const mainView = document.getElementById('pwa-view-main');
        const guideView = document.getElementById('pwa-view-guide');
        if (mainView) mainView.style.display = 'block';
        if (guideView) guideView.style.display = 'none';
    }

    function showGuideView(isApple) {
        const mainView = document.getElementById('pwa-view-main');
        const guideView = document.getElementById('pwa-view-guide');
        const guideTitle = document.getElementById('pwa-guide-title');
        const guideSteps = document.getElementById('pwa-guide-steps');

        if (!guideView || !guideSteps) return;

        if (isApple) {
            if (guideTitle) guideTitle.textContent = 'Install on iPhone / iPad';
            guideSteps.innerHTML = `
                <div class="pwa-guide-step">
                    <span class="pwa-step-num">1</span>
                    <div class="pwa-step-desc">
                        Tap the <strong>Share</strong> button <i class="fa-solid fa-arrow-up-from-bracket pwa-ios-icon"></i> in Safari's bottom toolbar.
                    </div>
                </div>
                <div class="pwa-guide-step">
                    <span class="pwa-step-num">2</span>
                    <div class="pwa-step-desc">
                        Scroll down and tap <strong>"Add to Home Screen"</strong> <i class="fa-regular fa-square-plus pwa-ios-icon"></i>.
                    </div>
                </div>
                <div class="pwa-guide-step">
                    <span class="pwa-step-num">3</span>
                    <div class="pwa-step-desc">
                        Tap <strong>Add</strong> in the top right. Enjoy seamless artisanal shopping!
                    </div>
                </div>
            `;
        } else {
            if (guideTitle) guideTitle.textContent = 'Install Neythu Studio';
            guideSteps.innerHTML = `
                <div class="pwa-guide-step">
                    <span class="pwa-step-num">1</span>
                    <div class="pwa-step-desc">
                        Tap the browser menu <i class="fa-solid fa-ellipsis-vertical" style="color: var(--primary-sage-dark);"></i> in the top right.
                    </div>
                </div>
                <div class="pwa-guide-step">
                    <span class="pwa-step-num">2</span>
                    <div class="pwa-step-desc">
                        Select <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.
                    </div>
                </div>
                <div class="pwa-guide-step">
                    <span class="pwa-step-num">3</span>
                    <div class="pwa-step-desc">
                        Confirm <strong>Install</strong> to add the Neythu Studio app to your home screen!
                    </div>
                </div>
            `;
        }

        if (mainView) mainView.style.display = 'none';
        guideView.style.display = 'block';
    }

    function showPopup() {
        if (isAdminPage()) return;
        if (isAppInstalled()) return;
        const popup = document.getElementById('pwa-download-popup');
        if (!popup) return;

        // Ensure visible on mobile view
        if (isMobileView() && !isDismissed()) {
            setTimeout(() => {
                popup.classList.add('visible');
            }, 600);
        }
    }

    function hidePopup() {
        const popup = document.getElementById('pwa-download-popup');
        if (popup) {
            popup.classList.remove('visible');
            // reset to main view after closing
            setTimeout(showMainView, 400);
        }
    }

    // Trigger install flow
    async function handleInstallClick() {
        // 1. Android / Chromium with deferredPrompt available
        if (deferredPrompt) {
            try {
                deferredPrompt.prompt();
                const choiceResult = await deferredPrompt.userChoice;
                if (choiceResult && choiceResult.outcome === 'accepted') {
                    console.log('[PWA] User accepted the installation');
                    showInstallSuccessToast();
                    hidePopup();
                } else {
                    console.log('[PWA] User dismissed the installation prompt');
                }
            } catch (err) {
                console.warn('[PWA] Error displaying prompt:', err);
                showGuideView(false);
            }
            deferredPrompt = null;
            return;
        }

        // 2. iOS Safari
        if (isIOS()) {
            showGuideView(true);
            return;
        }

        // 3. Fallback for browsers when beforeinstallprompt is not provided
        showGuideView(false);
    }

    function showInstallSuccessToast() {
        const toast = document.createElement('div');
        toast.className = 'pwa-toast';
        toast.innerHTML = '<i class="fa-solid fa-circle-check"></i> Neythu Studio installed successfully!';
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.add('visible'), 50);
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 400);
        }, 3500);
    }

    // Add "Download App" entry to the mobile navigation drawer if present
    function setupMobileMenuInstallButton() {
        if (isAdminPage()) return;
        const navMenu = document.getElementById('nav-menu');
        if (!navMenu || document.getElementById('mobile-nav-install-item')) return;

        const li = document.createElement('li');
        li.id = 'mobile-nav-install-item';
        li.className = 'mobile-nav-install-wrapper';
        li.innerHTML = `
            <button type="button" class="mobile-nav-install-btn" id="mobile-nav-install-btn">
                <i class="fa-solid fa-cloud-arrow-down"></i>
                <span>Download App</span>
            </button>
        `;

        navMenu.appendChild(li);

        const btn = document.getElementById('mobile-nav-install-btn');
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                // Close the mobile drawer first
                const navClose = document.getElementById('nav-close-btn');
                if (navClose) navClose.click();

                // Open install prompt or guide
                handleInstallClick();
                // Also ensure the popup becomes visible if showing guide
                const popup = document.getElementById('pwa-download-popup');
                if (popup) popup.classList.add('visible');
            });
        }
    }

    // Expose global helper for any other button to invoke
    window.triggerPWAInstall = handleInstallClick;

    // Listen for beforeinstallprompt
    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent default mini-infobar on mobile Chrome
        e.preventDefault();
        deferredPrompt = e;
        console.log('[PWA] beforeinstallprompt event captured');

        // Check if we should show the mobile popup
        if (isMobileView() && !isAppInstalled() && !isDismissed()) {
            showPopup();
        }
    });

    // Listen for appinstalled
    window.addEventListener('appinstalled', () => {
        console.log('[PWA] App successfully installed!');
        deferredPrompt = null;
        hidePopup();
        const menuBtn = document.getElementById('mobile-nav-install-item');
        if (menuBtn) menuBtn.style.display = 'none';
    });

    // Handle viewport changes (e.g. mobile emulator resize or rotation)
    window.addEventListener('resize', () => {
        if (!isMobileView()) {
            hidePopup();
        } else if (!isAppInstalled() && !isDismissed()) {
            showPopup();
        }
    });

    // Initialization
    function init() {
        registerServiceWorker();

        const onReady = () => {
            createInstallPopup();
            setupMobileMenuInstallButton();
            if (isMobileView() && !isAppInstalled() && !isDismissed()) {
                showPopup();
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', onReady);
        } else {
            onReady();
        }
    }

    init();
})();
