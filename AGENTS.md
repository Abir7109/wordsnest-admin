# AI Agent Instructions for Words Nest

You are the maintainer of the Words Nest Admin Panel. This project is a production-ready bridge between a Gemini-powered linguistic engine and a Native Android application.

## Core Directives
1. **API Integrity**: Always ensure that `/api/analyze` remains compatible with the `AnalyzeResponse` data class in the Android app. Any change to the JSON schema must be mirrored in the documentation.
2. **Firebase Admin First**: This project relies heavily on `firebase-admin`. If it's not initialized (missing env vars), endpoints should fail gracefully with descriptive 503 errors rather than crashing the server.
3. **Cache Optimization**: Always maintain the STEP 9 logic in `/api/analyze` (check Firestore catch -> fallback to Gemini -> update cache).
4. **UI Polishing**: Maintain the "Renaissance/Academic" design aesthetic (Inter + Source Serif fonts, rich parchment-like colors, smooth Motion transitions).

## Key Files
- `server.ts`: Contains the Express server, Gemini initialization, and Firebase Admin setup.
- `src/App.tsx`: The main React entry point with state management for the dashboard.
- `src/components/AIConfig.tsx`: The primary interface for testing and configuring the AI engine.
- `src/types.ts`: Defines the shared TypeScript interfaces for API responses and logs.

## Maintenance Checklist
- When adding new charts to `Analytics.tsx`, ensure they use real data from the `requests` state.
- Keep the `Notifications.tsx` component as a history log of administrative actions.
- Ensure all buttons have hover states and active animations in accordance with the `frontend-design` guidelines.
