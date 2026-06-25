const https = require("https");

const SOURCE_URL = "https://api.huiniao.top/interface/home/lotteryHistory";
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      rejectUnauthorized: false,
      timeout: 15000,
      headers: {
        "Accept": "application/json,text/plain,*/*",
        "User-Agent": "Mozilla/5.0 lottery-web"
      }
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`lottery source returned ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error("lottery source returned invalid JSON"));
        }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("lottery source timeout"));
    });
  });
}

function extractList(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;

  const candidates = [
    data.data?.data?.list,
    data.data?.list,
    data.result?.data?.list,
    data.result?.list,
    data.lotteryResList,
    data.list,
    data.data,
    data.result
  ];

  return candidates.find(Array.isArray) || [];
}

async function fetchSource(type, page, limit) {
  const url = new URL(SOURCE_URL);
  url.searchParams.set("type", type);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(limit));
  return requestJson(url);
}

async function getLotteryHistory(type, page, limit) {
  const key = `${type}:${page}:${limit}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < CACHE_TTL_MS) return cached.payload;

  const payload = await fetchSource(type, page, limit);
  cache.set(key, { time: Date.now(), payload });
  return payload;
}

module.exports = async function lotteryHandler(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const url = new URL(req.url || "/", "http://localhost");
    const type = url.searchParams.get("type") === "ssq" ? "ssq" : "dlt";
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 20)));
    const data = await getLotteryHistory(type, page, limit);
    const list = extractList(data);

    sendJson(res, 200, {
      ...data,
      proxy: {
        source: "huiniao",
        count: list.length,
        cached: false
      }
    });
  } catch (error) {
    sendJson(res, 502, {
      error: "开奖数据源暂时不可用",
      detail: error.message
    });
  }
};
