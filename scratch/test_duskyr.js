const key = 'upi_live_087a45b4c6aa8f4d7af201a0e6a53090';

async function testEndpoints() {
  console.log("=== Testing Balance ===");
  const balRes = await fetch('https://duskyr.com/api/upi/v1/balance', {
    headers: { 'Authorization': 'Bearer ' + key }
  });
  console.log("Balance status:", balRes.status, await balRes.text());

  const endpoints = [
    'https://duskyr.com/api/upi/v1/create',
    'https://duskyr.com/api/upi/v1/order',
    'https://duskyr.com/api/upi/create',
    'https://duskyr.com/api/upi/order'
  ];

  const testBodies = [
    { session_json: "{\"accessToken\":\"test\"}" },
    { session_json: { accessToken: "test" } },
    { session: "{\"accessToken\":\"test\"}" },
    { session: { accessToken: "test" } },
    { session_token: "test" },
    { token: "test" }
  ];

  for (const ep of endpoints) {
    console.log("\n=== Testing Endpoint:", ep);
    for (const b of testBodies) {
      try {
        const res = await fetch(ep, {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + key,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(b)
        });
        const txt = await res.text();
        console.log(`[${res.status}] Body: ${JSON.stringify(b)} => ${txt}`);
      } catch (err) {
        console.log(`[ERR] Body: ${JSON.stringify(b)} => ${err.message}`);
      }
    }
  }
}

testEndpoints();
