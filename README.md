# Mizanora Web — Vercel par KOI env variable nahi
Sab secrets sirf **GitHub** mein. Vercel sirf static page + chhota webhook relay host karta hai.
1. Firebase: Authentication → Google ON + Authorized domain (`mizanoraagent.vercel.app`). Firestore banayein, `firestore.rules` paste karein (apni admin email daal kar) → Publish.
2. Bot repo (private, Mizanora-v2 code, branch `main`) → Settings → Secrets → Actions: **FIREBASE_SERVICE_ACCOUNT** = service-account JSON (Firebase → Project settings → Service accounts → Generate key). Bas yehi ek secret.
3. Is web app ko Vercel par import karein (Framework: Other). Env variables: **koi nahi**.
4. App kholen, admin email se login → Admin → Settings mein GitHub token (Contents+Actions+Workflows RW) aur `owner/repo` save karein.
5. User: keys bharein → Deploy request → Admin Approve → workflow ban kar chal padta hai.
