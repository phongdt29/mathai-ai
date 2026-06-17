# MathAI deploy artifact

- Backend build: `backend/dist/index.js`.
- Frontend build: `frontend/start-frontend.js` starts the Next.js standalone server on every supported platform.
- `npm run start:frontend` runs the cross-platform Node wrapper instead of shell conditionals.
- Default ports configured by the app are frontend `3444` and backend `3001`.

Run from this directory after configuring environment variables:

```cmd
npm run start:backend
npm run start:frontend
# Equivalent frontend command:
node frontend/start-frontend.js
```
