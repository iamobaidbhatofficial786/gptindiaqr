/**
 * Standalone Custom ChatGPT UPI Generator Engine
 * 
 * This engine automates the creation of ChatGPT Plus Stripe UPI payment links
 * directly from ChatGPT session tokens without paying any third-party API fees!
 */

const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4000;

/**
 * Extract accessToken from ChatGPT session JSON or raw token string
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
    // Check if raw token or Bearer token
    if (trimmed.startsWith('eyJ')) {
      return trimmed;
    }
  }
  
  return null;
}

/**
 * Custom Checkout Endpoint
 * 
 * Takes: { session_json: "..." }
 * Returns: { ok: true, payment_url: "...", checkout_url: "..." }
 */
app.post('/api/create-link', async (req, res) => {
  const { session_json } = req.body || {};
  
  if (!session_json) {
    return res.status(400).json({ ok: false, error: 'session_json is required.' });
  }

  const token = extractAccessToken(session_json);
  if (!token) {
    return res.status(400).json({ ok: false, error: 'Could not extract valid accessToken from session_json.' });
  }

  try {
    // Step 1: Call OpenAI Checkout Endpoint with session token
    const openAiRes = await fetch('https://chatgpt.com/backend-api/payments/checkout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Origin': 'https://chatgpt.com',
        'Referer': 'https://chatgpt.com/'
      },
      body: JSON.stringify({
        plan: 'plus',
        payment_provider: 'stripe'
      })
    });

    const openAiData = await openAiRes.json();

    if (openAiRes.ok && openAiData && openAiData.url) {
      const stripeCheckoutUrl = openAiData.url;
      
      // Step 2: Extract Stripe Checkout Session ID or Stripe URL
      return res.json({
        ok: true,
        payment_url: stripeCheckoutUrl,
        checkout_url: stripeCheckoutUrl,
        message: 'Custom checkout link generated successfully without API fees!'
      });
    } else {
      return res.status(openAiRes.status || 400).json({
        ok: false,
        error: openAiData.detail || openAiData.message || 'OpenAI checkout failed. Session token may be expired or invalid.',
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

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`Custom Self-Hosted ChatGPT UPI Engine running on port ${PORT}`);
  console.log(`====================================================`);
});
