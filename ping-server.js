// Keep-alive script to prevent Render from sleeping
// Run this every 10 minutes using cron-job.org or any cron service

const SERVER_URL = "https://words-nest.onrender.com";

async function pingServer() {
  const start = Date.now();
  try {
    const response = await fetch(`${SERVER_URL}/api/ping-keep-alive`, {
      method: 'GET',
      headers: { 'User-Agent': 'WordsNest-KeepAlive/1.0' }
    });
    
    const data = await response.json();
    const duration = Date.now() - start;
    
    console.log(`✅ Ping successful! Server responded in ${duration}ms`);
    console.log(`   Status: ${response.status}, Uptime: ${data.uptime}s`);
  } catch (error) {
    console.error(`❌ Ping failed: ${error.message}`);
  }
}

// Run immediately, then every 10 minutes
console.log("🚀 Starting keep-alive pinger...");
pingServer();
setInterval(pingServer, 10 * 60 * 1000); // 10 minutes