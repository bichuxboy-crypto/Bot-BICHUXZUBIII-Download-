import express from 'express';

const BRAND = '𝐁𝐈𝐂𝐇𝐔𝐗𝐙𝐔𝐁𝐈𝐈𝐈';
const PAIR_LABEL = 'BICH-UXMD';
let lastRequestAt = 0;
let busy = false;

function page() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${BRAND} Pairing</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:linear-gradient(135deg,#06131f,#102d42);font-family:Arial,sans-serif;color:#eef7ff}.card{width:min(92vw,460px);padding:30px;border-radius:24px;background:#10283a;box-shadow:0 18px 60px #0008;text-align:center}.brand{font-size:15px;color:#2ee6a6;font-weight:700;letter-spacing:1px}h1{font-size:30px;margin:15px 0 8px}p{color:#b9cbd8;line-height:1.5}input,button{width:100%;padding:14px;border-radius:12px;font-size:16px}input{border:1px solid #38556b;background:#081a29;color:#fff;margin:12px 0}button{border:0;background:#18c98b;color:#062118;font-weight:700;cursor:pointer}button:disabled{opacity:.6}.result{margin-top:18px;padding:15px;border-radius:14px;background:#071923;display:none}.code{font-size:28px;letter-spacing:5px;color:#ffd166;font-weight:800;margin:10px 0}.error{color:#ff8f8f}.ok{color:#6ff0bb}.small{font-size:12px;color:#88a2b3}</style></head><body><main class="card"><div class="brand">${PAIR_LABEL}</div><h1>${BRAND}</h1><p>WhatsApp pairing page. Enter your number with country code, without <b>+</b>, spaces, or dashes.</p><input id="phone" inputmode="numeric" placeholder="Example: 923001234567" maxlength="15"><button id="go">Get Pairing Code</button><section id="result" class="result"></section><p class="small">Use only on a private domain. Never share your pairing code with anyone.</p></main><script>const phone=document.querySelector('#phone'),go=document.querySelector('#go'),result=document.querySelector('#result');go.onclick=async()=>{result.style.display='block';result.textContent='Requesting code...';go.disabled=true;try{const r=await fetch('/pair/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone:phone.value})});const d=await r.json();if(!r.ok)throw Error(d.error||'Request failed');result.innerHTML='<div class="ok">BICH-UXMD pairing code:</div><div class="code">'+d.code+'</div><p>'+d.message+'</p>'}catch(e){result.innerHTML='<div class="error">'+e.message+'</div>'}finally{go.disabled=false}};</script></body></html>`;
}

export function registerWebPairing({ getSocket, isConnected }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2kb' }));
  app.get('/', (_req, res) => res.redirect('/pair'));
  app.get('/pair', (_req, res) => res.type('html').send(page()));
  app.get('/pair/status', (_req, res) => res.json({ brand: BRAND, label: PAIR_LABEL, connected: Boolean(isConnected?.()) }));
  app.post('/pair/api', async (req, res) => {
    const phone = String(req.body?.phone || '').replace(/\D/g, '');
    if (!/^\d{8,15}$/.test(phone)) return res.status(400).json({ error: 'Enter a valid WhatsApp number with country code, 8–15 digits.' });
    if (Date.now() - lastRequestAt < 30000) return res.status(429).json({ error: 'Please wait 30 seconds before requesting another code.' });
    const sock = getSocket?.();
    if (!sock) return res.status(503).json({ error: 'Bot is still starting. Try again in a few seconds.' });
    if (isConnected?.()) return res.status(409).json({ error: 'The bot is already connected. Log out first if you want to pair a new number.' });
    if (busy) return res.status(429).json({ error: 'Another pairing request is already in progress.' });
    busy = true;
    lastRequestAt = Date.now();
    try {
      const code = await sock.requestPairingCode(phone);
      return res.json({ code, label: PAIR_LABEL, message: 'Open WhatsApp → Linked devices → Link a device → Link with phone number, then enter this code.' });
    } catch (error) {
      console.error('[web pairing]', error?.message || error);
      return res.status(500).json({ error: 'Could not generate a pairing code. Check the server logs.' });
    } finally {
      busy = false;
    }
  });
  return app;
}
