// API 配置
const API_URL = "https://api.huiniao.top/interface/home/lotteryHistory";

// 彩种配置
const LOTTERY_CONFIG = {
  dlt: { name: "大乐透", type: "dlt", frontCount: 5, backCount: 2, startYear: 2015 },
  ssq: { name: "双色球", type: "ssq", frontCount: 6, backCount: 1, startYear: 2003 }
};

let currentType = "dlt";

// 工具函数
function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDate(date) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-");
}

// API 请求
async function fetchLatest() {
  const config = LOTTERY_CONFIG[currentType];
  try {
    const response = await fetch(`${API_URL}?type=${config.type}&page=1&limit=1`);
    const data = await response.json();
    return extractLatest(data, config);
  } catch (error) {
    console.error("获取最新开奖失败:", error);
    return null;
  }
}

async function fetchHistory(queryType, queryValue) {
  const config = LOTTERY_CONFIG[currentType];
  try {
    let url = `${API_URL}?type=${config.type}&limit=20`;

    if (queryType === "year") {
      const results = [];
      for (let page = 1; page <= 20; page++) {
        const response = await fetch(`${url}&page=${page}`);
        const data = await response.json();
        const list = extractList(data);
        if (!list.length) break;

        for (const item of list) {
          const mapped = mapResult(item, config);
          if (mapped && mapped.drawDate.startsWith(queryValue)) {
            results.push(mapped);
          }
        }
        if (list.length < 20) break;
      }
      return results;
    } else if (queryType === "issue") {
      for (let page = 1; page <= 100; page++) {
        const response = await fetch(`${url}&page=${page}`);
        const data = await response.json();
        const list = extractList(data);
        if (!list.length) break;

        const found = list.find(
          (item) => String(item.code || item.issue) === String(queryValue)
        );
        if (found) return [mapResult(found, config)];
        if (list.length < 20) break;
      }
      return [];
    } else {
      for (let page = 1; page <= 10; page++) {
        const response = await fetch(`${url}&page=${page}`);
        const data = await response.json();
        const list = extractList(data);
        if (!list.length) break;

        const found = list.find((item) => {
          const date = String(item.day || item.drawDate || "").slice(0, 10);
          return date === queryValue;
        });
        if (found) return [mapResult(found, config)];
        if (list.length < 20) break;
      }
      return [];
    }
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
      result: history.length ? history[0] : null,
      message: history.length ? null : "当日无开奖"
    });
  }
  return results;
}

// 数据提取和映射
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

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function extractLatest(data, config) {
  if (!data) return null;

  // 优先取 last 字段（最新开奖）
  if (data.last) return mapResult(data.last, config);
  if (data.data?.last) return mapResult(data.data.last, config);

  const list = extractList(data);
  return list.length ? mapResult(list[0], config) : null;
}

function mapResult(raw, config) {
  if (!raw) return null;

  const allFields = [raw.one, raw.two, raw.three, raw.four, raw.five, raw.six, raw.seven]
    .filter(Boolean)
    .map(String);

  const frontNumbers = allFields.slice(0, config.frontCount);
  const backNumbers = allFields.slice(config.frontCount, config.frontCount + config.backCount);

  return {
    lotteryType: currentType,
    lotteryName: config.name,
    issue: String(raw.code || raw.issue || "").trim(),
    drawDate: String(raw.day || raw.drawDate || raw.date || "").slice(0, 10),
    frontNumbers,
    backNumbers,
    salesAmount: raw.salesAmount || "",
    poolAmount: raw.poolAmount || "",
    raw
  };
}

// UI 渲染
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

function renderLatest(result) {
  const container = document.getElementById("latest-result");
  if (!result) {
    container.innerHTML = '<div class="empty">暂无开奖数据</div>';
    return;
  }

  container.innerHTML = `
    <div class="draw-header">
      <div class="draw-info">
        <span class="lottery-tag">${result.lotteryName}</span>
        <strong>第 ${result.issue} 期</strong>
        <span>${result.drawDate}</span>
      </div>
    </div>
    ${renderBalls(result.frontNumbers, result.backNumbers)}
    <div class="draw-meta">
      ${result.salesAmount ? `<div>销售额: ${result.salesAmount}</div>` : ""}
      ${result.poolAmount ? `<div>奖池: ${result.poolAmount}</div>` : ""}
    </div>
  `;
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
        <div class="history-item" onclick="showDetail('${r.issue}')">
          <div class="draw-header">
            <div class="draw-info">
              <strong>第 ${r.issue} 期</strong>
              <span>${r.drawDate}</span>
            </div>
          </div>
          ${renderBalls(r.frontNumbers, r.backNumbers, "small")}
        </div>
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
          <h3>${item.label} (${item.targetDate})</h3>
          ${item.result
            ? renderBalls(item.result.frontNumbers, item.result.backNumbers, "small")
            : `<div class="empty">${item.message || "无数据"}</div>`}
        </div>
      `).join("")}
    </div>
  `;
}

async function showDetail(issue) {
  const modal = document.getElementById("detail-modal");
  const content = document.getElementById("detail-content");
  content.innerHTML = '<div class="loading">加载中...</div>';
  modal.classList.add("active");

  const results = await fetchHistory("issue", issue);
  const result = results.length ? results[0] : null;

  if (!result) {
    content.innerHTML = '<div class="error">未找到该期详情</div>';
    return;
  }

  content.innerHTML = `
    <h2>${result.lotteryName} 第 ${result.issue} 期</h2>
    <p>开奖日期: ${result.drawDate}</p>
    ${renderBalls(result.frontNumbers, result.backNumbers)}
    <div class="draw-meta">
      ${result.salesAmount ? `<div>销售额: ${result.salesAmount}</div>` : ""}
      ${result.poolAmount ? `<div>奖池: ${result.poolAmount}</div>` : ""}
    </div>
  `;
}

// 彩种切换
function switchType(type) {
  if (type === currentType) return;
  currentType = type;

  document.querySelectorAll(".type-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.type === type);
  });

  loadLatest();
}

// 事件处理
function initEventListeners() {
  // 彩种切换
  document.querySelectorAll(".type-tab").forEach((tab) => {
    tab.addEventListener("click", () => switchType(tab.dataset.type));
  });

  const queryTypeSelect = document.getElementById("query-type");
  const dateGroup = document.getElementById("date-group");
  const issueGroup = document.getElementById("issue-group");
  const yearGroup = document.getElementById("year-group");

  queryTypeSelect.addEventListener("change", () => {
    const type = queryTypeSelect.value;
    dateGroup.style.display = type === "date" ? "flex" : "none";
    issueGroup.style.display = type === "issue" ? "flex" : "none";
    yearGroup.style.display = type === "year" ? "flex" : "none";
  });

  document.getElementById("query-btn").addEventListener("click", async () => {
    const type = queryTypeSelect.value;
    let value;

    if (type === "date") {
      value = document.getElementById("query-date").value;
    } else if (type === "issue") {
      value = document.getElementById("query-issue").value.trim();
    } else {
      value = document.getElementById("query-year").value;
    }

    if (!value) {
      alert("请输入查询条件");
      return;
    }

    const btn = document.getElementById("query-btn");
    btn.disabled = true;
    btn.textContent = "查询中...";

    const results = await fetchHistory(type, value);
    renderHistoryList(results);

    btn.disabled = false;
    btn.textContent = "查询";
  });

  document.getElementById("same-day-btn").addEventListener("click", async () => {
    const baseDate = document.getElementById("base-date").value;
    if (!baseDate) {
      alert("请选择基准日期");
      return;
    }

    const btn = document.getElementById("same-day-btn");
    btn.disabled = true;
    btn.textContent = "查询中...";

    const results = await fetchSameDay(baseDate);
    renderSameDay(results);

    btn.disabled = false;
    btn.textContent = "查询同日";
  });

  document.querySelector(".close-btn").addEventListener("click", () => {
    document.getElementById("detail-modal").classList.remove("active");
  });

  document.getElementById("detail-modal").addEventListener("click", (e) => {
    if (e.target.id === "detail-modal") {
      document.getElementById("detail-modal").classList.remove("active");
    }
  });
}

async function loadLatest() {
  document.getElementById("latest-result").innerHTML = '<div class="loading">加载中...</div>';
  const latest = await fetchLatest();
  renderLatest(latest);
}

// 初始化
async function init() {
  const today = formatDate(new Date());
  document.getElementById("query-date").value = today;
  document.getElementById("base-date").value = today;

  initEventListeners();
  await loadLatest();
}

document.addEventListener("DOMContentLoaded", init);
