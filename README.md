# Mizanora Web (Vercel)
1. Firebase: Authentication → Google ON, Authorized domains mein `mizanoraagent.vercel.app` add. Firestore create karein, Rules: `allow read, write: if false;` (sab kuch server se hota hai).
2. GitHub: private repo `owner/mizanora-bots` mein Mizanora-v2 ka code push (branch `main`). Fine-grained token: Contents RW + Actions RW us repo par.
3. Vercel env: FIREBASE_SERVICE_ACCOUNT (service-account JSON), ENC_KEY (`openssl rand -hex 32`), GITHUB_TOKEN, GITHUB_REPO, ADMIN_EMAILS, APP_URL (https://mizanoraagent.vercel.app).
4. Deploy: `vercel --prod`.
