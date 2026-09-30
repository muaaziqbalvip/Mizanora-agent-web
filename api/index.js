import admin from 'firebase-admin';
import crypto from 'node:crypto';
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore(), K = Buffer.from(process.env.ENC_KEY, 'hex'); // ENC_KEY = 64 hex chars
const enc = (t) => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', K, iv), d = Buffer.concat([c.update(t), c.final()]); return Buffer.concat([iv, c.getAuthTag(), d]).toString('base64'); };
const dec = (b) => { const r = Buffer.from(b, 'base64'), d = crypto.createDecipheriv('aes-256-gcm', K, r.subarray(0, 12)); d.setAuthTag(r.subarray(12, 28)); return Buffer.concat([d.update(r.subarray(28)), d.final()]).toString(); };
const gh = (p, o = {}) => fetch('https://api.github.com' + p, { ...o, headers: { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'mizanora', ...o.headers } });
const REPO = process.env.GITHUB_REPO; // "owner/private-repo" that contains the Mizanora bot code
const admins = (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase());
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const rnd = () => crypto.randomBytes(24).toString('hex');
const CH = { whatsapp: 'WHATSAPP_AGENT_API_KEY', telegram: 'TELEGRAM_BOT_TOKEN' };

const workflow = (uid, ch, token) => `name: agent-${uid.slice(0, 8)}-${ch}
on: { workflow_dispatch: {}, schedule: [{ cron: '*/30 * * * *' }] }
concurrency: { group: agent-${uid}-${ch}, cancel-in-progress: false }
jobs:
  run:
    runs-on: ubuntu-latest
    timeout-minutes: 355
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg poppler-utils && pip install --user --break-system-packages -q edge-tts && echo "$HOME/.local/bin" >> $GITHUB_PATH
      - run: npm install --no-audit --no-fund
      - name: Load this user's keys from the dashboard
        run: |
          curl -sf -X POST "${process.env.APP_URL}/api/runner" -H 'content-type: application/json' -d '{"uid":"${uid}","token":"${token}"}' | jq -r 'to_entries[]|"\\(.key)=\\(.value)"' >> $GITHUB_ENV
          echo "MEMORY_DIR=memory_store/${uid}-${ch}" >> $GITHUB_ENV
          echo "CHANNEL=${ch}" >> $GITHUB_ENV
      - run: MAX_RUNTIME_MIN=340 node src/index.js
`;

export default async function handler(req, res) {
  const path = new URL(req.url, 'http://x').pathname.replace(/^\/api\//, '');
  const q = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const out = (c, o) => res.status(c).json(o);
  try {
    if (path === 'runner') { // called by the user's GitHub workflow
      const s = await db.doc(`users/${b.uid}`).get();
      if (!s.exists || s.data().status !== 'approved' || sha(String(b.token)) !== s.data().runnerHash) return out(403, { error: 'no' });
      return out(200, { ...JSON.parse(dec(s.data().cfg)), NEWS_ENABLED: s.data().news ? 'true' : 'false' });
    }
    if (path === 'search') { // public API for user websites: /api/search?q=...&key=SITE_KEY
      const u = (await db.collection('users').where('siteKeyHash', '==', sha(String(q.key || ''))).limit(1).get()).docs[0];
      if (!u || !q.q) return out(401, { error: 'bad key or missing q' });
      const gk = (JSON.parse(dec(u.data().cfg)).GEMINI_API_KEYS || '').split(',')[0];
      if (!gk) return out(400, { error: 'owner has no Gemini key' });
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': gk }, body: JSON.stringify({ contents: [{ parts: [{ text: 'Search the web and answer concisely with facts: ' + q.q }] }], tools: [{ google_search: {} }] }) });
      const j = await r.json(), c = j.candidates?.[0];
      res.setHeader('Access-Control-Allow-Origin', '*');
      return out(200, { answer: (c?.content?.parts || []).map((p) => p.text || '').join(''), sources: (c?.groundingMetadata?.groundingChunks || []).map((x) => x.web?.uri).filter(Boolean) });
    }
    const tok = (req.headers.authorization || '').replace('Bearer ', '');
    const me = await admin.auth().verifyIdToken(tok);
    const isAdmin = admins.includes((me.email || '').toLowerCase());
    const ref = db.doc(`users/${me.uid}`);
    if (path === 'me') {
      const s = await ref.get(), d = s.data() || {};
      if (!s.exists) await ref.set({ email: me.email, name: me.name || '', status: 'new', created: Date.now() });
      const cfg = d.cfg ? JSON.parse(dec(d.cfg)) : {};
      return out(200, { email: me.email, status: d.status || 'new', isAdmin, channels: d.channels || [], news: !!d.news, siteKey: d.siteKey || '', have: Object.keys(cfg).filter((k) => cfg[k]) });
    }
    if (path === 'save') {
      const s = await ref.get(); const old = s.data()?.cfg ? JSON.parse(dec(s.data().cfg)) : {};
      const cfg = { ...old }; for (const [k, v] of Object.entries(b.keys || {})) if (/^[A-Z_]+$/.test(k) && String(v).trim()) cfg[k] = String(v).trim();
      const siteKey = s.data()?.siteKey || 'mz_' + rnd();
      await ref.set({ cfg: enc(JSON.stringify(cfg)), channels: (b.channels || []).filter((c) => CH[c]), news: !!b.news, siteKey, siteKeyHash: sha(siteKey) }, { merge: true });
      return out(200, { ok: true });
    }
    if (path === 'request') { await ref.set({ status: 'pending', requested: Date.now() }, { merge: true }); return out(200, { ok: true }); }
    if (path === 'logs') {
      const uid = isAdmin && q.uid ? q.uid : me.uid, p = `agent-${uid.slice(0, 8)}`;
      const r = await (await gh(`/repos/${REPO}/actions/runs?per_page=30`)).json();
      const runs = (r.workflow_runs || []).filter((x) => x.name.startsWith(p)).slice(0, 10).map((x) => ({ id: x.id, name: x.name, status: x.status, conclusion: x.conclusion, at: x.created_at, url: x.html_url }));
      return out(200, { runs });
    }
    if (!isAdmin) return out(403, { error: 'admin only' });
    if (path === 'admin/list') { const s = await db.collection('users').get(); return out(200, s.docs.map((d) => ({ uid: d.id, email: d.data().email, status: d.data().status, channels: d.data().channels || [] }))); }
    if (path === 'admin/approve') { // creates ONE workflow per channel for this user, then starts it
      const uid = b.uid, r = db.doc(`users/${uid}`), d = (await r.get()).data(), token = rnd(), made = [];
      for (const ch of d.channels?.length ? d.channels : ['whatsapp']) {
        const f = `.github/workflows/agent-${uid.slice(0, 8)}-${ch}.yml`, ex = await gh(`/repos/${REPO}/contents/${f}`), sh = ex.ok ? (await ex.json()).sha : undefined;
        const w = await gh(`/repos/${REPO}/contents/${f}`, { method: 'PUT', body: JSON.stringify({ message: `agent ${uid} ${ch}`, content: Buffer.from(workflow(uid, ch, token)).toString('base64'), sha: sh }) });
        if (!w.ok) return out(500, { error: 'github: ' + (await w.text()).slice(0, 200) });
        await gh(`/repos/${REPO}/actions/workflows/agent-${uid.slice(0, 8)}-${ch}.yml/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main' }) }); made.push(f);
      }
      await r.set({ status: 'approved', runnerHash: sha(token) }, { merge: true });
      return out(200, { made });
    }
    if (path === 'admin/reject') { await db.doc(`users/${b.uid}`).set({ status: 'rejected' }, { merge: true }); return out(200, { ok: true }); }
    return out(404, { error: 'not found' });
  } catch (e) { return out(500, { error: String(e.message).slice(0, 200) }); }
}
