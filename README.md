# JASMLN - Women's Fashion E-Commerce

A modern, elegant e-commerce website built with Vanilla JavaScript and Firebase.

## Setup Instructions

1. **Firebase Configuration**:
   - Open `js/firebase.js`.
   - Replace the `firebaseConfig` object with your own Firebase project keys.
   - Enable **Authentication** (Email/Password) in Firebase Console.
   - Enable **Firestore Database** in Firebase Console.
   
2. **Running the App**:
   - You **must** use a local web server because this project uses ES Modules (`type="module"`).
   - Recommended: Use "Live Server" extension in VS Code.
   - Or run `npx serve .` in the `jasmln` directory.

## Features

- **Storefront**: Landing page, Shop grid, Product filtering.
- **Shopping Cart**: LocalStorage based cart with persistence.
- **Checkout**: Order placement saving to Firestore.
- **Authentication**: User Signup/Login.
- **Admin Panel**: Add products and view customer orders.

## Folder Structure

- `css/style.css`: All styles.
- `js/`: Application logic split by feature.
- `*.html`: Views for each page.
