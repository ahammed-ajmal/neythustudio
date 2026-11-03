import { auth } from './firebase.js';
import {
    verifyPasswordResetCode,
    confirmPasswordReset,
    applyActionCode
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// DOM Elements
const stateLoading = document.getElementById('state-loading');
const stateForm = document.getElementById('state-form');
const stateSuccess = document.getElementById('state-success');
const stateError = document.getElementById('state-error');
const errorDesc = document.getElementById('error-desc');
const displayUserEmail = document.getElementById('display-user-email');
const resetForm = document.getElementById('reset-password-form');
const newPasswordInput = document.getElementById('new-password');
const confirmPasswordInput = document.getElementById('confirm-password');
const submitBtn = document.getElementById('submit-reset-btn');
const matchFeedback = document.getElementById('match-feedback');
const resetAlert = document.getElementById('reset-alert');

// Segment elements for strength meter
const seg1 = document.getElementById('seg-1');
const seg2 = document.getElementById('seg-2');
const seg3 = document.getElementById('seg-3');
const seg4 = document.getElementById('seg-4');
const strengthText = document.getElementById('strength-text');

let activeOobCode = null;

function showState(panel) {
    [stateLoading, stateForm, stateSuccess, stateError].forEach(p => {
        if (p) p.classList.remove('active');
    });
    if (panel) panel.classList.add('active');
}

function showAlert(message, type = 'error') {
    if (resetAlert) {
        resetAlert.className = `auth-alert ${type}`;
        resetAlert.innerHTML = `
            <i class="${type === 'success' ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-exclamation'}"></i>
            <div>${message}</div>
        `;
        resetAlert.style.display = 'flex';
    }
}

function clearAlert() {
    if (resetAlert) {
        resetAlert.style.display = 'none';
        resetAlert.innerHTML = '';
    }
}

// 1. Password Visibility Toggles
document.querySelectorAll('.toggle-password-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const input = document.getElementById(targetId);
        const icon = btn.querySelector('i');

        if (input) {
            if (input.type === 'password') {
                input.type = 'text';
                icon.className = 'fa-regular fa-eye-slash';
            } else {
                input.type = 'password';
                icon.className = 'fa-regular fa-eye';
            }
        }
    });
});

// 2. Password Strength Evaluation
function evaluatePasswordStrength(val) {
    if (!val || val.length === 0) {
        setStrengthLevel(0, 'Too short', '#cbd5e1');
        return 0;
    }

    if (val.length < 6) {
        setStrengthLevel(1, 'Too short (min 6)', '#ef4444');
        return 1;
    }

    let score = 1;
    if (val.length >= 8) score++;
    if (/[A-Z]/.test(val) && /[a-z]/.test(val)) score++;
    if (/\d/.test(val) || /[^A-Za-z0-9]/.test(val)) score++;

    if (score === 2) {
        setStrengthLevel(2, 'Fair', '#f97316');
    } else if (score === 3) {
        setStrengthLevel(3, 'Good', '#84cc16');
    } else if (score >= 4) {
        setStrengthLevel(4, 'Strong', '#15803d');
    }

    return score;
}

function setStrengthLevel(level, text, color) {
    const segments = [seg1, seg2, seg3, seg4];
    segments.forEach((seg, i) => {
        if (seg) {
            seg.style.background = i < level ? color : '#e2e8f0';
        }
    });
    if (strengthText) {
        strengthText.innerText = text;
        strengthText.style.color = color;
    }
}

// 3. Confirm Password Match Checker
function checkPasswordMatch() {
    const p1 = newPasswordInput ? newPasswordInput.value : '';
    const p2 = confirmPasswordInput ? confirmPasswordInput.value : '';

    if (!p2) {
        if (matchFeedback) matchFeedback.className = 'match-feedback';
        return;
    }

    if (p1 === p2) {
        if (matchFeedback) {
            matchFeedback.className = 'match-feedback valid';
            matchFeedback.innerHTML = '<i class="fa-solid fa-check"></i> Passwords match';
        }
    } else {
        if (matchFeedback) {
            matchFeedback.className = 'match-feedback invalid';
            matchFeedback.innerHTML = '<i class="fa-solid fa-xmark"></i> Passwords do not match';
        }
    }
}

if (newPasswordInput) {
    newPasswordInput.addEventListener('input', () => {
        clearAlert();
        evaluatePasswordStrength(newPasswordInput.value);
        checkPasswordMatch();
    });
}

if (confirmPasswordInput) {
    confirmPasswordInput.addEventListener('input', () => {
        clearAlert();
        checkPasswordMatch();
    });
}

// 4. Initialize & Verify oobCode on Page Load
async function initResetFlow() {
    const urlParams = new URLSearchParams(window.location.search);
    const oobCode = urlParams.get('oobCode');
    const mode = urlParams.get('mode');

    if (!oobCode) {
        if (errorDesc) {
            errorDesc.innerText = "No security token was found in your link. Please visit the login page and click 'Forgot Password?' to generate a fresh link.";
        }
        showState(stateError);
        return;
    }

    activeOobCode = oobCode;

    // Handle Email Verification if mode is verifyEmail
    if (mode === 'verifyEmail') {
        try {
            await applyActionCode(auth, oobCode);
            const successTitle = stateSuccess.querySelector('.reset-title');
            const successDesc = stateSuccess.querySelector('.reset-desc');
            if (successTitle) successTitle.innerText = "Email Verified!";
            if (successDesc) successDesc.innerText = "Your email address has been verified successfully. You can now access all Neythu Studio features.";
            showState(stateSuccess);
        } catch (error) {
            console.error("Email verification error:", error);
            if (errorDesc) errorDesc.innerText = "This email verification link is invalid or has already been used.";
            showState(stateError);
        }
        return;
    }

    // Default / resetPassword mode
    try {
        // Verify code with Firebase Auth
        const email = await verifyPasswordResetCode(auth, oobCode);
        if (displayUserEmail) {
            displayUserEmail.innerText = email || 'Your Account';
        }
        showState(stateForm);
        if (newPasswordInput) newPasswordInput.focus();
    } catch (error) {
        console.error("Code verification error:", error);
        let message = "This password reset link is invalid or has already expired. For your security, reset links can only be used once.";

        if (error.code === 'auth/expired-action-code') {
            message = "This password reset link has expired. Please request a new link from the login page.";
        } else if (error.code === 'auth/invalid-action-code') {
            message = "This password reset link is invalid or has already been used. Please request a fresh link.";
        }

        if (errorDesc) errorDesc.innerText = message;
        showState(stateError);
    }
}

// 5. Handle Form Submit
if (resetForm) {
    resetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAlert();

        const newPass = newPasswordInput ? newPasswordInput.value : '';
        const confirmPass = confirmPasswordInput ? confirmPasswordInput.value : '';

        if (!newPass || newPass.length < 6) {
            showAlert("Password must be at least 6 characters long.");
            if (newPasswordInput) newPasswordInput.focus();
            return;
        }

        if (newPass !== confirmPass) {
            showAlert("Passwords do not match. Please check and try again.");
            if (confirmPasswordInput) confirmPasswordInput.focus();
            return;
        }

        if (!activeOobCode) {
            showAlert("Invalid session token. Please reload this page.");
            return;
        }

        const origBtnText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving Password...';

        try {
            await confirmPasswordReset(auth, activeOobCode, newPass);
            showState(stateSuccess);
        } catch (error) {
            console.error("Password reset confirmation error:", error);
            let userMsg = "Failed to reset password. Please try again.";

            if (error.code === 'auth/weak-password') {
                userMsg = "The password chosen is too weak. Please use at least 6 characters with a combination of letters and numbers.";
            } else if (error.code === 'auth/expired-action-code') {
                userMsg = "This reset link has expired. Please request a new one.";
            } else if (error.code === 'auth/invalid-action-code') {
                userMsg = "This reset link has already been used or is invalid.";
            }

            showAlert(userMsg);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = origBtnText;
        }
    });
}

// Run on page load
initResetFlow();
