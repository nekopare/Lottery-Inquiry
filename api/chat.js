const PROVIDER_CONFIG = {
  deepseek: {
    envKey: "DEEPSEEK_API_KEY",
    modelEnv: "DEEPSEEK_MODEL",
    defaultModel: "deepseek-chat"
  },
  anthropic: {
    envKey: "ANTHROPIC_API_KEY",
    modelEnv: "ANTHROPIC_MODEL",
    defaultModel: "claude-sonnet-4-5-20250929"
  },
  gemini: {
    envKey: "GEMINI_API_KEY",
    modelEnv: "GEMINI_MODEL",
    defaultModel: "gemini-2.5-flash"
  },
  openai: {
    envKey: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
    defaultModel: "gpt-4o"
  }
};

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("请求体过大"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("请求 JSON 格式不正确"));
      }
    });
    req.on("error", reject);
  });
}

function buildSystemPrompt({ lotteryName, lotteryType, recentResults }) {
  const rules = lotteryType === "ssq"
    ? "双色球规则：6个红球，范围 01-33；1个蓝球，范围 01-16。"
    : "大乐透规则：5个前区号码，范围 01-35；2个后区号码，范围 01-12。";

  const recentText = (recentResults || []).slice(0, 20).map((row) => {
    const front = (row.frontNumbers || []).join(" ");
    const back = (row.backNumbers || []).join(" ");
    return `${row.issue || ""} ${row.drawDate || ""} 前区:${front} 后区:${back}`;
  }).join("\n");

  return [
    "你是一个中文彩票数据分析助手，只能做基于历史开奖数据的娱乐性分析。",
    "不要承诺中奖，不要暗示稳赚或高概率命中，必须提醒用户理性购彩。",
    rules,
    `当前彩种：${lotteryName || "大乐透"}`,
    "如果用户要求预测号码，可以给出一组参考号码，并解释冷热号、奇偶比、大小比、和值区间等依据。",
    "请严格返回 JSON，不要返回 Markdown，不要包裹代码块。JSON 格式：",
    '{"reply":"中文分析内容","prediction":{"front":["03","15","21","29","33"],"back":["06","11"]}}',
    "如果不是预测号码问题，可以省略 prediction 字段。",
    "最近开奖数据：",
    recentText || "暂无最近开奖数据"
  ].join("\n");
}

function normalizeModel(provider, requestedModel) {
  const config = PROVIDER_CONFIG[provider] || PROVIDER_CONFIG.deepseek;
  return process.env[config.modelEnv] || requestedModel || config.defaultModel;
}

function normalizeEndpoint(provider, apiUrl) {
  const value = String(apiUrl || "").trim();
  if (value) return value;
  if (provider === "deepseek") return "https://api.deepseek.com/chat/completions";
  if (provider === "openai") return "https://api.openai.com/v1/chat/completions";
  if (provider === "anthropic") return "https://api.anthropic.com/v1/messages";
  if (provider === "gemini") return "";
  return value;
}

function assertAllowedEndpoint(apiUrl) {
  if (!apiUrl) return;
  let parsed;
  try {
    parsed = new URL(apiUrl);
  } catch {
    throw new Error("API URL 格式不正确");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("API URL 必须使用 https");
  }

  const blockedHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
  if (blockedHosts.has(parsed.hostname)) {
    throw new Error("不允许转发到本地地址");
  }

  if (/^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(parsed.hostname)) {
    throw new Error("不允许转发到内网地址");
  }
}

function parseModelJson(text) {
  if (!text) return { reply: "暂时没有获得有效回复，请稍后再试。" };
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return { reply: text };
      }
    }
    return { reply: text };
  }
}

function normalizePrediction(prediction, lotteryType) {
  if (!prediction || !Array.isArray(prediction.front) || !Array.isArray(prediction.back)) return undefined;
  const frontCount = lotteryType === "ssq" ? 6 : 5;
  const backCount = lotteryType === "ssq" ? 1 : 2;
  const pad = (value) => String(value).replace(/[^\d]/g, "").padStart(2, "0").slice(-2);
  return {
    front: prediction.front.slice(0, frontCount).map(pad),
    back: prediction.back.slice(0, backCount).map(pad)
  };
}

function normalizeResponse(raw, lotteryType) {
  const data = typeof raw === "string" ? parseModelJson(raw) : raw;
  return {
    reply: typeof data.reply === "string" ? data.reply : "已完成分析，但回复格式不完整，请重新提问。",
    prediction: normalizePrediction(data.prediction, lotteryType)
  };
}

async function callOpenAICompatible({ provider, apiKey, model, systemPrompt, message, apiUrl }) {
  const endpoint = normalizeEndpoint(provider, apiUrl);
  assertAllowedEndpoint(endpoint);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ]
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `${provider} 请求失败`);
  return data.choices?.[0]?.message?.content || "";
}

async function callAnthropic({ apiKey, model, systemPrompt, message, apiUrl }) {
  const endpoint = normalizeEndpoint("anthropic", apiUrl);
  assertAllowedEndpoint(endpoint);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{ role: "user", content: message }]
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "Claude 请求失败");
  return (data.content || []).map((item) => item.text || "").join("");
}

async function callGemini({ apiKey, model, systemPrompt, message, apiUrl }) {
  let endpoint = String(apiUrl || "").trim();
  if (!endpoint) {
    endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  }
  assertAllowedEndpoint(endpoint);
  const url = new URL(endpoint);
  if (!url.searchParams.has("key")) url.searchParams.set("key", apiKey);
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: message }]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: "application/json"
      }
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "Gemini 请求失败");
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "仅支持 POST 请求" });
    return;
  }

  try {
    const body = await readBody(req);
    const provider = (PROVIDER_CONFIG[body.provider] || body.provider === "custom") ? body.provider : "deepseek";
    const config = PROVIDER_CONFIG[provider];
    const userApiKey = String(body.apiKey || "").trim();
    const apiKey = userApiKey || (config ? process.env[config.envKey] : "");
    const apiUrl = String(body.apiUrl || "").trim();
    if (provider === "custom" && !apiUrl) {
      json(res, 400, { error: "自定义 API 必须填写 API URL" });
      return;
    }

    if (!apiKey) {
      json(res, 503, { error: config ? `缺少环境变量 ${config.envKey} 或用户 API Key` : "缺少用户 API Key" });
      return;
    }

    const message = String(body.message || "").trim();
    if (!message) {
      json(res, 400, { error: "缺少 message" });
      return;
    }

    const model = provider === "custom"
      ? String(body.model || "").trim()
      : normalizeModel(provider, body.model);
    if (!model) {
      json(res, 400, { error: "缺少模型名" });
      return;
    }
    const systemPrompt = buildSystemPrompt(body);
    let text;

    if (provider === "deepseek" || provider === "openai" || provider === "custom") {
      text = await callOpenAICompatible({ provider: provider === "custom" ? "custom" : provider, apiKey, model, systemPrompt, message, apiUrl });
    } else if (provider === "anthropic") {
      text = await callAnthropic({ apiKey, model, systemPrompt, message, apiUrl });
    } else {
      text = await callGemini({ apiKey, model, systemPrompt, message, apiUrl });
    }

    json(res, 200, normalizeResponse(parseModelJson(text), body.lotteryType));
  } catch (error) {
    json(res, 500, { error: error.message || "AI 服务异常" });
  }
};
