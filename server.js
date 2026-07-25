const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '#@Passcode@786921';
const UPSTREAM_API_BASE = process.env.API_BASE || 'https://duskyr.com/api/upi';
const PAYMENT_UPI_ID = process.env.PAYMENT_UPI_ID || 'iamubbb@ibl';

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Data persistence directory
const DATA_DIR = path.join(__dirname, 'data');
const CODES_FILE = path.join(DATA_DIR, 'codes.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadCodes() {
  try {
    if (fs.existsSync(CODES_FILE)) {
      return JSON.parse(fs.readFileSync(CODES_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Error reading codes.json:', err);
  }
  return {};
}

function saveCodes(codes) {
  try {
    fs.writeFileSync(CODES_FILE, JSON.stringify(codes, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving codes.json:', err);
  }
}

// Generate unique key code
function generateCode(prefix = 'GPT') {
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  const rand2 = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${rand}-${rand2}`;
}

// ----------------------------------------------------
// Public API Endpoints
// ----------------------------------------------------

// 1. Get Payment Plans and UPI ID
app.get('/api/plans', (req, res) => {
  res.json({
    ok: true,
    upi_id: PAYMENT_UPI_ID,
    plans: [
      { id: 'pack15', name: '15 Credits Pack', price: 200, credits: 15, perCredit: '13.3' },
      { id: 'pack1', name: '1 Credit Pack', price: 20, credits: 1, perCredit: '20.0' }
    ]
  });
});

// 2. Check User Redemption Code
app.post('/api/check-code', (req, res) => {
  const { code } = req.body || {};
  if (!code) {
    return res.status(400).json({ ok: false, error: 'Redemption code is required.' });
  }

  const codes = loadCodes();
  const keyData = codes[code.trim().toUpperCase()];

  if (!keyData) {
    return res.status(404).json({ ok: false, error: 'Invalid redemption key.' });
  }

  res.json({
    ok: true,
    code: keyData.code,
    credits: keyData.credits,
    initialCredits: keyData.initialCredits,
    created_at: keyData.created_at
  });
});

// 3. Create ChatGPT UPI Link (Secure Proxy + Auto Deduct 1 Credit)
app.post('/api/create-link', async (req, res) => {
  const { code, session, reference } = req.body || {};

  if (!code) {
    return res.status(400).json({ ok: false, error: 'Redemption key is required.' });
  }
  if (!session) {
    return res.status(400).json({ ok: false, error: 'ChatGPT session is required.' });
  }

  const cleanCode = code.trim().toUpperCase();
  const codes = loadCodes();
  const keyData = codes[cleanCode];

  if (!keyData) {
    return res.status(404).json({ ok: false, error: 'Invalid redemption key.' });
  }

  if (keyData.credits < 1) {
    return res.status(403).json({ ok: false, error: 'Insufficient credits. Please top up or enter a new code.' });
  }

  const upstreamKey = process.env.UPSTREAM_API_KEY;
  if (!upstreamKey || upstreamKey === 'upi_live_your_actual_key_here') {
    return res.status(500).json({
      ok: false,
      error: 'Server upstream API key is not configured. Please set UPSTREAM_API_KEY in server environment variables.'
    });
  }

  try {
    const upstreamRes = await fetch(`${UPSTREAM_API_BASE}/v1/order`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${upstreamKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        session: session,
        reference: reference || undefined
      })
    });

    const data = await upstreamRes.json();

    if (upstreamRes.ok && data && (data.code || data.status === 'processing' || data.payment_url)) {
      // Deduct 1 credit automatically
      keyData.credits = Math.max(0, keyData.credits - 1);
      keyData.usage_history = keyData.usage_history || [];
      keyData.usage_history.push({
        timestamp: new Date().toISOString(),
        order_code: data.code || null,
        reference: reference || null
      });
      codes[cleanCode] = keyData;
      saveCodes(codes);

      return res.json({
        ok: true,
        data: data,
        remaining_credits: keyData.credits
      });
    } else {
      const errMsg = (data && (data.error || data.message)) ? (data.error || data.message) : 'Failed to initiate UPI link.';
      return res.status(upstreamRes.status || 400).json({ ok: false, error: errMsg, data: data });
    }
  } catch (err) {
    console.error('Error proxying create-link request:', err);
    return res.status(500).json({ ok: false, error: 'Server proxy request failed: ' + err.message });
  }
});

// 4. Poll Order Status
app.get('/api/order-status/:orderCode', async (req, res) => {
  const { orderCode } = req.params;
  const upstreamKey = process.env.UPSTREAM_API_KEY;

  if (!upstreamKey) {
    return res.status(500).json({ ok: false, error: 'Server upstream key missing.' });
  }

  try {
    const upstreamRes = await fetch(`${UPSTREAM_API_BASE}/v1/order/${encodeURIComponent(orderCode)}`, {
      headers: { 'Authorization': `Bearer ${upstreamKey}` }
    });
    const data = await upstreamRes.json();
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to poll status: ' + err.message });
  }
});

// ----------------------------------------------------
// Admin Endpoints
// ----------------------------------------------------

// Admin Login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (password === ADMIN_PASSWORD) {
    const token = crypto.createHash('sha256').update(ADMIN_PASSWORD + '_salt_2026').digest('hex');
    return res.json({ ok: true, token });
  }
  return res.status(401).json({ ok: false, error: 'Invalid admin passcode.' });
});

// Admin Middleware Check
function checkAdminAuth(req, res, next) {
  const token = req.headers['x-admin-token'];
  const expected = crypto.createHash('sha256').update(ADMIN_PASSWORD + '_salt_2026').digest('hex');
  if (token === expected) {
    return next();
  }
  return res.status(401).json({ ok: false, error: 'Unauthorized admin request.' });
}

// Admin Generate Keys
app.post('/api/admin/generate-keys', checkAdminAuth, (req, res) => {
  const { type, count = 1 } = req.body || {};
  
  let credits = 1;
  let prefix = 'GPT-20';

  if (type === 'pack15' || req.body.credits === 15) {
    credits = 15;
    prefix = 'GPT-200';
  }

  const numKeys = Math.min(Math.max(1, parseInt(count) || 1), 50);
  const codes = loadCodes();
  const generated = [];

  for (let i = 0; i < numKeys; i++) {
    const keyStr = generateCode(prefix);
    const keyObj = {
      code: keyStr,
      credits: credits,
      initialCredits: credits,
      created_at: new Date().toISOString(),
      usage_history: []
    };
    codes[keyStr] = keyObj;
    generated.push(keyObj);
  }

  saveCodes(codes);
  res.json({ ok: true, keys: generated });
});

// Admin List Keys
app.get('/api/admin/keys', checkAdminAuth, (req, res) => {
  const codes = loadCodes();
  const list = Object.values(codes).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ ok: true, keys: list });
});

// Start Server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`UPI QR Creator Proxy Server running on port ${PORT}`);
    console.log(`UPI ID: ${PAYMENT_UPI_ID}`);
    console.log(`Admin Panel: http://localhost:${PORT}/admin.html`);
    console.log(`====================================================`);
  });
}

module.exports = app;
