# UPI QR Creator — setup (single file)

A ready-to-host page that turns a ChatGPT session into a UPI payment QR through the GPT UPI QR API. One file, no build step, no dependencies.

**GitHub Repository:** [https://github.com/iamobaidbhatofficial786/gptindiaqr](https://github.com/iamobaidbhatofficial786/gptindiaqr)

---

## 1. Add your API Key

Open `upi-creator-client.html` (or `index.html`) in any text editor. Near the top of the script (search for `DEFAULT_KEY`), you'll see:

```javascript
var DEFAULT_KEY = ""; // paste your own upi_live_ key here, OR leave blank and enter it in the page.
```

### Two Options:
1. **Prefill Key for All Users:**
   Paste your key between the quotes:
   ```javascript
   var DEFAULT_KEY = "upi_live_xxxxxxxx";
   ```
2. **Leave Blank:**
   Each user types their key into the page input field (saved in local browser storage only).

> **Get API Key & Credits:** Get your key + top up credits in the mini-app: **GPT UPI QR Creator → UPI QR API**. Each successful link costs $0.10; failed creations are refunded automatically.

---

## 2. Deploy (Must be HTTPS)

Browsers block API calls from a local `file://` protocol due to CORS, so host the single HTML file over HTTPS.

### Fast Deployment Options:
- **Netlify Drop:** Drag and drop `index.html` or `upi-creator-client.html` into [Netlify Drop](https://app.netlify.com/drop) for an instant HTTPS URL.
- **Cloudflare Pages / Vercel:** Drag and drop or connect your GitHub repository [`iamobaidbhatofficial786/gptindiaqr`](https://github.com/iamobaidbhatofficial786/gptindiaqr).
- **GitHub Pages:** Enable GitHub Pages under your repository settings pointing to the main branch (`index.html`).
- **Custom Server:** Serve `index.html` over HTTPS via any web server.

Open your deployed HTTPS URL to load your balance (e.g. `$1.00 · 10 links`).

---

## 3. Usage

1. Paste a **ChatGPT Session JSON** (obtained from `chatgpt.com/api/auth/session` while logged in) — or a raw `accessToken`.
2. *(Optional)* Add a **Reference** ID (your own order ID for idempotency so retries never double-charge).
3. Click **Create UPI link** — a QR code + payment link will appear.
4. Scan the QR code in any UPI app (Google Pay, PhonePe, Paytm, BHIM) and confirm payment within 5 minutes.

---

## Notes & Security

- **ChatGPT Plus Activation:** Payments activate ChatGPT Plus on the pasted account. It does **NOT** send money to your own bank/personal VPA. There is no "receive to my VPA" option.
- **API Credentials:** Your `upi_live_` key is a payment credential that spends your balance. Keep it private. If exposed, rotate it in the mini-app (the old key dies instantly and your balance/history carry over).
- **API Reference Documentation:** [https://duskyr.com/api/upi/docs](https://duskyr.com/api/upi/docs)

---

## Customization

Everything is self-contained in a single HTML file:
- **Styles/Branding:** Edit the `<style>` block in `<head>`.
- **Text & Structure:** Edit the HTML in `<body>`.
- **API Base URL:** Defined at `var API_BASE = "https://duskyr.com/api/upi";` (leave unchanged unless self-hosting the backend API).
