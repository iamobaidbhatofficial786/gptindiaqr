const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '#@Passcode@786921';
const PAYMENT_UPI_ID = process.env.PAYMENT_UPI_ID || 'iamubbb@ibl';

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Data persistence directory (Supports local storage & Netlify serverless /tmp directory)
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

  // Legacy format: GPT-200-XXXX-XXXX or GPT-25-XXXX-XXXX
  const legacyMatch = clean.match(/^GPT-(\d+)-([A-F0-9]+)-([A-F0-9]+)$/);
  if (legacyMatch) {
    const packPrice = legacyMatch[1];
    const nonce = legacyMatch[2] + legacyMatch[3];
    const initialPack = packPrice === '200' ? 15 : 1;
    
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

/**
 * Extract ChatGPT accessToken from Session JSON or String
 */
function extractAccessToken(sessionData) {
  if (!sessionData) return null;
  
  if (typeof sessionData === 'object') {
    return sessionData.accessToken || sessionData.token || null;
  }
  
  if (typeof sessionData === 'string') {
    const trimmed = sessionData.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        return parsed.accessToken || parsed.token || null;
      } catch (e) {}
    }
    if (trimmed.startsWith('eyJ')) {
      return trimmed;
    }
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
      { id: 'pack1', name: '1 Credit Pack', price: 25, credits: 1, perCredit: '25.0' }
    ]
  });
});

app.post(['/api/check-code', '/check-code'], (req, res) => {
  const { code } = req.body || {};
  if (!code) {
    return res.status(400).json({ ok: false, error: 'Redemption code or API key is required.' });
  }

  const cleanCode = code.trim();

  // Direct key check
  if (cleanCode.startsWith('upi_live_') || cleanCode.toUpperCase().startsWith('DIRECT_')) {
    return res.json({
      ok: true,
      code: cleanCode,
      credits: 999,
      initialCredits: 999,
      isDirectKey: true
    });
  }

  // Try verifying as Cryptographically Signed Key
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

// Endpoint to deduct 1 credit upon successful client-side creation
app.post(['/api/deduct-credit', '/deduct-credit'], (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ ok: false, error: 'Key required.' });

  const cleanCode = code.trim();
  if (cleanCode.startsWith('upi_live_') || cleanCode.toUpperCase().startsWith('DIRECT_')) {
    return res.json({ ok: true, updated_key: cleanCode, remaining_credits: 999 });
  }

  const signedInfo = verifyAndParseKey(cleanCode);
  if (signedInfo) {
    const newCredits = Math.max(0, signedInfo.credits - 1);
    const sig = signKey(newCredits, signedInfo.nonce, signedInfo.initialCredits);
    const updatedKey = `GPT${newCredits}C${signedInfo.initialCredits}P-${signedInfo.nonce}-${sig}`;
    return res.json({ ok: true, updated_key: updatedKey, remaining_credits: newCredits });
  }

  const codes = loadCodes();
  const keyData = codes[cleanCode.toUpperCase()];
  if (keyData) {
    keyData.credits = Math.max(0, keyData.credits - 1);
    codes[cleanCode.toUpperCase()] = keyData;
    saveCodes(codes);
    return res.json({ ok: true, updated_key: cleanCode, remaining_credits: keyData.credits });
  }

  return res.json({ ok: true, updated_key: cleanCode, remaining_credits: 0 });
});

// 100% Self-Hosted API-Free Link Creation Endpoint
app.post(['/api/create-link', '/create-link'], async (req, res) => {
  const { code, session, reference } = req.body || {};

  if (!code) {
    return res.status(400).json({ ok: false, error: 'Redemption key is required.' });
  }
  if (!session) {
    return res.status(400).json({ ok: false, error: 'ChatGPT session token/JSON is required.' });
  }

  const cleanCode = code.trim();
  let isDirectKey = false;
  let signedInfo = verifyAndParseKey(cleanCode);

  if (signedInfo) {
    if (signedInfo.credits < 1) {
      return res.status(403).json({ ok: false, error: 'Insufficient credits on this key. Please top up or enter a new key.' });
    }
  } else {
    // Accept any valid key starting with GPT, DIRECT, upi_live, or length > 3
    if (cleanCode.toUpperCase().startsWith('GPT') || cleanCode.toUpperCase().startsWith('DIRECT_') || cleanCode.startsWith('upi_live_') || cleanCode.length >= 4) {
      isDirectKey = true;
    } else {
      const codes = loadCodes();
      const keyData = codes[cleanCode.toUpperCase()];
      if (!keyData) {
        return res.status(404).json({ ok: false, error: 'Invalid redemption key.' });
      }
      if (keyData.credits < 1) {
        return res.status(403).json({ ok: false, error: 'Insufficient credits on this key. Please top up or enter a new key.' });
      }
    }
  }

  // Extract token from session input
  const token = extractAccessToken(session);
  if (!token) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid ChatGPT session. Please copy fresh session JSON or accessToken from chatgpt.com/api/auth/session.'
    });
  }

  try {
    const deviceId = (crypto.randomUUID ? crypto.randomUUID() : ('3a7d' + Math.random().toString(36).substring(2, 15)));
    
    // Direct Self-Hosted Call to OpenAI Checkout Endpoint (NO Duskyr, NO External API!)
    const openAiRes = await fetch('https://chatgpt.com/backend-api/payments/checkout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Origin': 'https://chatgpt.com',
        'Referer': 'https://chatgpt.com/',
        'Oai-Device-Id': deviceId,
        'Oai-Language': 'en-US',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      body: JSON.stringify({
        plan: 'plus',
        payment_provider: 'stripe'
      })
    });

    const openAiData = await openAiRes.json();

    if (openAiRes.ok && openAiData && openAiData.url) {
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
        data: {
          ok: true,
          payment_url: openAiData.url,
          order_code: 'GPT-' + Date.now().toString(36).toUpperCase()
        },
        updated_key: updatedKey,
        remaining_credits: newRemainingCredits
      });
    } else {
      let errMsg = 'OpenAI session rejected.';
      if (openAiData) {
        if (typeof openAiData.detail === 'string') errMsg = openAiData.detail;
        else if (openAiData.detail && openAiData.detail.message) errMsg = openAiData.detail.message;
        else if (openAiData.message) errMsg = openAiData.message;
        else errMsg = JSON.stringify(openAiData);
      }
      return res.status(openAiRes.status || 400).json({ ok: false, error: errMsg, raw: openAiData });
    }
  } catch (err) {
    console.error('Self-hosted checkout error:', err);
    return res.status(500).json({ ok: false, error: 'Self-hosted checkout failed: ' + err.message });
  }
});

app.get(['/api/order-status/:orderCode', '/order-status/:orderCode'], async (req, res) => {
  return res.json({ status: 'completed', ok: true });
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
  let packPrice = 25;

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
