# Custom Self-Hosted ChatGPT UPI Engine (Zero API Cost)

Developed by **Sam Khan** for **Cracking Hub Official**.

This standalone server allows you to generate ChatGPT Plus Stripe UPI payment links directly from ChatGPT session tokens **without paying Duskyr API fees ($0.10/link)**.

---

## 🚀 How to Deploy on Render (100% Free Hosting)

1. **Create a free account on Render:** [https://render.com](https://render.com)
2. **Click New -> Web Service** and connect your GitHub repository (`gptindiaqr`).
3. Set the build parameters:
   - **Root Directory:** `custom-engine`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
4. Click **Deploy**! Render will give you a free HTTPS URL e.g. `https://your-custom-engine.onrender.com`.

---

## ⚡ How to Connect to Your Live Netlify Site

Once your custom engine is deployed on Render, update 1 environment variable on Netlify:

1. Open **Netlify Dashboard -> Site settings -> Environment variables**.
2. Change `API_BASE` to your Render URL:
   ```
   API_BASE = https://your-custom-engine.onrender.com
   ```
3. Trigger a redeploy on Netlify!

Now all creations on your website will pass through **your own free engine** instead of Duskyr, saving you 100% of API fees!
