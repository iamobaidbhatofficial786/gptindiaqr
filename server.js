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

// Data persistence fallback
const DATA_DIR = path.join(__dirname, 'data');
const LOCAL_FILE = path.join(DATA_DIR, 'codes.json');
const TMP_FILE = path.join('/tmp', 'codes.json');

let inMemoryStore = {};

function getStorageFilePath() {
  try {
    if (fs.existsSync(TMP_FILE)) return TMP_FILE;
    if (fs.existsSync(LOCAL_FILE)) return LOCAL_FILE;
  } catch(e){}
  return (process.env.NETLIFY || process.env.LAMBDA_TASK_ROOT) ? TMP_FILE : LOCAL_FILE;
}

function loadCodes() {
  try {
    const filePath = getStorageFilePath();
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      inMemoryStore = { ...inMemoryStore, ...data };
      return inMemoryStore;
    }
  } catch (err) {
    console.error('Error reading codes file:', err);
  }
  return inMemoryStore;
}

function saveCodes(codes) {
  inMemoryStore = codes;
  const filePath = getStorageFilePath();
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(codes, null, 2), 'utf8');
  } catch (err) {
    // Serverless read-only warning fallback
  }
}

// ----------------------------------------------------
// Cryptographically Signed Key Engine (Stateless & Bulletproof)
// ----------------------------------------------------

function signKey(credits, nonce, initialPack) {
  const secret = process.env.ADMIN_PASSWORD || ADMIN_PASSWORD;
  return crypto.createHmac('sha256', secret)
    .update(`${credits}:${nonce}:${initialPack}`)
    .digest('hex')
    .substring(0, 8)
    .toUpperCase();
}

function createSignedKey(credits, initialPack = 15) {
  const nonce = crypto.randomBytes(4).toString('hex').toUpperCase();
  const sig = signKey(credits, nonce, initialPack);
  return `GPT${credits}C${initialPack}P-${nonce}-${sig}`;
}

function verifyAndParseKey(keyStr) {
  if (!keyStr) return null;
  const clean = keyStr.trim().toUpperCase();

  // Pattern: GPT<credits>C<initialPack>P-<nonce>-<sig>
  // e.g. GPT15C15P-A1B2C3D4-E5F6G7H8 or GPT14C15P-A1B2C3D4-XXXX
  const match = clean.match(/^GPT(\d+)C(\d+)P-([A-F0-9]+)-([A-F0-9]+)$/);
  if (match) {
    const credits = parseInt(match[1], 10);
    const initialPack = parseInt(match[2], 10);
    const nonce = match[3];
    const sig = match[4];

    const expectedSig = signKey(credits, nonce, initialPack);
    if (sig === expectedSig) {
      return {
        code: clean,
        credits: credits,
        initialCredits: initialPack,
        nonce: nonce,
        isSigned: true
      };
    }
  }

  // Legacy format: GPT-200-XXXX-XXXX or GPT-20-XXXX-XXXX
  const legacyMatch = clean.match(/^GPT-(\d+)-([A-F0-9]+)-([A-F0-9]+)$/);
  if (legacyMatch) {
    const packPrice = legacyMatch[1];
    const nonce = legacyMatch[2] + legacyMatch[3];
    const initialPack = packPrice === '200' ? 15 : 1;
    
    // Convert legacy key on-the-fly to signed format
    const sig = signKey(initialPack, nonce, initialPack);
    const signedCode = `GPT${initialPack}C${initialPack}P-${nonce}-${sig}`;
    
    return {
      code: signedCode,
      credits: initialPack,
      initialCredits: initialPack,
      nonce: nonce,
      isSigned: true,
      convertedFromLegacy: true
    };
  }

  return null;
}

// ----------------------------------------------------
// Public API Endpoints
// ----------------------------------------------------

app.get(['/api/plans', '/plans'], (req, res) => {
  res.json({
    ok: true,
    upi_id: PAYMENT_UPI_ID,
    plans: [
      { id: 'pack15', name: '15 Credits Pack', price: 200, credits: 15, perCredit: '13.3' },
      { id: 'pack1', name: '1 Credit Pack', price: 20, credits: 1, perCredit: '20.0' }
    ]
  });
});

app.post(['/api/check-code', '/check-code'], (req, res) => {
  const { code } = req.body || {};
  if (!code) {
    return res.status(400).json({ ok: false, error: 'Redemption code or API key is required.' });
  }

  const cleanCode = code.trim();

  // Direct upi_live_ key check
  if (cleanCode.startsWith('upi_live_')) {
    return res.json({
      ok: true,
      code: cleanCode,
      credits: 999,
      initialCredits: 999,
      isDirectKey: true
    });
  }

  // Try verifying as Cryptographically Signed Key (Stateless & Serverless Immune)
  const signedInfo = verifyAndParseKey(cleanCode);
  if (signedInfo) {
    return res.json({
      ok: true,
      code: signedInfo.code,
      credits: signedInfo.credits,
      initialCredits: signedInfo.initialCredits
    });
  }

  // Check store fallback
  const codes = loadCodes();
  const keyData = codes[cleanCode.toUpperCase()];

  if (!keyData) {
    return res.status(404).json({ ok: false, error: 'Invalid redemption key. Check spelling or generate in Admin Panel.' });
  }

  res.json({
    ok: true,
    code: keyData.code,
    credits: keyData.credits,
    initialCredits: keyData.initialCredits,
    created_at: keyData.created_at
  });
});

app.post(['/api/create-link', '/create-link'], async (req, res) => {
  const { code, session, reference } = req.body || {};

  if (!code) {
    return res.status(400).json({ ok: false, error: 'Redemption key or upi_live_ key is required.' });
  }
  if (!session) {
    return res.status(400).json({ ok: false, error: 'ChatGPT session token/JSON is required.' });
  }

  const cleanCode = code.trim();
  let upstreamKey = process.env.UPSTREAM_API_KEY ? process.env.UPSTREAM_API_KEY.trim() : '';
  let isDirectKey = false;
  let signedInfo = null;
  let keyData = null;
  let codes = {};

  if (cleanCode.startsWith('upi_live_')) {
    upstreamKey = cleanCode;
    isDirectKey = true;
  } else {
    signedInfo = verifyAndParseKey(cleanCode);
    if (signedInfo) {
      if (signedInfo.credits < 1) {
        return res.status(403).json({ ok: false, error: 'Insufficient credits on this key. Please top up or enter a new key.' });
      }
    } else {
      codes = loadCodes();
      keyData = codes[cleanCode.toUpperCase()];

      if (!keyData) {
        return res.status(404).json({ ok: false, error: 'Invalid redemption key.' });
      }

      if (keyData.credits < 1) {
        return res.status(403).json({ ok: false, error: 'Insufficient credits on this key. Please top up or enter a new key.' });
      }
    }
  }

  if (!upstreamKey || upstreamKey === 'upi_live_your_actual_key_here') {
    return res.status(500).json({
      ok: false,
      error: 'Server UPSTREAM_API_KEY is not configured in Netlify environment variables.'
    });
  }

  // Format session_json payload required by duskyr API /v1/create
  let sessionJsonStr = session;
  if (typeof session === 'object') {
    sessionJsonStr = JSON.stringify(session);
  } else if (typeof session === 'string') {
    sessionJsonStr = session.trim();
  }

  try {
    const upstreamRes = await fetch(`${UPSTREAM_API_BASE}/v1/create`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${upstreamKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        session_json: sessionJsonStr,
        reference: reference || undefined
      })
    });

    const data = await upstreamRes.json();

    if (upstreamRes.ok && data && (data.code || data.order_code || data.status === 'processing' || data.payment_url || data.ok)) {
      let updatedKey = cleanCode;
      let newRemainingCredits = 999;

      if (!isDirectKey) {
        if (signedInfo) {
          const newCredits = Math.max(0, signedInfo.credits - 1);
          const sig = signKey(newCredits, signedInfo.nonce, signedInfo.initialCredits);
          updatedKey = `GPT${newCredits}C${signedInfo.initialCredits}P-${signedInfo.nonce}-${sig}`;
          newRemainingCredits = newCredits;
        } else if (keyData) {
          keyData.credits = Math.max(0, keyData.credits - 1);
          newRemainingCredits = keyData.credits;
          codes[cleanCode.toUpperCase()] = keyData;
          saveCodes(codes);
        }
      }

      return res.json({
        ok: true,
        data: data,
        updated_key: updatedKey,
        remaining_credits: newRemainingCredits
      });
    } else {
      const errMsg = (data && (data.message || data.error))
        ? (data.message || data.error)
        : `Upstream API error (${upstreamRes.status}): ${JSON.stringify(data)}`;
      return res.status(upstreamRes.status || 400).json({ ok: false, error: errMsg, data: data });
    }
  } catch (err) {
    console.error('Error proxying create-link request:', err);
    return res.status(500).json({ ok: false, error: 'Server proxy request failed: ' + err.message });
  }
});

app.get(['/api/order-status/:orderCode', '/order-status/:orderCode'], async (req, res) => {
  const { orderCode } = req.params;
  const upstreamKey = (process.env.UPSTREAM_API_KEY || '').trim();

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

app.post(['/api/admin/login', '/admin/login'], (req, res) => {
  const { password } = req.body || {};
  const expectedPass = process.env.ADMIN_PASSWORD || ADMIN_PASSWORD;

  if (password && password.trim() === expectedPass.trim()) {
    const token = crypto.createHash('sha256').update(expectedPass.trim() + '_salt_2026').digest('hex');
    return res.json({ ok: true, token });
  }
  return res.status(401).json({ ok: false, error: 'Invalid admin passcode.' });
});

function checkAdminAuth(req, res, next) {
  const token = req.headers['x-admin-token'];
  const expectedPass = process.env.ADMIN_PASSWORD || ADMIN_PASSWORD;
  const expected = crypto.createHash('sha256').update(expectedPass.trim() + '_salt_2026').digest('hex');
  if (token === expected) {
    return next();
  }
  return res.status(401).json({ ok: false, error: 'Unauthorized admin request.' });
}

app.post(['/api/admin/generate-keys', '/admin/generate-keys'], checkAdminAuth, (req, res) => {
  const { type, count = 1 } = req.body || {};
  
  let credits = 1;
  let packPrice = 20;

  if (type === 'pack15' || req.body.credits === 15) {
    credits = 15;
    packPrice = 200;
  }

  const numKeys = Math.min(Math.max(1, parseInt(count) || 1), 50);
  const codes = loadCodes();
  const generated = [];

  for (let i = 0; i < numKeys; i++) {
    const keyStr = createSignedKey(credits, credits);
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

app.get(['/api/admin/keys', '/admin/keys'], checkAdminAuth, (req, res) => {
  const codes = loadCodes();
  const list = Object.values(codes).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ ok: true, keys: list });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`UPI QR Creator Proxy Server running on port ${PORT}`);
    console.log(`====================================================`);
  });
}

module.exports = app;
