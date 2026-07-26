/**
 * Custom Self-Hosted ChatGPT UPI Link Generator Engine
 * 
 * Version: 1.0.0
 * Author: Sam Khan
 * Purpose: Generates ChatGPT Plus Stripe UPI QR Links directly without paying Duskyr API fees.
 */

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

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

app.get(['/', '/health', '/api/health'], (req, res) => {
  res.json({ ok: true, engine: 'Custom Self-Hosted ChatGPT UPI Engine v1.0.0', status: 'active' });
});

app.post(['/v1/create', '/api/create-link', '/create-link'], async (req, res) => {
  const { session_json, session } = req.body || {};
  const inputData = session_json || session;
  
  if (!inputData) {
    return res.status(400).json({ ok: false, error: 'session_json is required.' });
  }

  const token = extractAccessToken(inputData);
  if (!token) {
    return res.status(400).json({ ok: false, error: 'Could not extract valid accessToken from session.' });
  }

  try {
    const deviceId = '3a7d' + Math.random().toString(36).substring(2, 15);
    
    // Directly request OpenAI checkout session endpoint
    const openAiRes = await fetch('https://chatgpt.com/backend-api/payments/checkout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Origin': 'https://chatgpt.com',
        'Referer': 'https://chatgpt.com/',
        'Oai-Device-Id': deviceId,
        'Oai-Language': 'en-US'
      },
      body: JSON.stringify({
        plan: 'plus',
        payment_provider: 'stripe'
      })
    });

    const openAiData = await openAiRes.json();

    let paymentUrl = openAiData ? openAiData.url : null;
    if (!paymentUrl && openAiData && openAiData.checkout_session_id) {
      let secretHash = '';
      if (openAiData.client_secret && openAiData.client_secret.includes('_secret_')) {
        secretHash = '#' + openAiData.client_secret.split('_secret_')[1];
      }
      paymentUrl = `https://checkout.stripe.com/c/pay/${openAiData.checkout_session_id}${secretHash}`;
    }

    if (openAiRes.ok && openAiData && paymentUrl) {
      const orderCode = 'UPI-' + Date.now().toString(36).toUpperCase();
      return res.json({
        ok: true,
        payment_url: paymentUrl,
        code: orderCode,
        order_code: orderCode,
        status: 'pending'
      });
    } else {
      return res.status(openAiRes.status || 400).json({
        ok: false,
        error: (openAiData && (openAiData.detail || openAiData.message)) || 'OpenAI checkout rejected this session token.',
        raw: openAiData
      });
    }
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: 'Custom engine error: ' + err.message
    });
  }
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`Self-Hosted ChatGPT UPI Engine running on port ${PORT}`);
    console.log(`Endpoint: http://localhost:${PORT}/v1/create`);
    console.log(`====================================================`);
  });
}

module.exports = app;
