const fetch = require('node-fetch');
const cron = require('node-cron');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

const COINS = [
  'BTC','ETH','SOL','BNB','XRP','ADA','AVAX','DOT',
  'LINK','POL','DOGE','SHIB','SUI','NEAR','TRX'
];

async function getOKXData(symbol) {
  try {
    const instId = `${symbol}-USDT-SWAP`;
    const [tickerRes, fundingRes] = await Promise.all([
      fetch(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`),
      fetch(`https://www.okx.com/api/v5/public/funding-rate?instId=${instId}`)
    ]);
    const ticker = await tickerRes.json();
    const funding = await fundingRes.json();
    
    const price = parseFloat(ticker.data?.[0]?.last || 0);
    const change24h = parseFloat(ticker.data?.[0]?.sodUtc8 || 0);
    const pct = price && change24h ? ((price - change24h) / change24h * 100).toFixed(2) : '0.00';
    const fundingRate = parseFloat(funding.data?.[0]?.fundingRate || 0);
    
    return { price, pct, fundingRate };
  } catch(e) {
    return null;
  }
}

function calcScore(pct, fundingRate) {
  let score = 50;
  const p = parseFloat(pct);
  if (p > 3) score += 20;
  else if (p > 1) score += 10;
  else if (p < -3) score -= 20;
  else if (p < -1) score -= 10;
  if (Math.abs(fundingRate) < 0.0001) score += 10;
  else if (fundingRate > 0.0005) score -= 10;
  return Math.min(100, Math.max(0, score));
}

function getSignal(score) {
  if (score >= 70) return { emoji: '🟢', text: 'GO SINYALI' };
  if (score >= 50) return { emoji: '🟡', text: 'NÖTR' };
  return { emoji: '🔴', text: 'HAYIR' };
}

async function sendSignals() {
  const results = [];
  
  for (const coin of COINS) {
    const data = await getOKXData(coin);
    if (!data) continue;
    const score = calcScore(data.pct, data.fundingRate);
    const signal = getSignal(score);
    results.push({ coin, ...data, score, signal });
  }

  results.sort((a, b) => b.score - a.score);
  
  const goSignals = results.filter(r => r.score >= 70);
  const now = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
  
  let msg = `⚡ *QUANTIX OS — Piyasa Analizi*\n`;
  msg += `🕐 ${now}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (goSignals.length > 0) {
    msg += `🚀 *GO SİNYALLERİ*\n`;
    for (const r of goSignals) {
      msg += `${r.signal.emoji} *${r.coin}* — Skor: ${r.score}/100\n`;
      msg += `💰 $${r.price.toLocaleString()} | ${r.pct > 0 ? '+' : ''}${r.pct}% (24s)\n\n`;
    }
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  }

  msg += `\n📊 *TÜM COINLER*\n`;
  for (const r of results) {
    msg += `${r.signal.emoji} ${r.coin}: ${r.score}/100 | ${r.pct > 0 ? '+' : ''}${r.pct}%\n`;
  }
  
  msg += `\n━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🤖 _QUANTIX OS AI Sinyal Sistemi_\n`;
  msg += `🌐 quantixos.com`;

  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHANNEL_ID,
      text: msg,
      parse_mode: 'Markdown'
    })
  });
  
  console.log(`Sinyal gönderildi: ${now}`);
}

// Günde 5 kez: 07:00, 10:00, 13:00, 17:00, 21:00 (TR saati)
cron.schedule('0 4 * * *', sendSignals);   // 07:00 TR
cron.schedule('0 7 * * *', sendSignals);   // 10:00 TR
cron.schedule('0 10 * * *', sendSignals);  // 13:00 TR
cron.schedule('0 14 * * *', sendSignals);  // 17:00 TR
cron.schedule('0 18 * * *', sendSignals);  // 21:00 TR

console.log('QUANTIX OS Telegram Bot başladı ✅');
sendSignals(); // İlk başlangıçta hemen çalış