const API_URL = "https://api.huiniao.top/interface/home/lotteryHistory";

const LOTTERY_CONFIG = {
  dlt: { name: "大乐透", type: "dlt", frontCount: 5, backCount: 2, frontMax: 35, backMax: 12, accent: "red" },
  ssq: { name: "双色球", type: "ssq", frontCount: 6, backCount: 1, frontMax: 33, backMax: 16, accent: "blue" }
};

const FALLBACK_DATA = {
  dlt: [
    ["26058", "2026-05-27", "07", "12", "13", "18", "34", "01", "05"],
    ["26057", "2026-05-25", "05", "12", "13", "22", "26", "06", "10"],
    ["26056", "2026-05-22", "03", "08", "17", "23", "31", "01", "10"],
    ["26055", "2026-05-20", "01", "09", "14", "21", "33", "03", "12"],
    ["26054", "2026-05-18", "02", "07", "10", "16", "30", "04", "09"],
    ["26053", "2026-05-15", "06", "19", "24", "32", "35", "02", "07"],
    ["26052", "2026-05-13", "04", "13", "15", "20", "26", "05", "09"],
    ["26051", "2026-05-11", "08", "12", "18", "25", "29", "03", "11"]
  ],
  ssq: [
    ["2026058", "2026-05-27", "03", "08", "12", "16", "23", "27", "06"],
    ["2026057", "2026-05-25", "04", "11", "15", "19", "22", "31", "10"],
    ["2026056", "2026-05-22", "02", "07", "13", "18", "26", "33", "12"],
    ["2026055", "2026-05-20", "01", "09", "14", "20", "25", "30", "03"],
    ["2026054", "2026-05-18", "05", "10", "17", "21", "28", "32", "09"],
    ["2026053", "2026-05-15", "06", "12", "16", "24", "29", "31", "07"],
    ["2026052", "2026-05-13", "03", "13", "18", "20", "26", "30", "11"],
    ["2026051", "2026-05-11", "08", "15", "19", "22", "27", "33", "05"]
  ]
};

let currentType = "dlt";
let trendRows = [];
let statArea = "front";
let missArea = "front";
let currentAnalysis = "trend";
let statsPeriod = 10;
let aiMessages = [];
let aiThinking = false;
let aiSelectedHistory = 0;
const AI_MODEL_OPTIONS = {
  "deepseek-chat": { provider: "deepseek", model: "deepseek-chat", label: "DeepSeek" },
  "claude-sonnet": { provider: "anthropic", model: "claude-sonnet-4-5-20250929", label: "Claude" },
  "gemini-flash": { provider: "gemini", model: "gemini-2.5-flash", label: "Gemini" },
  "gpt-4o": { provider: "openai", model: "gpt-4o", label: "ChatGPT" }
};
const AI_PROVIDER_DEFAULTS = {
  deepseek: {
    apiUrl: "https://api.deepseek.com/chat/completions",
    model: "deepseek-chat"
  },
  openai: {
    apiUrl: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o"
  },
  anthropic: {
    apiUrl: "https://api.anthropic.com/v1/messages",
    model: "claude-sonnet-4-5-20250929"
  },
  gemini: {
    apiUrl: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    model: "gemini-2.5-flash"
  },
  custom: {
    apiUrl: "",
    model: ""
  }
};
let aiSelectedModel = localStorage.getItem("lottery-ai-model") || "deepseek-chat";
if (!AI_MODEL_OPTIONS[aiSelectedModel]) aiSelectedModel = "deepseek-chat";
let aiUserConfig = loadAIUserConfig();
let trendPanelState = {
  width: 0,
  rows: 26
};
let trendResizeSession = null;
const TREND_MIN_ROWS = 14;
const TREND_MAX_ROWS = 50;
const TREND_ROW_HEIGHT = 22;
const TREND_HEADER_HEIGHT = 48;
const TREND_CUSTOM_ROWS = 3;
const TREND_CUSTOM_ROW_HEIGHT = 24;
const TREND_FOOTER_HEIGHT = 24;
const TREND_STATS_ROW_HEIGHT = 22;
const TREND_STATS_ROWS = 3;
const TREND_MIN_WIDTH = 1180;

const SEGMENT_MAP = {
  dlt: {
    front: [[1, 9], [10, 19], [20, 29], [30, 35]],
    back: [[1, 6], [7, 12]]
  },
  ssq: {
    front: [[1, 11], [12, 22], [23, 33]],
    back: [[1, 8], [9, 16]]
  }
};

function getSegments(type, area) {
  return SEGMENT_MAP[type]?.[area] || [];
}

function getSegmentIndex(type, area, num) {
  const value = Number(num);
  const segments = getSegments(type, area);
  for (let i = 0; i < segments.length; i++) {
    if (value >= segments[i][0] && value <= segments[i][1]) return i;
  }
  return 0;
}

function computeColumnStats(allResults, range, field) {
  const counts = Object.fromEntries(range.map((num) => [num, 0]));
  const currentMiss = Object.fromEntries(range.map((num) => [num, allResults.length]));
  const maxMiss = Object.fromEntries(range.map((num) => [num, 0]));
  const lastHitRow = Object.fromEntries(range.map((num) => [num, -1]));

  const chronological = [...allResults].reverse();
  chronological.forEach((row, rowIndex) => {
    const picked = new Set(row[field]);
    range.forEach((num) => {
      if (picked.has(num)) {
        counts[num] += 1;
        if (lastHitRow[num] >= 0) {
          const gap = rowIndex - lastHitRow[num] - 1;
          if (gap > maxMiss[num]) maxMiss[num] = gap;
        }
        lastHitRow[num] = rowIndex;
      }
    });
  });

  range.forEach((num) => {
    if (lastHitRow[num] === -1) {
      currentMiss[num] = chronological.length;
      maxMiss[num] = chronological.length;
    } else {
      currentMiss[num] = chronological.length - 1 - lastHitRow[num];
      const tailGap = chronological.length - 1 - lastHitRow[num];
      if (tailGap > maxMiss[num]) maxMiss[num] = tailGap;
    }
  });

  return { counts, currentMiss, maxMiss };
}

function computeRowMetrics(row, type) {
  const cfg = LOTTERY_CONFIG[type];
  const front = row.frontNumbers.map(Number);
  const back = row.backNumbers.map(Number);
  const sum = (arr) => arr.reduce((a, b) => a + b, 0);
  const oddCount = (arr) => arr.filter((n) => n % 2 === 1).length;
  const frontMid = Math.ceil(cfg.frontMax / 2);
  const small = front.filter((n) => n <= frontMid).length;
  const big = front.length - small;
  const fo = oddCount(front);
  const bo = oddCount(back);
  return {
    frontSum: sum(front),
    frontOddEven: `${fo}:${front.length - fo}`,
    frontBigSmall: `${big}:${small}`,
    backSum: sum(back),
    backOddEven: `${bo}:${back.length - bo}`
  };
}

function getHeatLevel(count, maxCount) {
  if (!count) return 0;
  if (maxCount <= 1) return 3;
  const ratio = count / maxCount;
  if (ratio >= 0.85) return 5;
  if (ratio >= 0.65) return 4;
  if (ratio >= 0.45) return 3;
  if (ratio >= 0.25) return 2;
  return 1;
}

function createCustomRowState() {
  return {
    front: new Set(),
    back: new Set()
  };
}

const customPickState = {
  dlt: [createCustomRowState(), createCustomRowState(), createCustomRowState()],
  ssq: [createCustomRowState(), createCustomRowState(), createCustomRowState()]
};

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDate(date) {
  return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("-");
}

async function fetchList(type, page = 1, limit = 20) {
  try {
    const response = await fetch(`${API_URL}?type=${type}&page=${page}&limit=${limit}`);
    const data = await response.json();
    return extractList(data);
  } catch (error) {
    console.warn("接口请求失败，使用本地演示数据:", error);
    return page === 1 ? getFallbackRawList(type, limit) : [];
  }
}

async function fetchLatestByType(type) {
  const config = LOTTERY_CONFIG[type];
  try {
    const response = await fetch(`${API_URL}?type=${type}&page=1&limit=1`);
    const data = await response.json();
    const raw = data.last || data.data?.last || extractList(data)[0];
    return mapResult(raw, config, type);
  } catch (error) {
    console.error("获取最新开奖失败:", error);
    return null;
  }
}

async function fetchHistory(queryType, queryValue) {
  const config = LOTTERY_CONFIG[currentType];
  try {
    if (queryType === "year") {
      const results = [];
      for (let page = 1; page <= 20; page++) {
        const list = await fetchList(config.type, page, 20);
        if (!list.length) break;

        list.forEach((item) => {
          const mapped = mapResult(item, config, currentType);
          if (mapped && mapped.drawDate.startsWith(queryValue)) results.push(mapped);
        });

        if (list.length < 20) break;
      }
      return results;
    }

    const maxPage = queryType === "issue" ? 100 : 10;
    for (let page = 1; page <= maxPage; page++) {
      const list = await fetchList(config.type, page, 20);
      if (!list.length) break;

      const found = list.find((item) => {
        if (queryType === "issue") {
          return String(item.code || item.issue) === String(queryValue);
        }
        const date = String(item.day || item.drawDate || "").slice(0, 10);
        return date === queryValue;
      });

      if (found) return [mapResult(found, config, currentType)];
      if (list.length < 20) break;
    }
    return [];
  } catch (error) {
    console.error("查询历史失败:", error);
    return [];
  }
}

async function fetchSameDay(baseDate) {
  const results = [];
  const date = new Date(baseDate);
  const periods = [
    { months: -1, label: "上月同日" },
    { months: -6, label: "六个月前同日" },
    { months: -12, label: "一年前同日" }
  ];

  for (const period of periods) {
    const target = new Date(date);
    target.setMonth(target.getMonth() + period.months);
    const targetDate = formatDate(target);
    const history = await fetchHistory("date", targetDate);
    results.push({
      label: period.label,
      targetDate,
      result: history[0] || null,
      message: history.length ? null : "当日无开奖"
    });
  }
  return results;
}

async function fetchTrend(limit) {
  const config = LOTTERY_CONFIG[currentType];
  try {
    const list = await fetchList(config.type, 1, limit);
    return list
      .map((item) => mapResult(item, config, currentType))
      .filter(Boolean);
  } catch (error) {
    console.error("获取走势图失败:", error);
    return [];
  }
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

function getFallbackRawList(type, limit) {
  return (FALLBACK_DATA[type] || []).slice(0, limit).map((row) => ({
    code: row[0],
    day: row[1],
    one: row[2],
    two: row[3],
    three: row[4],
    four: row[5],
    five: row[6],
    six: row[7],
    seven: row[8],
    poolAmount: type === "dlt" ? "832000000" : "247000000"
  }));
}

function mapResult(raw, config, type) {
  if (!raw) return null;

  const allFields = [raw.one, raw.two, raw.three, raw.four, raw.five, raw.six, raw.seven]
    .filter(Boolean)
    .map((value) => pad(value));

  return {
    lotteryType: type,
    lotteryName: config.name,
    issue: String(raw.code || raw.issue || "").trim(),
    drawDate: String(raw.day || raw.drawDate || raw.date || "").slice(0, 10),
    frontNumbers: allFields.slice(0, config.frontCount),
    backNumbers: allFields.slice(config.frontCount, config.frontCount + config.backCount),
    salesAmount: raw.salesAmount || "",
    poolAmount: raw.poolAmount || raw.pool || "",
    raw
  };
}

function renderBalls(frontNumbers, backNumbers, size = "normal") {
  const cls = size === "small" ? "small" : "";
  return `
    <div class="numbers">
      ${frontNumbers.map((n) => `<span class="ball red ${cls}">${n}</span>`).join("")}
      <span class="separator">|</span>
      ${backNumbers.map((n) => `<span class="ball blue ${cls}">${n}</span>`).join("")}
    </div>
  `;
}

function formatPool(value) {
  if (!value) return "暂无";
  const num = Number(String(value).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(num) || num <= 0) return String(value);
  if (num > 100000000) return `${(num / 100000000).toFixed(2)} 亿元`;
  if (num > 10000) return `${(num / 10000).toFixed(2)} 万元`;
  return String(value);
}

function renderLatestComparison(results) {
  const container = document.getElementById("latest-comparison");
  container.innerHTML = ["dlt", "ssq"].map((type) => {
    const result = results[type];
    const config = LOTTERY_CONFIG[type];
    if (!result) {
      return `<article class="latest-card"><div class="empty">${config.name}暂无数据</div></article>`;
    }

    return `
      <article class="latest-card">
        <h2 class="lottery-title ${config.accent}">${config.name}</h2>
        <div class="draw-line">
          <strong>第 ${result.issue} 期</strong>
          <span>${result.drawDate}</span>
        </div>
        ${renderBalls(result.frontNumbers, result.backNumbers)}
        <p class="pool ${config.accent === "blue" ? "blue" : ""}">奖池金额:<strong>${formatPool(result.poolAmount)}</strong></p>
      </article>
    `;
  }).join("");
}

function renderHistoryList(results) {
  const container = document.getElementById("history-result");
  if (!results.length) {
    container.innerHTML = '<div class="empty">未查询到结果</div>';
    return;
  }

  container.innerHTML = `
    <div class="history-list">
      ${results.map((r) => `
        <button class="history-item" onclick="showDetail('${r.issue}')">
          <div class="draw-info">
            <strong>第 ${r.issue} 期</strong>
            <span>${r.drawDate}</span>
          </div>
          ${renderBalls(r.frontNumbers, r.backNumbers, "small")}
        </button>
      `).join("")}
    </div>
  `;
}

function renderSameDay(results) {
  const container = document.getElementById("same-day-result");
  if (!results.length) {
    container.innerHTML = '<div class="empty">请先选择基准日期</div>';
    return;
  }

  container.innerHTML = `
    <div class="same-day-grid">
      ${results.map((item) => `
        <div class="same-day-item">
          <div class="draw-info">
            <strong>${item.label}</strong>
            <span>${item.targetDate}</span>
          </div>
          ${item.result
            ? renderBalls(item.result.frontNumbers, item.result.backNumbers, "small")
            : `<div class="empty">${item.message || "无数据"}</div>`}
        </div>
      `).join("")}
    </div>
  `;
}

function getRange(max) {
  return Array.from({ length: max }, (_, index) => pad(index + 1));
}

function getTrendRowsVisible() {
  return Math.max(TREND_MIN_ROWS, Math.min(trendPanelState.rows, TREND_MAX_ROWS));
}

function getTrendShellHeight(rowsVisible) {
  return TREND_HEADER_HEIGHT
    + rowsVisible * TREND_ROW_HEIGHT
    + TREND_STATS_ROWS * TREND_STATS_ROW_HEIGHT
    + TREND_CUSTOM_ROWS * TREND_CUSTOM_ROW_HEIGHT
    + TREND_FOOTER_HEIGHT
    + 4;
}

function ensureTrendPanelWidth() {
  if (trendPanelState.width > 0) return;
  const shell = document.getElementById("trend-view");
  const available = shell ? shell.getBoundingClientRect().width - 40 : 1200;
  trendPanelState.width = Math.max(TREND_MIN_WIDTH, Math.floor(available));
}

function getCurrentCustomRowState() {
  return customPickState[currentType];
}

function buildTrendCustomRows(config) {
  const rows = getCurrentCustomRowState();
  const frontRange = getRange(config.frontMax);
  const backRange = getRange(config.backMax);
  const gridColumns = `72px 84px repeat(${frontRange.length}, 30px) repeat(${backRange.length}, 30px)`;

  return `
    <div class="trend-custom-rows">
      ${rows.map((rowState, rowIndex) => {
        const selectedCount = rowState.front.size + rowState.back.size;
        return `
          <div class="trend-custom-row" data-row-index="${rowIndex}" style="grid-template-columns:${gridColumns};">
            <div class="trend-custom-label">预选${rowIndex + 1}</div>
            <div class="trend-custom-summary">
              <span>已选 ${selectedCount}</span>
              <button type="button" class="trend-row-clear" data-row-clear="${rowIndex}">清空</button>
            </div>
            ${frontRange.map((num) => `
              <button
                type="button"
                class="custom-number-cell front ${rowState.front.has(num) ? "selected" : ""}"
                data-row-index="${rowIndex}"
                data-zone="front"
                data-num="${num}"
              ><span>${num}</span></button>
            `).join("")}
            ${backRange.map((num) => `
              <button
                type="button"
                class="custom-number-cell back ${rowState.back.has(num) ? "selected" : ""}"
                data-row-index="${rowIndex}"
                data-zone="back"
                data-num="${num}"
              ><span>${num}</span></button>
            `).join("")}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderTrendChart(results) {
  const container = document.getElementById("trend-result");
  const config = LOTTERY_CONFIG[currentType];
  document.getElementById("trend-title").textContent = `${config.name}走势`;

  if (!results.length) {
    container.innerHTML = '<div class="empty">暂无走势图数据</div>';
    return;
  }

  ensureTrendPanelWidth();
  const visibleCount = Math.min(getTrendRowsVisible(), results.length);
  const ordered = [...results].slice(0, visibleCount).reverse();
  const frontRange = getRange(config.frontMax);
  const backRange = getRange(config.backMax);
  const panelHeight = getTrendShellHeight(visibleCount);

  const frontStats = computeColumnStats(ordered.slice().reverse(), frontRange, "frontNumbers");
  const backStats = computeColumnStats(ordered.slice().reverse(), backRange, "backNumbers");

  const renderCells = (range, picked, area) => {
    return range.map((num) => {
      const active = picked.includes(num);
      const segIdx = getSegmentIndex(currentType, area, num);
      const cls = `trend-cell area-${area} seg-${segIdx}${active ? " active" : ""}`;
      return `
        <td class="${cls}" data-area="${area}" data-num="${num}">
          ${active ? `<span class="trend-hit ${area === "front" ? "red" : "blue"}">${num}</span>` : ""}
        </td>
      `;
    }).join("");
  };

  const renderNumberHeader = (range, area) => range.map((num) => {
    const segIdx = getSegmentIndex(currentType, area, num);
    return `<th class="num-th area-${area} seg-${segIdx}">${num}</th>`;
  }).join("");

  const renderGroupHeader = (area) => {
    const segs = getSegments(currentType, area);
    return segs.map((seg, idx) => {
      const span = seg[1] - seg[0] + 1;
      return `<th class="seg-group area-${area} seg-${idx}" colspan="${span}">${seg[0]}-${seg[1]}</th>`;
    }).join("");
  };

  const METRIC_DEFS = [
    { key: "frontSum", label: "前和", cls: "metric-front-sum" },
    { key: "frontOddEven", label: "前奇偶", cls: "metric-odd" },
    { key: "frontBigSmall", label: "前大小", cls: "metric-bs" },
    { key: "backSum", label: "后和", cls: "metric-back-sum" },
    { key: "backOddEven", label: "后奇偶", cls: "metric-odd" }
  ];

  const renderMetricCells = (result) => {
    const m = computeRowMetrics(result, currentType);
    return METRIC_DEFS.map((def) => `<td class="metric-cell ${def.cls}">${m[def.key]}</td>`).join("");
  };

  const occurrenceCell = (stats, num) => {
    const c = stats.counts[num];
    return { text: c || "", cls: c ? "occ" : "muted" };
  };
  const maxMissCell = (stats, num) => {
    const v = stats.maxMiss[num];
    return { text: v || "", cls: v ? "max-miss" : "muted" };
  };
  const currentMissCell = (stats, num) => {
    const v = stats.currentMiss[num];
    let cls = "cur-miss";
    if (v >= 10) cls += " warn-hot";
    else if (v === 0) cls += " warn-fresh";
    return { text: v === 0 ? "0" : v, cls };
  };

  const renderStatRow = (getter, range, area) => range.map((num) => {
    const v = getter(area === "front" ? frontStats : backStats, num);
    return `<td class="stat-cell ${v.cls || ""}">${v.text}</td>`;
  }).join("");

  const blankMetrics = `<td class="metric-cell" colspan="${METRIC_DEFS.length}"></td>`;

  container.innerHTML = `
    <div
      id="trend-resize-shell"
      class="trend-resize-shell ${trendResizeSession ? "resizing" : ""}"
      style="width:${trendPanelState.width}px;height:${panelHeight}px;"
    >
      <div class="trend-track">
        <div class="trend-scroll">
          <table class="trend-table">
            <thead>
              <tr>
                <th class="issue-col" rowspan="2">期号</th>
                <th class="date-col" rowspan="2">日期</th>
                ${renderGroupHeader("front")}
                ${renderGroupHeader("back")}
                <th class="metric-group" colspan="3">前区统计</th>
                <th class="metric-group" colspan="2">后区统计</th>
              </tr>
              <tr>
                ${renderNumberHeader(frontRange, "front")}
                ${renderNumberHeader(backRange, "back")}
                ${METRIC_DEFS.map((d) => `<th class="metric-th ${d.cls}">${d.label}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${ordered.map((result) => `
                <tr>
                  <th class="issue-col">${result.issue.slice(-5)}</th>
                  <td class="date-col">${result.drawDate.slice(5)}</td>
                  ${renderCells(frontRange, result.frontNumbers, "front")}
                  ${renderCells(backRange, result.backNumbers, "back")}
                  ${renderMetricCells(result)}
                </tr>
              `).join("")}
            </tbody>
            <tfoot>
              <tr class="stat-row stat-occ">
                <th class="issue-col stat-label">出现</th>
                <td class="date-col stat-label">次数</td>
                ${renderStatRow(occurrenceCell, frontRange, "front")}
                ${renderStatRow(occurrenceCell, backRange, "back")}
                ${blankMetrics}
              </tr>
              <tr class="stat-row stat-max">
                <th class="issue-col stat-label">最大</th>
                <td class="date-col stat-label">遗漏</td>
                ${renderStatRow(maxMissCell, frontRange, "front")}
                ${renderStatRow(maxMissCell, backRange, "back")}
                ${blankMetrics}
              </tr>
              <tr class="stat-row stat-cur">
                <th class="issue-col stat-label">当前</th>
                <td class="date-col stat-label">遗漏</td>
                ${renderStatRow(currentMissCell, frontRange, "front")}
                ${renderStatRow(currentMissCell, backRange, "back")}
                ${blankMetrics}
              </tr>
            </tfoot>
          </table>
        </div>
        <div class="trend-custom-wrapper">
          ${buildTrendCustomRows(config)}
        </div>
        <div class="trend-footnote">显示 ${ordered.length} 期 · 拖四角缩放（${TREND_MIN_ROWS}-${TREND_MAX_ROWS} 期）· 表尾统计基于当前窗口</div>
        <span class="resize-handle nw" data-resize-handle="nw"></span>
        <span class="resize-handle ne" data-resize-handle="ne"></span>
        <span class="resize-handle sw" data-resize-handle="sw"></span>
        <span class="resize-handle se" data-resize-handle="se"></span>
      </div>
    </div>
  `;

  drawTrendLines(container);
}

function drawTrendLines(container) {
  const scroll = container.querySelector(".trend-scroll");
  const table = container.querySelector(".trend-table");
  if (!scroll || !table) return;
  const bodyRows = [...table.querySelectorAll("tbody tr")];
  if (bodyRows.length < 2) return;

  const tableRect = table.getBoundingClientRect();
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "trend-svg");
  svg.setAttribute("width", table.offsetWidth);
  svg.setAttribute("height", table.offsetHeight);
  svg.setAttribute("viewBox", `0 0 ${table.offsetWidth} ${table.offsetHeight}`);

  const config = LOTTERY_CONFIG[currentType];
  const drawArea = (area, color) => {
    const range = getRange(area === "front" ? config.frontMax : config.backMax);
    range.forEach((num) => {
      const points = [];
      bodyRows.forEach((row, rowIdx) => {
        const cell = row.querySelector(`td[data-area="${area}"][data-num="${num}"] .trend-hit`);
        if (!cell) return;
        const rect = cell.getBoundingClientRect();
        points.push({
          x: rect.left - tableRect.left + rect.width / 2,
          y: rect.top - tableRect.top + rect.height / 2,
          rowIdx
        });
      });

      for (let i = 1; i < points.length; i++) {
        const from = points[i - 1];
        const to = points[i];
        const gap = to.rowIdx - from.rowIdx;
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", from.x);
        line.setAttribute("y1", from.y);
        line.setAttribute("x2", to.x);
        line.setAttribute("y2", to.y);
        line.setAttribute("stroke", color);
        line.setAttribute("stroke-width", gap > 1 ? "1" : "1.4");
        line.setAttribute("opacity", gap > 1 ? "0.22" : "0.42");
        if (gap > 1) line.setAttribute("stroke-dasharray", "3 3");
        svg.appendChild(line);
      }
    });
  };

  drawArea("front", "#ef3346");
  drawArea("back", "#1f66c2");
  scroll.appendChild(svg);
}

function toggleCustomNumber(rowIndex, zone, num) {
  const rows = getCurrentCustomRowState();
  const row = rows[rowIndex];
  if (!row) return;

  const target = row[zone];
  if (target.has(num)) {
    target.delete(num);
  } else {
    target.add(num);
  }
  renderTrendChart(trendRows);
}

function clearCustomRow(rowIndex) {
  const rows = getCurrentCustomRowState();
  const row = rows[rowIndex];
  if (!row) return;
  row.front.clear();
  row.back.clear();
  renderTrendChart(trendRows);
}

function resizeTrendShellFromPointer(event) {
  if (!trendResizeSession) return;

  const dx = event.clientX - trendResizeSession.startX;
  const dy = event.clientY - trendResizeSession.startY;
  const horizontal = trendResizeSession.dirX;
  const vertical = trendResizeSession.dirY;

  if (horizontal !== 0) {
    const nextWidth = trendResizeSession.startWidth + dx * horizontal;
    trendPanelState.width = Math.max(TREND_MIN_WIDTH, Math.round(nextWidth));
  }

  if (vertical !== 0) {
    const deltaRows = Math.round((dy * vertical) / TREND_ROW_HEIGHT);
    trendPanelState.rows = Math.max(TREND_MIN_ROWS, Math.min(TREND_MAX_ROWS, trendResizeSession.startRows + deltaRows));
  }

  renderTrendChart(trendRows);
}

function stopTrendResize() {
  document.getElementById("trend-resize-shell")?.classList.remove("resizing");
  trendResizeSession = null;
  window.removeEventListener("pointermove", resizeTrendShellFromPointer);
  window.removeEventListener("pointerup", stopTrendResize);
}

function startTrendResize(handle, event) {
  event.preventDefault();
  const shell = document.getElementById("trend-resize-shell");
  if (!shell) return;

  const rect = shell.getBoundingClientRect();
  const dirs = {
    nw: { dirX: -1, dirY: -1 },
    ne: { dirX: 1, dirY: -1 },
    sw: { dirX: -1, dirY: 1 },
    se: { dirX: 1, dirY: 1 }
  };

  trendResizeSession = {
    startX: event.clientX,
    startY: event.clientY,
    startWidth: rect.width,
    startRows: getTrendRowsVisible(),
    ...dirs[handle]
  };

  shell.classList.add("resizing");

  window.addEventListener("pointermove", resizeTrendShellFromPointer);
  window.addEventListener("pointerup", stopTrendResize);
}

function calculateStats(results) {
  const config = LOTTERY_CONFIG[currentType];
  const ranges = {
    front: getRange(config.frontMax),
    back: getRange(config.backMax)
  };

  const build = (area) => {
    const counts = Object.fromEntries(ranges[area].map((num) => [num, 0]));
    const lastSeen = Object.fromEntries(ranges[area].map((num) => [num, null]));
    const field = area === "front" ? "frontNumbers" : "backNumbers";

    results.forEach((row, index) => {
      row[field].forEach((num) => {
        counts[num] += 1;
        if (lastSeen[num] === null) lastSeen[num] = index;
      });
    });

    const hot = ranges[area]
      .map((num) => ({ num, count: counts[num] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const miss = ranges[area]
      .map((num) => ({ num, count: lastSeen[num] === null ? results.length : lastSeen[num] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return { hot, miss };
  };

  return { front: build("front"), back: build("back") };
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function calculateNumberStats(results, period) {
  const config = LOTTERY_CONFIG[currentType];
  const scoped = results.slice(0, period);
  const areas = [
    { key: "front", title: "前区号码", max: config.frontMax, field: "frontNumbers" },
    { key: "back", title: "后区号码", max: config.backMax, field: "backNumbers" }
  ];

  return areas.map((area) => {
    const range = getRange(area.max);
    const counts = Object.fromEntries(range.map((num) => [num, 0]));
    scoped.forEach((row) => {
      row[area.field].forEach((num) => {
        counts[num] += 1;
      });
    });

    const rows = range.map((num) => ({ num, count: counts[num] }));
    const countValues = rows.map((row) => row.count);
    const maxCount = Math.max(...countValues);
    const minCount = Math.min(...countValues);

    return {
      ...area,
      rows,
      maxCount,
      minCount,
      medianCount: median(countValues),
      most: rows.filter((row) => row.count === maxCount),
      least: rows.filter((row) => row.count === minCount)
    };
  });
}

function renderNumberStats(results) {
  const container = document.getElementById("number-stats-result");
  const title = document.getElementById("number-stats-title");
  const config = LOTTERY_CONFIG[currentType];
  title.textContent = `${config.name}号码统计`;

  if (!results.length) {
    container.innerHTML = '<div class="empty">暂无统计数据</div>';
    return;
  }

  const stats = calculateNumberStats(results, statsPeriod);
  const effectivePeriod = Math.min(statsPeriod, results.length);
  container.innerHTML = `
    <div class="stats-note">当前统计：${config.name}近 ${effectivePeriod} 期，包含出现最多、出现最少和出现次数中位数。</div>
    ${stats.map((area) => {
    const max = Math.max(...area.rows.map((row) => row.count), 1);
    return `
      <section class="number-stat-block ${area.key}">
        <div class="number-stat-summary">
          <h3>${area.title}</h3>
          <div class="metric-grid">
            <div class="metric-card">
              <span>出现最多</span>
              <strong>${area.most.map((row) => row.num).join("、")}</strong>
              <em>${area.maxCount} 次</em>
            </div>
            <div class="metric-card">
              <span>出现最少</span>
              <strong>${area.least.map((row) => row.num).join("、")}</strong>
              <em>${area.minCount} 次</em>
            </div>
            <div class="metric-card">
              <span>中位数</span>
              <strong>${area.medianCount}</strong>
              <em>近 ${Math.min(statsPeriod, results.length)} 期出现次数</em>
            </div>
          </div>
        </div>
        <div class="number-bars">
          ${area.rows.map((row) => `
            <div class="number-bar-row">
              <span class="num ${area.key === "front" ? "red" : "blue"}">${row.num}</span>
              <span class="bar-track"><i class="bar-fill ${area.key === "back" ? "blue" : ""}" style="width:${Math.max((row.count / max) * 100, row.count ? 12 : 3)}%"></i></span>
              <strong>${row.count}</strong>
            </div>
          `).join("")}
        </div>
      </section>
    `;
  }).join("")}
  `;
}

function calculateDistribution(results) {
  const config = LOTTERY_CONFIG[currentType];
  const areas = [
    { key: "front", title: "红球正态分布", max: config.frontMax, field: "frontNumbers", color: "red" },
    { key: "back", title: "蓝球正态分布", max: config.backMax, field: "backNumbers", color: "blue" }
  ];

  return areas.map((area) => {
    const range = getRange(area.max);
    const counts = Object.fromEntries(range.map((num) => [num, 0]));
    const samples = [];

    results.forEach((row) => {
      row[area.field].forEach((num) => {
        counts[num] += 1;
        samples.push(Number(num));
      });
    });

    const mean = samples.reduce((sum, value) => sum + value, 0) / Math.max(samples.length, 1);
    const variance = samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(samples.length, 1);
    const std = Math.sqrt(variance) || 1;
    const rows = range.map((num) => ({ num, count: counts[num], value: Number(num) }));
    const maxCount = Math.max(...rows.map((row) => row.count), 1);
    const normalValues = rows.map((row) => Math.exp(-0.5 * ((row.value - mean) / std) ** 2));
    const maxNormal = Math.max(...normalValues, 1);

    return {
      ...area,
      rows,
      mean,
      std,
      maxCount,
      normalValues: normalValues.map((value) => (value / maxNormal) * maxCount)
    };
  });
}

function buildNormalPath(area, width, height, padding) {
  const step = area.rows.length > 1 ? (width - padding.left - padding.right) / (area.rows.length - 1) : 0;
  const usableHeight = height - padding.top - padding.bottom;
  return area.normalValues.map((value, index) => {
    const x = padding.left + step * index;
    const y = padding.top + usableHeight - (value / area.maxCount) * usableHeight;
    return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
}

function renderDistribution(results) {
  const container = document.getElementById("distribution-result");
  const title = document.getElementById("distribution-title");
  const config = LOTTERY_CONFIG[currentType];
  title.textContent = `${config.name}分布分析`;

  if (!results.length) {
    container.innerHTML = '<div class="empty">暂无分布数据</div>';
    return;
  }

  const scoped = results.slice(0, Number(document.getElementById("trend-limit").value || 80));
  const width = 1040;
  const height = 260;
  const padding = { top: 28, right: 18, bottom: 34, left: 42 };
  const areas = calculateDistribution(scoped);

  container.innerHTML = areas.map((area) => {
    const step = area.rows.length > 1 ? (width - padding.left - padding.right) / (area.rows.length - 1) : 0;
    const usableHeight = height - padding.top - padding.bottom;
    const barWidth = Math.max(step * 0.45, 8);
    const path = buildNormalPath(area, width, height, padding);
    const gridLines = Array.from({ length: 6 }, (_, index) => {
      const y = padding.top + (usableHeight / 5) * index;
      const value = Math.round(area.maxCount - (area.maxCount / 5) * index);
      return `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" class="chart-grid"></line>
        <text x="8" y="${y + 4}" class="axis-label">${value}</text>`;
    }).join("");

    return `
      <section class="distribution-chart ${area.color}">
        <div class="distribution-chart-head">
          <div>
            <span class="dot ${area.color}"></span>
            <strong>${area.title}（近${scoped.length}期）</strong>
          </div>
          <div class="distribution-legend">
            <span><i class="ring ${area.color}"></i>实际开奖次数</span>
            <span><i class="dash ${area.color}"></i>正态分布曲线</span>
          </div>
        </div>
        <svg class="distribution-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${area.title}">
          ${gridLines}
          <text x="8" y="18" class="axis-title">中奖次数</text>
          ${area.rows.map((row, index) => {
            const x = padding.left + step * index;
            const barHeight = (row.count / area.maxCount) * usableHeight;
            const y = padding.top + usableHeight - barHeight;
            return `
              <rect x="${x - barWidth / 2}" y="${y}" width="${barWidth}" height="${barHeight}" rx="2" class="distribution-bar ${area.color}"></rect>
              <text x="${x}" y="${Math.max(y - 6, 16)}" class="bar-value">${row.count}</text>
              <text x="${x}" y="${height - 10}" class="axis-label bottom">${row.num}</text>
            `;
          }).join("")}
          <path d="${path}" class="normal-line ${area.color}"></path>
          <text x="${width / 2}" y="${height - 2}" class="axis-title bottom">开奖号码</text>
        </svg>
        <div class="distribution-meta">
          <span>均值 ${area.mean.toFixed(2)}</span>
          <span>标准差 ${area.std.toFixed(2)}</span>
          <span>最高次数 ${area.maxCount}</span>
        </div>
      </section>
    `;
  }).join("");
}

function renderRanking(targetId, rows, unit) {
  const container = document.getElementById(targetId);
  const max = Math.max(...rows.map((row) => row.count), 1);
  container.innerHTML = rows.map((row, index) => `
    <div class="rank-row">
      <span class="rank">${index + 1}</span>
      <strong>${row.num}</strong>
      <span>${row.count}${unit}</span>
      <span class="bar-track"><i class="bar-fill" style="width:${Math.max((row.count / max) * 100, 8)}%"></i></span>
    </div>
  `).join("");
}

function renderRepeatSummary(results) {
  const container = document.getElementById("repeat-summary");
  if (!results.length) {
    container.innerHTML = '<div class="empty">暂无数据</div>';
    return;
  }

  let currentRepeat = 0;
  let maxRepeat = 0;
  let maxNumber = "";

  for (let index = 1; index < results.length; index++) {
    const prev = new Set([...results[index - 1].frontNumbers, ...results[index - 1].backNumbers]);
    const current = [...results[index].frontNumbers, ...results[index].backNumbers];
    const repeats = current.filter((num) => prev.has(num));
    if (index === 1) currentRepeat = repeats.length;
    repeats.forEach((num) => {
      if (repeats.length > maxRepeat) {
        maxRepeat = repeats.length;
        maxNumber = num;
      }
    });
  }

  container.innerHTML = `
    <div class="repeat-item">当前连出<strong>${currentRepeat}期</strong></div>
    <div class="repeat-item">最大连出<strong>${maxRepeat}期 ${maxNumber ? `(${maxNumber})` : ""}</strong></div>
  `;
}

function renderStats(results) {
  if (!results.length) return;
  const stats = calculateStats(results);
  renderRanking("hot-ranking", stats[statArea].hot, "次");
  renderRanking("miss-ranking", stats[missArea].miss, "期");
  renderRepeatSummary([...results].reverse());
  renderNumberStats(results);
  renderDistribution(results);
}

async function showDetail(issue) {
  const modal = document.getElementById("detail-modal");
  const content = document.getElementById("detail-content");
  content.innerHTML = '<div class="loading">加载中...</div>';
  modal.classList.add("active");

  const results = await fetchHistory("issue", issue);
  const result = results[0] || null;

  if (!result) {
    content.innerHTML = '<div class="error">未找到该期详情</div>';
    return;
  }

  content.innerHTML = `
    <h2>${result.lotteryName} 第 ${result.issue} 期</h2>
    <p class="draw-info">${result.drawDate}</p>
    ${renderBalls(result.frontNumbers, result.backNumbers)}
    <p class="pool">奖池金额:<strong>${formatPool(result.poolAmount)}</strong></p>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getMessageTime() {
  const now = new Date();
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function getMockPredictionIssue() {
  const latest = trendRows[0]?.issue || (currentType === "dlt" ? "26063" : "2026063");
  const next = Number(latest) + 1;
  return Number.isFinite(next) ? String(next).padStart(latest.length, "0") : latest;
}

function renderAIPredictionCard(prediction = null) {
  const front = prediction?.front || (currentType === "dlt" ? ["03", "15", "21", "29", "33"] : ["03", "08", "15", "21", "26", "31"]);
  const back = prediction?.back || (currentType === "dlt" ? ["06", "11"] : ["10"]);
  return `
    <div class="ai-prediction-card">
      <div class="ai-card-title">预测号码</div>
      <p class="ai-issue">🎯 预测期号：第 ${getMockPredictionIssue()} 期</p>
      <div class="ai-ball-row">
        <span class="ai-ball-label">前区（${front.length}个号）</span>
        <div class="ai-balls">${front.map((num) => `<span class="ai-ball red">${num}</span>`).join("")}</div>
      </div>
      <div class="ai-card-divider"></div>
      <div class="ai-ball-row">
        <span class="ai-ball-label">后区（${back.length}个号）</span>
        <div class="ai-balls">${back.map((num) => `<span class="ai-ball blue">${num}</span>`).join("")}</div>
      </div>
      <p class="ai-disclaimer">⚠️ 以上预测结果仅供参考，购彩有风险，投注需谨慎！</p>
    </div>
  `;
}

function createMockAIReply(text) {
  const cleanText = text.trim();
  if (cleanText.includes("预测")) {
    return {
      role: "ai",
      time: getMessageTime(),
      text: `好的！我将基于最近的开奖数据和算法模型，为您预测下一期${LOTTERY_CONFIG[currentType].name}号码。`,
      card: renderAIPredictionCard()
    };
  }

  if (cleanText.includes("冷热")) {
    return {
      role: "ai",
      time: getMessageTime(),
      text: `从近50期走势看，前区热号集中在 03、15、21、29 一带，冷号可重点观察 07、18、32。后区近期 06、11 活跃度较高，建议采用热号稳胆加冷号补位的组合思路。`
    };
  }

  return {
    role: "ai",
    time: getMessageTime(),
    text: `我已收到你的问题。当前可以围绕历史开奖规律、号码分布、冷热号、奇偶比、大小比和值区间做模拟分析，并生成多组参考方案。`
  };
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function loadAIUserConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem("lottery-ai-user-config") || "{}");
    return {
      mode: saved.mode === "byok" ? "byok" : "mock",
      provider: AI_PROVIDER_DEFAULTS[saved.provider] ? saved.provider : "deepseek",
      apiUrl: typeof saved.apiUrl === "string" ? saved.apiUrl : AI_PROVIDER_DEFAULTS.deepseek.apiUrl,
      apiKey: typeof saved.apiKey === "string" ? saved.apiKey : "",
      model: typeof saved.model === "string" ? saved.model : AI_PROVIDER_DEFAULTS.deepseek.model
    };
  } catch {
    return {
      mode: "mock",
      provider: "deepseek",
      apiUrl: AI_PROVIDER_DEFAULTS.deepseek.apiUrl,
      apiKey: "",
      model: AI_PROVIDER_DEFAULTS.deepseek.model
    };
  }
}

function saveAIUserConfig(config) {
  aiUserConfig = config;
  localStorage.setItem("lottery-ai-user-config", JSON.stringify(config));
}

function getAIRequestConfig() {
  const modelConfig = getSelectedAIModelConfig();
  if (aiUserConfig.mode !== "byok") {
    return {
      mode: "server",
      provider: modelConfig.provider,
      model: modelConfig.model
    };
  }

  return {
    mode: "byok",
    provider: aiUserConfig.provider,
    model: aiUserConfig.model || modelConfig.model,
    apiUrl: aiUserConfig.apiUrl,
    apiKey: aiUserConfig.apiKey
  };
}

function getSelectedAIModelConfig() {
  return AI_MODEL_OPTIONS[aiSelectedModel] || AI_MODEL_OPTIONS["deepseek-chat"];
}

function normalizeAIReply(data, fallbackText) {
  if (!data || typeof data.reply !== "string") return createMockAIReply(fallbackText);
  return {
    role: "ai",
    time: getMessageTime(),
    text: data.reply,
    card: data.prediction ? renderAIPredictionCard(data.prediction) : ""
  };
}

async function requestAIReply(text) {
  const aiRequestConfig = getAIRequestConfig();
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: text,
      lotteryType: currentType,
      lotteryName: LOTTERY_CONFIG[currentType].name,
      ...aiRequestConfig,
      recentResults: trendRows.slice(0, 50)
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(errorText || `AI 接口请求失败：${response.status}`);
  }

  return response.json();
}

function renderAIWelcome() {
  return `
    <div class="ai-welcome">
      <div class="ai-hero-row">
        <div class="ai-avatar large">🤖</div>
        <div>
          <h2>你好，我是大乐透预测助手</h2>
          <p>基于历史开奖数据和智能算法，为您提供专业的大乐透预测分析服务</p>
        </div>
      </div>
      <div class="ai-feature-card">
        <div>✓ 分析近100期开奖规律</div>
        <div>✓ 预测下期可能出现的号码</div>
        <div>✓ 生成多组投注方案</div>
        <div>✓ 分析冷热号趋势</div>
        <div>✓ 分析奇偶比和大小比</div>
      </div>
      <div class="ai-quick-title">你可以尝试问我：</div>
      <div class="ai-quick-actions">
        <button type="button" data-ai-prompt="预测下期号码">🎯 预测下期号码</button>
        <button type="button" data-ai-prompt="分析最近50期">⏱ 分析最近50期</button>
        <button type="button" data-ai-prompt="生成5组方案">📋 生成5组方案</button>
        <button type="button" data-ai-prompt="冷热号分析">🔥 冷热号分析</button>
        <button type="button" data-ai-prompt="和值分析">✦ 和值分析</button>
      </div>
    </div>
  `;
}

function renderAIMessage(message) {
  if (message.role === "user") {
    return `
      <div class="ai-message-row user">
        <div class="ai-message-stack">
          <time>${message.time}</time>
          <div class="ai-bubble user">${escapeHtml(message.text)}</div>
        </div>
        <div class="ai-user-avatar">♡</div>
      </div>
    `;
  }

  return `
    <div class="ai-message-row ai">
      <div class="ai-avatar small">🤖</div>
      <div class="ai-message-stack">
        <div class="ai-bubble ai">
          <p>${escapeHtml(message.text)}</p>
          ${message.card || ""}
        </div>
        <time>${message.time}</time>
      </div>
    </div>
  `;
}

function renderAIThinking() {
  return `
    <div class="ai-message-row ai">
      <div class="ai-avatar small">🤖</div>
      <div class="ai-bubble ai thinking" aria-label="AI 思考中">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
}

function renderAIChat() {
  const container = document.getElementById("ai-chat-content");
  if (!container) return;
  const messages = aiMessages.map(renderAIMessage).join("");
  container.innerHTML = aiMessages.length || aiThinking
    ? `${messages}${aiThinking ? renderAIThinking() : ""}`
    : renderAIWelcome();

  const scroll = document.getElementById("ai-chat-scroll");
  if (scroll) scroll.scrollTop = scroll.scrollHeight;
}

function setAISendState() {
  const input = document.getElementById("ai-message-input");
  const send = document.getElementById("ai-send-btn");
  if (!input || !send) return;
  send.classList.toggle("ready", input.value.trim().length > 0);
}

async function sendAIMessage(text) {
  const content = text.trim();
  if (!content || aiThinking) return;
  const input = document.getElementById("ai-message-input");
  if (input) input.value = "";
  setAISendState();

  aiMessages.push({ role: "user", time: getMessageTime(), text: content });
  renderAIChat();

  await delay(1200);
  aiThinking = true;
  renderAIChat();

  try {
    const data = await requestAIReply(content);
    await delay(800);
    aiMessages.push(normalizeAIReply(data, content));
  } catch (error) {
    console.warn("AI 接口不可用，使用本地模拟回复:", error);
    await delay(800);
    aiMessages.push(createMockAIReply(content));
  } finally {
    aiThinking = false;
    renderAIChat();
  }
}

function selectAIHistory(button) {
  aiSelectedHistory = Number(button.dataset.historyIndex || 0);
  document.querySelectorAll(".ai-history-item").forEach((item) => {
    item.classList.toggle("active", Number(item.dataset.historyIndex || 0) === aiSelectedHistory);
  });
}

function initAIModelSelect() {
  const select = document.getElementById("ai-model-select");
  if (!select) return;
  select.value = aiSelectedModel;
  select.addEventListener("change", () => {
    aiSelectedModel = AI_MODEL_OPTIONS[select.value] ? select.value : "deepseek-chat";
    localStorage.setItem("lottery-ai-model", aiSelectedModel);
  });
}

function fillAISettingsForm() {
  const mode = document.getElementById("ai-api-mode");
  const provider = document.getElementById("ai-provider");
  const apiUrl = document.getElementById("ai-api-url");
  const model = document.getElementById("ai-api-model");
  const apiKey = document.getElementById("ai-api-key");
  if (!mode || !provider || !apiUrl || !model || !apiKey) return;

  mode.value = aiUserConfig.mode;
  provider.value = aiUserConfig.provider;
  apiUrl.value = aiUserConfig.apiUrl;
  model.value = aiUserConfig.model;
  apiKey.value = aiUserConfig.apiKey;
}

function openAISettings() {
  fillAISettingsForm();
  document.getElementById("ai-settings-modal").classList.add("active");
}

function closeAISettings() {
  document.getElementById("ai-settings-modal").classList.remove("active");
}

function applyProviderDefaults(providerValue) {
  const defaults = AI_PROVIDER_DEFAULTS[providerValue] || AI_PROVIDER_DEFAULTS.deepseek;
  document.getElementById("ai-api-url").value = defaults.apiUrl;
  document.getElementById("ai-api-model").value = defaults.model;
}

function initAISettings() {
  document.getElementById("ai-settings-btn").addEventListener("click", openAISettings);
  document.querySelector(".ai-settings-close").addEventListener("click", closeAISettings);

  document.getElementById("ai-settings-modal").addEventListener("click", (event) => {
    if (event.target.id === "ai-settings-modal") closeAISettings();
  });

  document.getElementById("ai-provider").addEventListener("change", (event) => {
    applyProviderDefaults(event.target.value);
  });

  document.getElementById("ai-clear-settings").addEventListener("click", () => {
    localStorage.removeItem("lottery-ai-user-config");
    aiUserConfig = loadAIUserConfig();
    fillAISettingsForm();
  });

  document.getElementById("ai-settings-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const provider = document.getElementById("ai-provider").value;
    const defaults = AI_PROVIDER_DEFAULTS[provider] || AI_PROVIDER_DEFAULTS.deepseek;
    saveAIUserConfig({
      mode: document.getElementById("ai-api-mode").value === "byok" ? "byok" : "mock",
      provider,
      apiUrl: document.getElementById("ai-api-url").value.trim() || defaults.apiUrl,
      apiKey: document.getElementById("ai-api-key").value.trim(),
      model: document.getElementById("ai-api-model").value.trim() || defaults.model
    });
    closeAISettings();
  });
}

function syncTypeButtons() {
  document.querySelectorAll(".seg-btn, .nav-tab.lottery-switch").forEach((button) => {
    button.classList.toggle("active", button.dataset.type === currentType);
  });
  if (currentAnalysis === "ai") {
    document.querySelectorAll(".nav-tab.lottery-switch").forEach((button) => button.classList.remove("active"));
  }
}

function switchType(type) {
  if (!LOTTERY_CONFIG[type]) return;
  const shouldLeaveAI = currentAnalysis === "ai";
  if (type === currentType) {
    if (shouldLeaveAI) switchAnalysis("trend");
    return;
  }
  currentType = type;
  syncTypeButtons();
  loadTrend();
  if (shouldLeaveAI) switchAnalysis("trend");
}

function switchAnalysis(view) {
  currentAnalysis = view || "trend";

  document.querySelectorAll("[data-analysis]").forEach((button) => {
    button.classList.toggle("active", button.dataset.analysis === currentAnalysis);
  });

  document.querySelectorAll(".analysis-view").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `${currentAnalysis}-view`);
  });

  const controls = document.querySelector(".trend-controls");
  controls.classList.toggle("stats-mode", currentAnalysis !== "trend");
  controls.classList.toggle("ai-hidden", currentAnalysis === "ai");
  syncTypeButtons();
  if (currentAnalysis === "ai") renderAIChat();
}

function initEventListeners() {
  document.querySelectorAll(".lottery-switch, .seg-btn").forEach((button) => {
    button.addEventListener("click", () => switchType(button.dataset.type));
  });

  document.getElementById("trend-limit").addEventListener("change", loadTrend);

  document.getElementById("trend-result").addEventListener("pointerdown", (event) => {
    if (currentAnalysis !== "trend") return;
    const handle = event.target.closest("[data-resize-handle]");
    if (!handle) return;
    startTrendResize(handle.dataset.resizeHandle, event);
  });

  document.getElementById("trend-result").addEventListener("click", (event) => {
    if (currentAnalysis !== "trend") return;
    const pick = event.target.closest("[data-row-index][data-zone][data-num]");
    if (pick) {
      toggleCustomNumber(Number(pick.dataset.rowIndex), pick.dataset.zone, pick.dataset.num);
      return;
    }

    const clear = event.target.closest("[data-row-clear]");
    if (clear) {
      clearCustomRow(Number(clear.dataset.rowClear));
    }
  });

  document.querySelectorAll("[data-analysis]").forEach((button) => {
    button.addEventListener("click", () => {
      switchAnalysis(button.dataset.analysis);
      if (button.classList.contains("ai-nav-tab")) {
        document.getElementById("analytics-section").scrollIntoView({ behavior: "smooth" });
      }
    });
  });

  document.querySelectorAll("[data-history-index]").forEach((button) => {
    button.addEventListener("click", () => selectAIHistory(button));
  });

  initAIModelSelect();
  initAISettings();

  document.getElementById("ai-clear-history").addEventListener("click", () => {
    aiMessages = [];
    aiThinking = false;
    renderAIChat();
  });

  document.getElementById("ai-input-form").addEventListener("submit", (event) => {
    event.preventDefault();
    sendAIMessage(document.getElementById("ai-message-input").value);
  });

  document.getElementById("ai-message-input").addEventListener("input", setAISendState);

  document.getElementById("ai-chat-content").addEventListener("click", (event) => {
    const button = event.target.closest("[data-ai-prompt]");
    if (!button) return;
    sendAIMessage(button.dataset.aiPrompt);
  });

  document.getElementById("top-stats-link").addEventListener("click", (event) => {
    event.preventDefault();
    switchAnalysis("numbers");
    document.getElementById("analytics-section").scrollIntoView({ behavior: "smooth" });
  });

  document.querySelectorAll("[data-period]").forEach((button) => {
    button.addEventListener("click", () => {
      statsPeriod = Number(button.dataset.period);
      document.querySelectorAll("[data-period]").forEach((item) => item.classList.toggle("active", item === button));
      renderNumberStats(trendRows);
    });
  });

  document.querySelectorAll("[data-stat-area]").forEach((button) => {
    button.addEventListener("click", () => {
      statArea = button.dataset.statArea;
      document.querySelectorAll("[data-stat-area]").forEach((item) => item.classList.toggle("active", item === button));
      renderStats(trendRows);
    });
  });

  document.querySelectorAll("[data-miss-area]").forEach((button) => {
    button.addEventListener("click", () => {
      missArea = button.dataset.missArea;
      document.querySelectorAll("[data-miss-area]").forEach((item) => item.classList.toggle("active", item === button));
      renderStats(trendRows);
    });
  });

  const queryTypeSelect = document.getElementById("query-type");
  const dateGroup = document.getElementById("date-group");
  const issueGroup = document.getElementById("issue-group");
  const yearGroup = document.getElementById("year-group");

  queryTypeSelect.addEventListener("change", () => {
    const type = queryTypeSelect.value;
    dateGroup.style.display = type === "date" ? "block" : "none";
    issueGroup.style.display = type === "issue" ? "block" : "none";
    yearGroup.style.display = type === "year" ? "block" : "none";
  });

  document.getElementById("quick-query-btn").addEventListener("click", async () => {
    const issue = document.getElementById("query-issue").value.trim();
    const date = document.getElementById("query-date").value;
    const type = issue ? "issue" : "date";
    const value = issue || date;
    if (!value) return alert("请输入期号或选择日期");
    const results = await fetchHistory(type, value);
    renderHistoryList(results);
    document.getElementById("history-section").scrollIntoView({ behavior: "smooth" });
  });

  document.getElementById("query-btn").addEventListener("click", async () => {
    const type = queryTypeSelect.value;
    const value = type === "date"
      ? document.getElementById("history-date").value
      : type === "issue"
        ? document.getElementById("history-issue").value.trim()
        : document.getElementById("query-year").value;

    if (!value) return alert("请输入查询条件");
    renderHistoryList(await fetchHistory(type, value));
  });

  document.getElementById("same-day-btn").addEventListener("click", async () => {
    const baseDate = document.getElementById("base-date").value;
    if (!baseDate) return alert("请选择基准日期");
    document.getElementById("same-day-result").innerHTML = '<div class="loading">查询中...</div>';
    renderSameDay(await fetchSameDay(baseDate));
  });

  document.querySelector(".close-btn").addEventListener("click", () => {
    document.getElementById("detail-modal").classList.remove("active");
  });

  document.getElementById("detail-modal").addEventListener("click", (event) => {
    if (event.target.id === "detail-modal") {
      event.currentTarget.classList.remove("active");
    }
  });
}

async function loadLatestComparison() {
  const [dlt, ssq] = await Promise.all([fetchLatestByType("dlt"), fetchLatestByType("ssq")]);
  renderLatestComparison({ dlt, ssq });
}

async function loadTrend() {
  const limit = Number(document.getElementById("trend-limit").value || 50);
  document.getElementById("trend-result").innerHTML = '<div class="loading">走势图加载中...</div>';
  trendRows = await fetchTrend(limit);
  renderTrendChart(trendRows);
  renderStats(trendRows);
}

async function init() {
  const today = formatDate(new Date());
  document.getElementById("query-date").value = today;
  document.getElementById("history-date").value = today;
  document.getElementById("base-date").value = today;

  ensureTrendPanelWidth();
  initEventListeners();
  syncTypeButtons();
  await Promise.all([loadLatestComparison(), loadTrend()]);
}

document.addEventListener("DOMContentLoaded", init);
