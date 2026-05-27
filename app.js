// API 配置
const API_URL = "https://api.huiniao.top/interface/home/lotteryHistory";
const LOTTERY_TYPE = "dlt";

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

function parseNumbers(value) {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (!value) return [];
  return String(value)
    .split(/[,\s+|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

// API 请求
async function fetchLatest() {
  try {
    const response = await fetch(
      `${API_URL}?type=${LOTTERY_TYPE}&page=1&limit=1`
    );
    const data = await response.json();
    return extractLatest(data);
  } catch (error) {
    console.error("获取最新开奖失败:", error);
    return null;
  }
}

async function fetchHistory(queryType, queryValue) {
  try {
    let url = `${API_URL}?type=${LOTTERY_TYPE}&limit=20`;

    if (queryType === "year") {
      // 年份查询需要多页获取
      const results = [];
      for (let page = 1; page <= 10; page++) {
        const response = await fetch(`${url}&page=${page}`);
        const data = await response.json();
        const list = extractList(data);
        if (!list.length) break;

        for (const item of list) {
          const mapped = mapResult(item);
          if (mapped && mapped.drawDate.startsWith(queryValue)) {
            results.push(mapped);
          }
        }

        if (list.length < 20) break;
      }
      return results;
    } else if (queryType === "issue") {
      // 按期号查询
      for (let page = 1; page <= 50; page++) {
        const response = await fetch(`${url}&page=${page}`);
        const data = await response.json();
        const list = extractList(data);
        if (!list.length) break;

        const found = list.find(
          (item) => String(item.code || item.issue) === String(queryValue)
        );
        if (found) return [mapResult(found)];

        if (list.length < 20) break;
      }
      return [];
    } else {
      // 按日期查询
      for (let page = 1; page <= 10; page++) {
        const response = await fetch(`${url}&page=${page}`);
        const data = await response.json();
        const list = extractList(data);
        if (!list.length) break;

        const found = list.find((item) => {
          const date = String(item.day || item.drawDate || "").slice(0, 10);
          return date === queryValue;
        });
        if (found) return [mapResult(found)];

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

  // 查询上月、上六月、上年同日
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

function extractLatest(data) {
  if (!data) return null;
  const list = extractList(data);
  return list.length ? mapResult(list[0]) : null;
}

function mapResult(raw) {
  if (!raw) return null;

  const frontNumbers = [raw.one, raw.two, raw.three, raw.four, raw.five]
    .filter(Boolean)
    .map(String);
  const backNumbers = [raw.six, raw.seven].filter(Boolean).map(String);

  return {
    issue: String(raw.code || raw.issue || "").trim(),
    drawDate: String(raw.day || raw.drawDate || raw.date || "").slice(0, 10),
    frontNumbers,
    backNumbers,
    numbers: frontNumbers.concat(backNumbers),
    salesAmount: raw.salesAmount || "",
    poolAmount: raw.poolAmount || "",
    raw
  };
}

// UI 渲染
function renderBalls(frontNumbers, backNumbers, size = "normal") {
  const ballSize = size === "small" ? "small" : "";
  return `
    <div class="numbers">
      ${frontNumbers.map((n) => `<span class="ball red ${ballSize}">${n}</span>`).join("")}
      <span class="separator">|</span>
      ${backNumbers.map((n) => `<span class="ball blue ${ballSize}">${n}</span>`).join("")}
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
      ${results
        .map(
          (r) => `
        <div class="history-item" onclick="showDetail('${r.issue}', '${r.drawDate}')">
          <div class="draw-header">
            <div class="draw-info">
              <strong>第 ${r.issue} 期</strong>
              <span>${r.drawDate}</span>
            </div>
          </div>
          ${renderBalls(r.frontNumbers, r.backNumbers, "small")}
        </div>
      `
        )
        .join("")}
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
      ${results
        .map(
          (item) => `
        <div class="same-day-item">
          <h3>
            ${item.label} (${item.targetDate})
          </h3>
          ${
            item.result
              ? renderBalls(item.result.frontNumbers, item.result.backNumbers, "small")
              : `<div class="empty">${item.message || "无数据"}</div>`
          }
        </div>
      `
        )
        .join("")}
    </div>
  `;
}

async function showDetail(issue, date) {
  const modal = document.getElementById("detail-modal");
  const content = document.getElementById("detail-content");

  content.innerHTML = '<div class="loading">加载中...</div>';
  modal.classList.add("active");

  // 获取详细数据
  const results = await fetchHistory("issue", issue);
  const result = results.length ? results[0] : null;

  if (!result) {
    content.innerHTML = '<div class="error">未找到该期详情</div>';
    return;
  }

  content.innerHTML = `
    <h2>第 ${result.issue} 期详情</h2>
    <p>开奖日期: ${result.drawDate}</p>
    ${renderBalls(result.frontNumbers, result.backNumbers)}
    <div class="draw-meta">
      ${result.salesAmount ? `<div>销售额: ${result.salesAmount}</div>` : ""}
      ${result.poolAmount ? `<div>奖池: ${result.poolAmount}</div>` : ""}
    </div>
  `;
}

// 事件处理
function initEventListeners() {
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

  // 关闭模态框
  document.querySelector(".close-btn").addEventListener("click", () => {
    document.getElementById("detail-modal").classList.remove("active");
  });

  document.getElementById("detail-modal").addEventListener("click", (e) => {
    if (e.target.id === "detail-modal") {
      document.getElementById("detail-modal").classList.remove("active");
    }
  });
}

// 初始化
async function init() {
  // 设置默认日期
  const today = formatDate(new Date());
  document.getElementById("query-date").value = today;
  document.getElementById("base-date").value = today;

  // 初始化事件监听
  initEventListeners();

  // 加载最新开奖
  const latest = await fetchLatest();
  renderLatest(latest);
}

// 页面加载完成后初始化
document.addEventListener("DOMContentLoaded", init);
