import { auth } from './firebase.js';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile,
    GoogleAuthProvider,
    signInWithPopup,
    RecaptchaVerifier,
    signInWithPhoneNumber,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Providers
const googleProvider = new GoogleAuthProvider();
let confirmationResult = null;
let recaptchaVerifier = null;

// Admin Configuration
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

// Form Elements
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const phoneForm = document.getElementById('phone-form');
const errorDiv = document.getElementById('auth-error');
const otpSection = document.getElementById('otp-section');
const phoneSection = document.getElementById('phone-section');
const forgotPasswordLink = document.getElementById('forgot-password-link');

// Escape helper for safe HTML output
function escapeHTML(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Map Firebase error codes into friendly, meaningful user messages
function getFriendlyAuthErrorMessage(error, context = '') {
    if (!error) return "An unexpected error occurred. Please try again.";

    if (typeof error === 'string') {
        const cleaned = error
            .replace(/^Firebase:\s*(Error\s*)?(\([^)]*\))?\s*:?/i, '')
            .replace(/\(auth\/[a-z0-9-]+\)\.?/i, '')
            .trim();
        return cleaned || error;
    }

    // Extract Firebase error code
    let code = error.code || '';
    if (!code && error.message) {
        const match = error.message.match(/auth\/[a-z0-9-]+/i);
        if (match) {
            code = match[0].toLowerCase();
        }
    } else if (code) {
        code = code.toLowerCase();
    }

    const errorMap = {
        // Sign-in errors
        'auth/invalid-credential': 'The email or password you entered is incorrect. Please verify your details and try again.',
        'auth/wrong-password': 'Incorrect password. Please try again or use "Forgot Password?" to reset it.',
        'auth/user-not-found': 'No account found with this email address. Please check your spelling or sign up.',
        'auth/invalid-email': 'Please enter a valid email address (e.g. name@example.com).',
        'auth/user-disabled': 'This account has been disabled. Please contact customer support for assistance.',
        'auth/too-many-requests': 'Too many unsuccessful attempts. Access has been temporarily locked to protect your account. Please wait a few minutes or reset your password.',

        // Sign-up errors
        'auth/email-already-in-use': 'An account already exists with this email address. Please log in instead.',
        'auth/weak-password': 'Password should be at least 6 characters long. Please choose a stronger password.',
        'auth/operation-not-allowed': 'This sign-in method is currently disabled. Please contact support.',

        // Google / Social Auth errors
        'auth/popup-closed-by-user': 'Sign-in window was closed before completing. Please try again.',
        'auth/cancelled-popup-request': 'Sign-in request was cancelled. Please try again.',
        'auth/popup-blocked': 'Sign-in popup was blocked by your browser. Please allow popups for this site.',
        'auth/account-exists-with-different-credential': 'An account already exists with this email under a different sign-in method. Please sign in using that method.',

        // Phone Auth errors
        'auth/invalid-phone-number': 'Please enter a valid phone number including country code (e.g. +91 9876543210).',
        'auth/missing-phone-number': 'Please enter your phone number.',
        'auth/invalid-verification-code': 'Incorrect verification code. Please check the 6-digit OTP sent to your phone.',
        'auth/code-expired': 'The verification code has expired. Please request a new OTP.',
        'auth/quota-exceeded': 'Daily SMS limit reached. Please try again later or sign in using email.',
        'auth/captcha-check-failed': 'reCAPTCHA verification failed. Please try again or reload the page.',

        // Network & System errors
        'auth/network-request-failed': 'Network connection issue. Please check your internet connection and try again.',
        'auth/requires-recent-login': 'For security, please log in again to continue.',
        'auth/internal-error': 'A temporary server error occurred. Please try again in a few moments.'
    };

    if (code && errorMap[code]) {
        return errorMap[code];
    }

    // Clean up Firebase error message if unmapped code
    if (error.message) {
        const cleaned = error.message
            .replace(/^Firebase:\s*(Error\s*)?(\([^)]*\))?\s*:?/i, '')
            .replace(/\(auth\/[a-z0-9-]+\)\.?/i, '')
            .trim();
        if (cleaned && cleaned.length > 3) {
            return cleaned;
        }
    }

    return context ? `${context} failed. Please verify your details and try again.` : 'An error occurred. Please try again.';
}

// Display Alert Helper (supports error and success)
function showAlert(message, type = 'error') {
    if (errorDiv) {
        const isSuccess = type === 'success';
        const iconClass = isSuccess ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-exclamation';
        errorDiv.className = `auth-alert ${type}`;
        errorDiv.innerHTML = `
            <i class="${iconClass}"></i>
            <div class="auth-alert-content">${escapeHTML(message)}</div>
        `;
        errorDiv.style.display = 'flex';
        errorDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
        alert(message);
    }
}

function showError(message) {
    showAlert(message, 'error');
}

function showSuccess(message) {
    showAlert(message, 'success');
}

function showAuthError(error, context = '') {
    const friendlyMessage = getFriendlyAuthErrorMessage(error, context);
    showAlert(friendlyMessage, 'error');
}

function clearAlert() {
    if (errorDiv) {
        errorDiv.style.display = 'none';
        errorDiv.innerHTML = '';
        errorDiv.className = 'auth-alert';
    }
}

// Clear alert when user starts typing
document.querySelectorAll('.auth-forms input').forEach((input) => {
    input.addEventListener('input', () => {
        if (errorDiv && errorDiv.classList.contains('error')) {
            clearAlert();
        }
    });
});

// Initialize reCAPTCHA ONCE
function initRecaptcha() {
    const container = document.getElementById('recaptcha-container');
    if (!container) return;

    if (!recaptchaVerifier) {
        container.innerHTML = '';

        recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
            'size': 'invisible',
            'callback': (response) => {
                // reCAPTCHA solved
            }
        });
    }
}

// Signup Logic
if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAlert();
        const name = document.getElementById('signup-name').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const password = document.getElementById('signup-password').value;
        const submitBtn = signupForm.querySelector('button[type="submit"]');
        const originalText = submitBtn ? submitBtn.innerHTML : '';

        if (password.length < 6) {
            showError("Password should be at least 6 characters long. Please choose a stronger password.");
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating Account...';
        }

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await updateProfile(userCredential.user, { displayName: name });
            const params = new URLSearchParams(window.location.search);
            const redirect = params.get('redirect') || 'index.html';
            window.location.href = redirect;
        } catch (error) {
            console.error("Signup error:", error);
            showAuthError(error, "Sign up");
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        }
    });
}

// Login Logic
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAlert();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const originalText = submitBtn ? submitBtn.innerHTML : '';

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Logging in...';
        }

        try {
            const user = (await signInWithEmailAndPassword(auth, email, password)).user;
            const params = new URLSearchParams(window.location.search);
            const redirect = params.get('redirect') || 'index.html';

            const admin = await checkAdminStatus(user);
            if (admin) {
                window.location.href = 'admin.html';
            } else {
                window.location.href = redirect;
            }
        } catch (error) {
            console.error("Login error:", error);
            showAuthError(error, "Login");
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        }
    });
}

// Forgot Password Logic
if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', async (e) => {
        e.preventDefault();
        clearAlert();
        const emailInput = document.getElementById('login-email');
        const email = emailInput ? emailInput.value.trim() : '';

        if (!email) {
            showError("Please enter your email address in the field above and click 'Forgot Password?' to receive a reset link.");
            if (emailInput) emailInput.focus();
            return;
        }

        try {
            const actionCodeSettings = {
                url: `${window.location.origin}/reset-password.html`,
                handleCodeInApp: false
            };
            try {
                await sendPasswordResetEmail(auth, email, actionCodeSettings);
            } catch (actionCodeErr) {
                // If actionCodeSettings domain is not whitelisted, fallback to default
                await sendPasswordResetEmail(auth, email);
            }
            showSuccess(`Password reset email sent to ${email}! Please check your inbox and spam folder.`);
        } catch (error) {
            console.error("Password reset error:", error);
            showAuthError(error, "Password reset");
        }
    });
}

// Google Login Logic
const googleBtn = document.getElementById('google-btn');
if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
        clearAlert();
        const originalText = googleBtn.innerHTML;
        googleBtn.disabled = true;
        googleBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Connecting to Google...';

        try {
            const result = await signInWithPopup(auth, googleProvider);
            const params = new URLSearchParams(window.location.search);
            const redirect = params.get('redirect') || 'index.html';

            const admin = await checkAdminStatus(result.user);
            if (admin) {
                window.location.href = 'admin.html';
            } else {
                window.location.href = redirect;
            }
        } catch (error) {
            console.error("Google sign-in error:", error);
            showAuthError(error, "Google sign-in");
        } finally {
            googleBtn.disabled = false;
            googleBtn.innerHTML = originalText;
        }
    });
}

// Phone Auth Logic
if (phoneForm) {
    phoneForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAlert();
        let phoneNumber = document.getElementById('phone-number').value.trim();
        const otpCode = document.getElementById('otp-code').value.trim();
        const submitBtn = phoneForm.querySelector('button[type="submit"]');
        const originalText = submitBtn ? submitBtn.innerHTML : '';

        // Ensure phone number starts with '+' (E.164 format)
        if (phoneNumber && !phoneNumber.startsWith('+')) {
            phoneNumber = '+' + phoneNumber;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = !confirmationResult
                ? '<i class="fa-solid fa-spinner fa-spin"></i> Sending OTP...'
                : '<i class="fa-solid fa-spinner fa-spin"></i> Verifying...';
        }

        try {
            if (!confirmationResult) {
                // Step 1: Send OTP
                initRecaptcha();
                confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
                phoneSection.style.display = 'none';
                otpSection.style.display = 'block';
                showSuccess("Verification code sent! Please enter the 6-digit OTP below.");
            } else {
                // Step 2: Verify OTP
                const result = await confirmationResult.confirm(otpCode);
                const params = new URLSearchParams(window.location.search);
                const redirect = params.get('redirect') || 'index.html';

                const admin = await checkAdminStatus(result.user);
                if (admin) {
                    window.location.href = 'admin.html';
                } else {
                    window.location.href = redirect;
                }
            }
        } catch (error) {
            console.error("Phone auth error:", error);
            showAuthError(error, "Phone verification");

            // If error happened during Step 1 (Send OTP), reset verifier
            if (!confirmationResult && recaptchaVerifier) {
                try {
                    recaptchaVerifier.clear();
                } catch (clearError) {
                    console.error("Error clearing verifier:", clearError);
                }
                recaptchaVerifier = null;
            }
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        }
    });
}

// Global Auth State Listener to update UI (Nav links)
onAuthStateChanged(auth, async (user) => {
    const authLink = document.getElementById('auth-link');
    if (!authLink) return;

    if (user) {
        const admin = await checkAdminStatus(user);
        const nameDisplay = user.displayName || user.email || user.phoneNumber;

        authLink.href = admin ? "admin.html" : "profile.html";
        authLink.innerHTML = `<i class="fa-solid fa-user" title="Profile (${nameDisplay}${admin ? ' - Admin' : ''})"></i>`;
    } else {
        authLink.innerHTML = `<i class="fa-regular fa-user"></i>`;
        authLink.href = "login.html";
    }
});
