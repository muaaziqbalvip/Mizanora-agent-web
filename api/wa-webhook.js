// Meta webhook relay. No secrets and no env vars: it only stores raw events in Firestore "inbox"; the user's GitHub workflow does the rest.
const P = 'mizanor-ai-agent', K = 'AIzaSyAWiUQO3iFAYPVQcavr7a7dzIg8xEOxM7o';
const FS = `https://firestore.googleapis.com/v1/projects/${P}/databases/(default)/documents`;
export default async function handler(req, res) {
  const u = new URL(req.url, 'http://x'), biz = u.searchParams.get('biz') || '';
  if (!/^[A-Za-z0-9]{10,40}$/.test(biz)) return res.status(400).end('bad biz');
  if (req.method === 'GET') { // Meta verification handshake
    const r = await fetch(`${FS}/bizPublic/${biz}?key=${K}`); const d = r.ok ? (await r.json()).fields : null;
    return d?.verifyToken?.stringValue && u.searchParams.get('hub.verify_token') === d.verifyToken.stringValue ? res.status(200).end(u.searchParams.get('hub.challenge')) : res.status(403).end('forbidden');
  }
  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  if (raw.length > 20000) return res.status(413).end();
  await fetch(`${FS}/inbox?key=${K}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fields: { uid: { stringValue: biz }, body: { stringValue: raw }, sig: { stringValue: String(req.headers['x-hub-signature-256'] || '') }, done: { booleanValue: false }, at: { integerValue: String(Date.now()) } } }) }).catch(() => {});
  return res.status(200).end('ok'); // always 200 quickly so Meta does not retry
}
