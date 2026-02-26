const STORAGE_KEY = "portfolio_web_v1";

const MARKETS = ["KR", "US"];
const SECTORS = ["AI", "Semi", "Biotech", "EV", "Robotics", "Energy", "Space", "SmallCap", "Index", "Cash"];
const TERMS = ["ST", "LT"];

const demoState = {
  netDeposits: 29500000,
  cashBalance: 6737467,
  holdings: [
    {
      id: createId(),
      symbol: "SAMBIO",
      displayName: "Samsung Biologics",
      market: "KR",
      sector: "Biotech",
      term: "LT",
      costBasis: 4080000,
      currentValue: 3702000,
      targetWeight: 20,
      note: "KR biotech long-term"
    },
    {
      id: createId(),
      symbol: "DGMT",
      displayName: "Digen Matrix",
      market: "KR",
      sector: "Biotech",
      term: "LT",
      costBasis: 6704500,
      currentValue: 6756400,
      targetWeight: 18,
      note: "20s semiconductor consolidation thesis"
    },
    {
      id: createId(),
      symbol: "PLTR",
      displayName: "Palantir",
      market: "US",
      sector: "AI",
      term: "LT",
      costBasis: 2170998,
      currentValue: 1967667,
      targetWeight: 10,
      note: "AI data platform core"
    },
    {
      id: createId(),
      symbol: "AMD",
      displayName: "Advanced Micro Devices",
      market: "US",
      sector: "Semi",
      term: "ST",
      costBasis: 4131455,
      currentValue: 3922043,
      targetWeight: 15,
      note: "Semi cycle trade"
    },
    {
      id: createId(),
      symbol: "RKLB",
      displayName: "Rocket Lab",
      market: "US",
      sector: "Space",
      term: "LT",
      costBasis: 3062867,
      currentValue: 3595960,
      targetWeight: 12,
      note: "Never sell candidate"
    },
    {
      id: createId(),
      symbol: "NBIS",
      displayName: "Nebius",
      market: "US",
      sector: "AI",
      term: "LT",
      costBasis: 2015846,
      currentValue: 2199068,
      targetWeight: 8,
      note: "AI infrastructure"
    }
  ]
};

let state = loadState();
let editingId = null;

const el = {
  netDepositsInput: document.getElementById("netDepositsInput"),
  cashInput: document.getElementById("cashInput"),
  totalAssetsValue: document.getElementById("totalAssetsValue"),
  totalEquityValue: document.getElementById("totalEquityValue"),
  totalProfitValue: document.getElementById("totalProfitValue"),
  totalReturnValue: document.getElementById("totalReturnValue"),
  marketChart: document.getElementById("marketChart"),
  sectorChart: document.getElementById("sectorChart"),
  marketLegend: document.getElementById("marketLegend"),
  sectorLegend: document.getElementById("sectorLegend"),
  holdingsBody: document.getElementById("holdingsBody"),
  positionCount: document.getElementById("positionCount"),
  addHoldingBtn: document.getElementById("addHoldingBtn"),
  holdingDialog: document.getElementById("holdingDialog"),
  holdingForm: document.getElementById("holdingForm"),
  dialogTitle: document.getElementById("dialogTitle"),
  symbolInput: document.getElementById("symbolInput"),
  nameInput: document.getElementById("nameInput"),
  marketInput: document.getElementById("marketInput"),
  sectorInput: document.getElementById("sectorInput"),
  termInput: document.getElementById("termInput"),
  costBasisInput: document.getElementById("costBasisInput"),
  currentValueInput: document.getElementById("currentValueInput"),
  targetWeightInput: document.getElementById("targetWeightInput"),
  noteInput: document.getElementById("noteInput"),
  formError: document.getElementById("formError"),
  cancelBtn: document.getElementById("cancelBtn")
};

bootstrap();

function bootstrap() {
  renderSectorOptions();
  bindEvents();
  sortHoldings();
  render();
}

function bindEvents() {
  el.netDepositsInput.addEventListener("input", (event) => {
    const value = toNumber(event.target.value);
    state.netDeposits = value < 0 ? 0 : value;
    persistState();
    renderSummary();
    renderTable();
    renderCharts();
  });

  el.cashInput.addEventListener("input", (event) => {
    const value = toNumber(event.target.value);
    state.cashBalance = value < 0 ? 0 : value;
    persistState();
    renderSummary();
    renderTable();
    renderCharts();
  });

  el.addHoldingBtn.addEventListener("click", () => {
    editingId = null;
    el.dialogTitle.textContent = "종목 추가";
    resetForm();
    el.holdingDialog.showModal();
  });

  el.cancelBtn.addEventListener("click", () => {
    el.holdingDialog.close();
  });

  el.holdingForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitHoldingForm();
  });
}

function render() {
  el.netDepositsInput.value = Math.round(state.netDeposits);
  el.cashInput.value = Math.round(state.cashBalance);
  renderSummary();
  renderTable();
  renderCharts();
}

function renderSummary() {
  const totalEquity = getTotalEquity();
  const totalAssets = totalEquity + state.cashBalance;
  const totalProfit = totalAssets - state.netDeposits;
  const totalReturn = state.netDeposits === 0 ? 0 : totalProfit / state.netDeposits;

  el.totalAssetsValue.textContent = formatMoney(totalAssets);
  el.totalEquityValue.textContent = formatMoney(totalEquity);
  el.totalProfitValue.textContent = signedMoney(totalProfit);
  el.totalReturnValue.textContent = formatPercent(totalReturn);

  setPerformanceColor(el.totalProfitValue, totalReturn);
  setPerformanceColor(el.totalReturnValue, totalReturn);
}

function renderTable() {
  const totalAssets = getTotalAssets();
  el.positionCount.textContent = state.holdings.length;

  const rows = state.holdings.map((holding) => {
    const profit = holding.currentValue - holding.costBasis;
    const returnRate = holding.costBasis === 0 ? 0 : profit / holding.costBasis;
    const ratio = totalAssets === 0 ? 0 : holding.currentValue / totalAssets;
    const status = getPositionStatus(holding, ratio);
    const badgeClass = status === "Over" ? "badge-over" : status === "Under" ? "badge-under" : "badge-neutral";
    const profitClass = returnRate > 0 ? "t-profit-up" : returnRate < 0 ? "t-profit-down" : "";

    return `
      <tr>
        <td>${escapeHtml(holding.symbol)}</td>
        <td>${holding.market}</td>
        <td>${holding.sector}</td>
        <td>${holding.term}</td>
        <td class="t-num">${formatMoney(holding.costBasis)}</td>
        <td class="t-num">${formatMoney(holding.currentValue)}</td>
        <td class="t-num">${formatPercent(ratio)}</td>
        <td class="t-num ${profitClass}">${formatPercent(returnRate)}</td>
        <td class="t-num ${profitClass}">${signedMoney(profit)}</td>
        <td><span class="badge ${badgeClass}">${status}</span></td>
        <td title="${escapeHtml(holding.note || "")}">${escapeHtml(holding.note || "")}</td>
        <td>
          <div class="action-group">
            <button class="btn btn-mini js-edit" data-id="${holding.id}" type="button">수정</button>
            <button class="btn btn-mini btn-danger js-delete" data-id="${holding.id}" type="button">삭제</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  el.holdingsBody.innerHTML = rows || `
    <tr>
      <td colspan="12" style="text-align:center;color:#5a6753;padding:20px;">보유 종목이 없습니다. 종목 추가 버튼으로 시작하세요.</td>
    </tr>
  `;

  el.holdingsBody.querySelectorAll(".js-edit").forEach((button) => {
    button.addEventListener("click", () => openEditDialog(button.dataset.id));
  });

  el.holdingsBody.querySelectorAll(".js-delete").forEach((button) => {
    button.addEventListener("click", () => deleteHolding(button.dataset.id));
  });
}

function renderCharts() {
  const totalAssets = getTotalAssets();

  const marketEntries = [
    entry("KR", sumBy(state.holdings.filter((h) => h.market === "KR"), "currentValue"), totalAssets),
    entry("US", sumBy(state.holdings.filter((h) => h.market === "US"), "currentValue"), totalAssets),
    entry("Cash", state.cashBalance, totalAssets)
  ];

  const sectorEntries = SECTORS.map((sector) => {
    const value = sumBy(state.holdings.filter((h) => h.sector === sector), "currentValue");
    return entry(sector, value, totalAssets);
  }).filter((item) => item.ratio > 0);

  renderBarChart(el.marketChart, marketEntries, false);
  renderBarChart(el.sectorChart, sectorEntries, true);
  renderLegend(el.marketLegend, marketEntries);
  renderLegend(el.sectorLegend, sectorEntries);
}

function renderBarChart(container, items, sectorMode) {
  if (!items.length) {
    container.innerHTML = "<p style='color:#5a6753;font-size:13px;'>데이터 없음</p>";
    return;
  }

  container.innerHTML = items.map((item) => {
    const width = Math.max(item.ratio * 100, 0);
    const fillClass = sectorMode ? "bar-fill sector" : "bar-fill";
    return `
      <div class="bar-row">
        <span class="bar-label">${item.name}</span>
        <div class="bar-track">
          <div class="${fillClass}" style="width:${Math.min(width, 100)}%"></div>
        </div>
        <span class="bar-value">${formatPercent(item.ratio)}</span>
      </div>
    `;
  }).join("");
}

function renderLegend(container, items) {
  const nonZero = items.filter((item) => item.ratio > 0);
  container.innerHTML = (nonZero.length ? nonZero : items).map((item) => {
    return `<div>${item.name}: <strong>${formatPercent(item.ratio)}</strong></div>`;
  }).join("");
}

function renderSectorOptions() {
  el.sectorInput.innerHTML = SECTORS.map((sector) => `<option value="${sector}">${sector}</option>`).join("");
}

function openEditDialog(id) {
  const holding = state.holdings.find((item) => item.id === id);
  if (!holding) return;

  editingId = id;
  el.dialogTitle.textContent = "종목 수정";
  resetForm();

  el.symbolInput.value = holding.symbol;
  el.nameInput.value = holding.displayName || "";
  el.marketInput.value = MARKETS.includes(holding.market) ? holding.market : "KR";
  el.sectorInput.value = SECTORS.includes(holding.sector) ? holding.sector : "Index";
  el.termInput.value = TERMS.includes(holding.term) ? holding.term : "ST";
  el.costBasisInput.value = holding.costBasis;
  el.currentValueInput.value = holding.currentValue;
  el.targetWeightInput.value = holding.targetWeight ?? "";
  el.noteInput.value = holding.note || "";

  el.holdingDialog.showModal();
}

function submitHoldingForm() {
  const symbol = el.symbolInput.value.trim().toUpperCase();
  const displayName = el.nameInput.value.trim();
  const market = el.marketInput.value;
  const sector = el.sectorInput.value;
  const term = el.termInput.value;
  const costBasis = toNumber(el.costBasisInput.value);
  const currentValue = toNumber(el.currentValueInput.value);
  const targetWeightRaw = el.targetWeightInput.value.trim();
  const note = el.noteInput.value.trim();

  if (!symbol) {
    showFormError("Symbol은 필수입니다.");
    return;
  }
  if (costBasis < 0 || currentValue < 0) {
    showFormError("Portion/NAV는 0 이상이어야 합니다.");
    return;
  }

  let targetWeight = null;
  if (targetWeightRaw !== "") {
    targetWeight = Number(targetWeightRaw);
    if (!Number.isFinite(targetWeight) || targetWeight < 0 || targetWeight > 100) {
      showFormError("Target Ratio는 0~100 범위로 입력하세요.");
      return;
    }
  }

  const payload = {
    id: editingId || createId(),
    symbol,
    displayName: displayName || symbol,
    market: MARKETS.includes(market) ? market : "KR",
    sector: SECTORS.includes(sector) ? sector : "Index",
    term: TERMS.includes(term) ? term : "ST",
    costBasis,
    currentValue,
    targetWeight,
    note
  };

  if (editingId) {
    const index = state.holdings.findIndex((item) => item.id === editingId);
    if (index >= 0) state.holdings[index] = payload;
  } else {
    state.holdings.push(payload);
  }

  sortHoldings();
  persistState();
  render();
  el.holdingDialog.close();
}

function deleteHolding(id) {
  state.holdings = state.holdings.filter((item) => item.id !== id);
  persistState();
  render();
}

function resetForm() {
  el.holdingForm.reset();
  el.marketInput.value = "KR";
  el.sectorInput.value = "Index";
  el.termInput.value = "ST";
  hideFormError();
}

function showFormError(message) {
  el.formError.textContent = message;
  el.formError.hidden = false;
}

function hideFormError() {
  el.formError.hidden = true;
  el.formError.textContent = "";
}

function getTotalEquity() {
  return sumBy(state.holdings, "currentValue");
}

function getTotalAssets() {
  return getTotalEquity() + state.cashBalance;
}

function getPositionStatus(holding, ratioFraction) {
  if (holding.targetWeight === null || holding.targetWeight === undefined || holding.targetWeight <= 0) {
    return "Neutral";
  }
  const currentPercent = ratioFraction * 100;
  if (currentPercent > holding.targetWeight * 1.1) return "Over";
  if (currentPercent < holding.targetWeight * 0.9) return "Under";
  return "Neutral";
}

function sumBy(list, key) {
  return list.reduce((acc, item) => acc + (toNumber(item[key]) || 0), 0);
}

function entry(name, value, total) {
  return { name, ratio: total === 0 ? 0 : value / total };
}

function sortHoldings() {
  state.holdings.sort((a, b) => b.currentValue - a.currentValue);
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value) {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(Math.round(value));
}

function signedMoney(value) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatMoney(value)}`;
}

function formatPercent(value) {
  return new Intl.NumberFormat("ko-KR", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function setPerformanceColor(node, rate) {
  node.classList.remove("t-profit-up", "t-profit-down");
  if (rate > 0) node.classList.add("t-profit-up");
  if (rate < 0) node.classList.add("t-profit-down");
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return deepCopy(demoState);

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return deepCopy(demoState);

    const holdings = Array.isArray(parsed.holdings) ? parsed.holdings.map(normalizeHolding).filter(Boolean) : [];
    return {
      netDeposits: toNumber(parsed.netDeposits),
      cashBalance: toNumber(parsed.cashBalance),
      holdings
    };
  } catch {
    return deepCopy(demoState);
  }
}

function normalizeHolding(raw) {
  if (!raw || typeof raw !== "object") return null;
  const symbol = String(raw.symbol || "").trim().toUpperCase();
  if (!symbol) return null;

  const market = MARKETS.includes(raw.market) ? raw.market : "KR";
  const sector = SECTORS.includes(raw.sector) ? raw.sector : "Index";
  const term = TERMS.includes(raw.term) ? raw.term : "ST";
  const costBasis = Math.max(0, toNumber(raw.costBasis));
  const currentValue = Math.max(0, toNumber(raw.currentValue));
  const targetRaw = raw.targetWeight;
  const targetWeight = targetRaw === null || targetRaw === undefined || targetRaw === ""
    ? null
    : Math.min(100, Math.max(0, toNumber(targetRaw)));

  return {
    id: raw.id || createId(),
    symbol,
    displayName: String(raw.displayName || symbol).trim(),
    market,
    sector,
    term,
    costBasis,
    currentValue,
    targetWeight,
    note: String(raw.note || "").trim()
  };
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
