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

function getVisibleTrendCount() {
  const slider = document.getElementById("trend-height");
  const value = Number(slider?.value || 8);
  return Math.max(8, Math.min(value, 30));
}

function renderTrendChart(results) {
  const container = document.getElementById("trend-result");
  const config = LOTTERY_CONFIG[currentType];
  document.getElementById("trend-title").textContent = `${config.name}走势`;

  if (!results.length) {
    container.innerHTML = '<div class="empty">暂无走势图数据</div>';
    return;
  }

  const visibleCount = getVisibleTrendCount();
  const expandBtn = document.getElementById("trend-expand-btn");
  if (expandBtn) {
    expandBtn.textContent = visibleCount >= 30 ? "收起" : "展开更多";
  }
  const ordered = [...results].slice(0, visibleCount).reverse();
  const frontRange = getRange(config.frontMax);
  const backRange = getRange(config.backMax);

  const renderCells = (range, picked, area) => range.map((num, index) => {
    const active = picked.includes(num);
    const zone = !active && index % 5 === 0 ? " miss-zone" : "";
    return `
      <td class="trend-cell${zone}" data-area="${area}" data-num="${num}">
        ${active ? `<span class="trend-hit ${area === "front" ? "red" : "blue"}">${num}</span>` : index % 2 ? "" : "·"}
      </td>
    `;
  }).join("");

  container.innerHTML = `
    <div class="trend-scroll">
      <table class="trend-table">
        <thead>
          <tr>
            <th class="issue-col" rowspan="2">期号</th>
            <th class="date-col" rowspan="2">日期</th>
            <th colspan="${frontRange.length}">前区号码分布（1 - ${config.frontMax}）</th>
            <th colspan="${backRange.length}">后区号码分布（1 - ${config.backMax}）</th>
          </tr>
          <tr>
            ${frontRange.map((num) => `<th>${num}</th>`).join("")}
            ${backRange.map((num) => `<th>${num}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${ordered.map((result) => `
            <tr>
              <th class="issue-col">${result.issue.slice(-5)}</th>
              <td class="date-col">${result.drawDate.slice(5)}</td>
              ${renderCells(frontRange, result.frontNumbers, "front")}
              ${renderCells(backRange, result.backNumbers, "back")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    <div class="trend-footnote">当前显示近 ${ordered.length} 期，拖动“图表高度”可扩大到最多 30 期。</div>
  `;

  drawTrendLines(container);
}

function drawTrendLines(container) {
  const scroll = container.querySelector(".trend-scroll");
  const table = container.querySelector(".trend-table");
  const rows = [...table.querySelectorAll("tbody tr")];
  if (!scroll || !table || rows.length < 2) return;

  const tableRect = table.getBoundingClientRect();
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "trend-svg");
  svg.setAttribute("width", table.offsetWidth);
  svg.setAttribute("height", table.offsetHeight);
  svg.setAttribute("viewBox", `0 0 ${table.offsetWidth} ${table.offsetHeight}`);

  const buildPoints = (area) => rows.map((row) => {
    const hits = [...row.querySelectorAll(`td[data-area="${area}"] .trend-hit`)];
    return hits.map((hit) => {
      const rect = hit.getBoundingClientRect();
      return {
        x: rect.left - tableRect.left + rect.width / 2,
        y: rect.top - tableRect.top + rect.height / 2
      };
    });
  });

  const appendLines = (pointsByRow, color) => {
    for (let index = 1; index < pointsByRow.length; index++) {
      const prev = pointsByRow[index - 1];
      const current = pointsByRow[index];
      current.forEach((point, pointIndex) => {
        const from = prev[Math.min(pointIndex, prev.length - 1)];
        if (!from) return;
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", from.x);
        line.setAttribute("y1", from.y);
        line.setAttribute("x2", point.x);
        line.setAttribute("y2", point.y);
        line.setAttribute("stroke", color);
        line.setAttribute("stroke-width", "1.5");
        line.setAttribute("opacity", "0.42");
        svg.appendChild(line);
      });
    }
  };

  appendLines(buildPoints("front"), "#ef3346");
  appendLines(buildPoints("back"), "#1f66c2");
  scroll.appendChild(svg);
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

function syncTypeButtons() {
  document.querySelectorAll("[data-type]").forEach((button) => {
    button.classList.toggle("active", button.dataset.type === currentType);
  });
}

function switchType(type) {
  if (!LOTTERY_CONFIG[type] || type === currentType) return;
  currentType = type;
  syncTypeButtons();
  loadTrend();
}

function switchAnalysis(view) {
  if (view === "distribution") {
    currentAnalysis = view;
  } else {
    currentAnalysis = view || "trend";
  }

  document.querySelectorAll("[data-analysis]").forEach((button) => {
    button.classList.toggle("active", button.dataset.analysis === currentAnalysis);
  });

  document.querySelectorAll(".analysis-view").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `${currentAnalysis}-view`);
  });

  document.querySelector(".trend-controls").classList.toggle("stats-mode", currentAnalysis !== "trend");
}

function initEventListeners() {
  document.querySelectorAll(".lottery-switch, .seg-btn").forEach((button) => {
    button.addEventListener("click", () => switchType(button.dataset.type));
  });

  document.getElementById("trend-limit").addEventListener("change", loadTrend);
  document.getElementById("trend-height").addEventListener("input", () => renderTrendChart(trendRows));
  document.getElementById("trend-expand-btn").addEventListener("click", () => {
    const slider = document.getElementById("trend-height");
    slider.value = Number(slider.value) >= 30 ? 8 : 30;
    renderTrendChart(trendRows);
  });

  document.querySelectorAll("[data-analysis]").forEach((button) => {
    button.addEventListener("click", () => switchAnalysis(button.dataset.analysis));
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

  initEventListeners();
  syncTypeButtons();
  await Promise.all([loadLatestComparison(), loadTrend()]);
}

document.addEventListener("DOMContentLoaded", init);
