# Words Nest Project Documentation

## 1. Project Overview
Words Nest is a dual-project ecosystem consisting of a Native Android Application (Kotlin) and an Administrative Backend (Express + Vite). The backend serves as the "brain," providing linguistic analysis via Gemini AI, managing word caching, and handling administrative tasks like push notifications.

## 2. Technical Stack
- **Android App**: Kotlin, Retrofit (API communication), Firebase SDK (Auth, Firestore, FCM).
- **Admin Panel (Backend)**: 
  - **Runtime**: Node.js (Express)
  - **Frontend**: React (Vite, Tailwind CSS, Motion)
  - **AI**: Google Gemini API (@google/genai)
  - **Database/Auth**: Firebase Admin SDK (controlled by this panel)

## 3. Architecture & Connectivity
The Android app communicates with the Admin Panel via two primary endpoints:
- `POST /api/analyze`: Receives a word and returns a structured linguistic report.
- `POST /api/notify`: Used by the admin panel to trigger FCM push notifications to specific users or tokens.

### Word Cache Optimization
To optimize API usage and speed, the server checks the Firestore `wordCache` collection before calling Gemini. Cached results are considered valid for 7 days.

## 4. Environment Variables
To fully operationalize the backend, the following `.env` variables are required:
- `GEMINI_API_KEY`: API key from Google AI Studio.
- `FIREBASE_PROJECT_ID`: The project ID from your Firebase console.
- `FIREBASE_CLIENT_EMAIL`: Service account email.
- `FIREBASE_PRIVATE_KEY`: Service account private key (with `\n` mapping).

## 5. Security Model
- **Client-Side (Android)**: Uses Firebase Anonymous Authentication for initial sessions.
- **Server-Side (Admin Panel)**: Uses Firebase Admin SDK for high-privilege operations (writing to cache, sending FCM).
- **Firestore Rules**: Restricted to user-owned documents for PII, while `wordCache` is globally readable by authenticated users.

## 6. Development Workflow
1. Use the **AI Configuration** tab in the Admin Panel to fine-tune the system instructions for Gemini.
2. Use the **Playground Console** to trace real AI responses before they are served to the app.
3. Monitor **Platform Analytics** for success/error rates and request volume.
