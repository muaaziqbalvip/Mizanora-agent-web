# Mizanora Web v3
Auto-start model: user keys bharta hai → "Agent start karein" → Firestore status=approved (rules sirf tab allow karte hain jab `pub/settings.autoApprove` true ho) → bot repo ka workflow "3 - Mizanora Agents (auto)" har 30 min mein approved users ko matrix job bana kar chalata hai.
Setup: Firebase Auth (Google) + Firestore, `firestore.rules` (admin email badlein) Publish, Vercel par import (env variables: koi nahi). Poori guide: /guide
Admin: Admin tab → Auto-start controls (auto-approve, pause all, max agents) aur Suspend/Unsuspend.
