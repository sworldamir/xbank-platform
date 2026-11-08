XBank public homepage / admin session routing fix

This patch fixes a stale administrator session redirecting every visit to / back to /admin.
When a staff session opens a public route, the session is logged out and the public welcome page is shown.
The shared Sign out action now returns to / instead of /login.

Install:
1. Stop `npm run dev` with Ctrl+C.
2. Extract this ZIP into C:\Users\Hossein\Desktop\xbank-platform and overwrite src\App.tsx.
3. Run `npm run build`.
4. Run `npm run dev`.
5. Open http://localhost:5173/ .
6. To access the admin panel, open /admin/login and sign in with the admin account.
7. To access Argon, sign out and go to /login, then sign in with username Argon and the password entered during `npm run seed:site`.

This patch does not create Argon. The user is created only after `npm run seed:site` completes successfully.
