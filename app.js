import {
  CURRENCIES,
  DEFAULT_SETTINGS,
  deleteAsset,
  deleteTransaction,
  exportAll,
  getAsset,
  getSettings,
  getTransaction,
  importAll,
  latestAutoBackup,
  listAssets,
  listTransactions,
  saveAsset,
  saveAutoBackup,
  saveSettings,
  saveTransaction,
  wipeSnapshots,
} from "./db.js";
import { downloadFile, printReport, toCsv, toExcelXml } from "./export.js";

const app = document.getElementById("app");
const TX_TYPES = [
  { id: "payment", label: "Payment", sign: "−" },
  { id: "deposit", label: "Deposit", sign: "+" },
  { id: "adjust", label: "Adjustment", sign: "+" },
  { id: "transfer", label: "Transfer", sign: "−" },
];

const TYPE_ICONS = {
  cash: "💴",
  bank: "🏦",
  savings: "💰",
  "credit-card": "💳",
  loan: "📝",
  insurance: "🛡️",
  utilities: "💡",
  tithes: "🙏",
  travel: "✈️",
  healthcare: "🏥",
  schooling: "🎓",
  investments: "📈",
  custom: "✦",
};

const RATE_REFRESH_MS = 12 * 60 * 60 * 1000;
const RATE_URLS = [
  "https://open.er-api.com/v6/latest/JPY",
  "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/jpy.min.json",
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth() {
  return today().slice(0, 7);
}

const ui = {
  month: currentMonth(),
  txType: "all",
  txQuery: "",
  reportKind: "expense",
};

let settings = { ...DEFAULT_SETTINGS };
let cache = { assets: [], txs: [] };

function uid() {
  return crypto.randomUUID();
}

function shiftMonth(key, delta) {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function prettyDate(iso) {
  if (!iso) return "—";
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

function go(hash) {
  location.hash = hash;
}

function parseRoute() {
  const parts = (location.hash.replace(/^#/, "") || "/").split("/").filter(Boolean);
  if (!parts.length) return { name: "accounts" };
  const [a, b, c, d] = parts;
  if (a === "account" && b === "new") return { name: "account-form", id: null };
  if (a === "account" && b && c === "edit") return { name: "account-form", id: b };
  if (a === "account" && b && c === "tx" && (d === "new" || !d)) return { name: "tx-form", id: null, accountId: b };
  if (a === "account" && b && c === "tx" && d) return { name: "tx-form", id: d, accountId: b };
  if (a === "account" && b) return { name: "account", id: b };
  if (a === "activity" && b === "new") return { name: "tx-form", id: null, accountId: null };
  if (a === "activity" && b) return { name: "tx-form", id: b, accountId: null };
  if (a === "activity") return { name: "activity" };
  if (a === "report") return { name: "report" };
  if (a === "settings") return { name: "settings" };
  return { name: "accounts" };
}

function applyTheme(theme) {
  settings.theme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = settings.theme;
  localStorage.setItem("bochog-theme", settings.theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = settings.theme === "dark" ? "#0f1724" : "#1e4d8c";
}

function formatMoney(amount, currency = settings.defaultCurrency) {
  const n = Math.abs(Number(amount) || 0);
  const digits = currency === "JPY" ? 0 : 2;
  const symbol = { JPY: "¥", PHP: "₱", USD: "$" }[currency] || "";
  return `${symbol}${n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function typeIcon(id) {
  return TYPE_ICONS[normalizeCategory(id)] || "✦";
}

function accountNet(accountId) {
  if (!accountId) return 0;
  let net = 0;
  for (const tx of cache.txs) {
    for (const change of tx.effect?.changes || []) {
      if (change.id === accountId) net += Number(change.delta) || 0;
    }
  }
  return net;
}

function openingBalance(row) {
  if (!row) return 0;
  if (row.initialBalance != null && row.initialBalance !== "") return Number(row.initialBalance) || 0;
  if (!row.id) return Number(row.value) || 0;
  return (Number(row.value) || 0) - accountNet(row.id);
}

function settledValue(row, opening = openingBalance(row)) {
  const next = (Number(opening) || 0) + accountNet(row?.id);
  return row && isOutgoingAccount(row) ? Math.max(0, next) : next;
}

function dueAmount(row) {
  const n = settledValue(row);
  return groupOf(row) === "out" ? Math.abs(n) : n;
}

function amountTone(row, amount = dueAmount(row)) {
  if (row && (groupOf(row) === "out" || Number(amount) < 0)) return "out";
  if (Number(amount) < 0) return "out";
  return "in";
}

function moneyClass(amount, hint = "") {
  if (hint === "out" || Number(amount) < 0) return "out";
  if (hint === "in") return "in";
  return "";
}

function moneyBlock(amount, currency, cls = "", convertedAmount) {
  const n = Number(amount) || 0;
  const converted = currency && currency !== settings.defaultCurrency;
  const tone = moneyClass(n, cls);
  const asDefault = convertedAmount != null ? Number(convertedAmount) || 0 : toDefault(n, currency);
  return `<span class="money">
      <strong class="amount ${tone}">${formatMoney(n, currency)}</strong>
      ${converted ? `<small class="fx ${tone}">= ${formatMoney(asDefault)}</small>` : ""}
    </span>`;
}

function fxHintHtml(amount, currency) {
  if (!currency || currency === settings.defaultCurrency) return "";
  return `${formatMoney(amount, currency)} = ${formatMoney(toDefault(amount, currency))}`;
}

function toDefault(amount, currency) {
  return convertAmount(amount, currency, settings.defaultCurrency);
}

function rateOf(currency) {
  const rates = settings.rates || DEFAULT_SETTINGS.rates;
  return Number(rates[currency]) || 1;
}

function convertAmount(amount, fromCurrency, toCurrency) {
  const value = Number(amount) || 0;
  if (!fromCurrency || !toCurrency || fromCurrency === toCurrency) return value;
  return value * (rateOf(fromCurrency) / rateOf(toCurrency));
}

function historicalDefault(row) {
  if (row?.fx?.converted != null && row.fx.defaultCurrency === settings.defaultCurrency) {
    return Number(row.fx.converted) || 0;
  }
  return toDefault(row.amount, row.currency);
}

function normalizeCategory(id) {
  return (
    {
      "bank-accounts": "bank",
      "credit-cards": "credit-card",
      bill: "utilities",
      "bill-due": "utilities",
      investment: "investments",
      vehicle: "custom",
      vehicles: "custom",
      "real-estate": "custom",
      realestate: "custom",
      personal: "custom",
      "personal-assets": "custom",
      "custom-assets": "custom",
    }[id] || id
  );
}

function catMeta(id) {
  const key = normalizeCategory(id);
  return (
    settings.assetCategories.find((item) => item.id === key) || {
      id: key,
      label: id,
      liability: false,
      group: "other",
    }
  );
}

function categoryLabel(kind, id) {
  const list =
    kind === "income"
      ? settings.incomeCategories
      : kind === "expense"
        ? settings.expenseCategories
        : settings.assetCategories;
  return list.find((item) => item.id === id)?.label || id || "—";
}

function typeLabel(asset) {
  const cat = catMeta(asset.category);
  return asset.category === "custom" && asset.customType ? asset.customType : cat.label;
}

function isLiability(asset) {
  const cat = catMeta(asset?.category);
  return Boolean(asset?.liability || cat.liability || cat.group === "out");
}

function isDueType(type) {
  return ["utilities", "insurance", "loan", "tithes"].includes(normalizeCategory(type));
}

function isAmountDueType(type) {
  return ["credit-card", "utilities", "insurance", "loan", "tithes"].includes(normalizeCategory(type));
}

function groupOf(asset) {
  const cat = catMeta(asset.category);
  if (cat.group === "in" || cat.group === "out" || cat.group === "other") return cat.group;
  const id = normalizeCategory(asset.category);
  if (["cash", "bank", "savings"].includes(id)) return "in";
  if (["credit-card", "utilities", "insurance", "loan", "tithes"].includes(id) || isLiability(asset)) return "out";
  return "other";
}

function txKind(row) {
  if (row.type === "income" || row.type === "deposit") return "deposit";
  if (row.type === "expense" || row.type === "payment") return "payment";
  if (row.type === "adjust" || row.type === "transfer") return row.type;
  return "payment";
}

function txMeta(kind) {
  return TX_TYPES.find((item) => item.id === kind) || TX_TYPES[0];
}

function isDeduction(kind) {
  return kind === "payment" || kind === "transfer";
}

function isOutgoingAccount(asset) {
  return Boolean(asset) && groupOf(asset) === "out";
}

function accountDelta(kind, asset, amount, role = "from") {
  if (!asset) return 0;
  const outgoing = isOutgoingAccount(asset);
  if (kind === "payment") return outgoing ? amount : -amount;
  if (kind === "deposit" || kind === "adjust") return outgoing ? -amount : amount;
  if (kind === "transfer") {
    if (role === "from") return -amount;
    return outgoing ? -amount : amount;
  }
  return 0;
}

function nextValue(asset, delta) {
  const next = (Number(asset.value) || 0) + delta;
  return isOutgoingAccount(asset) ? Math.max(0, next) : next;
}

async function reload() {
  const [assets, txs, nextSettings] = await Promise.all([listAssets(), listTransactions(), getSettings()]);
  cache = { assets, txs };
  settings = nextSettings;
  applyTheme(settings.theme);
  for (const row of cache.assets) {
    if (isOutgoingAccount(row) && Number(row.value) < 0) {
      row.value = Math.abs(Number(row.value));
      await saveAsset({ ...row, updatedAt: new Date().toISOString() });
    }
  }
  await ensureSortOrder();
}

function moneyNow() {
  let inBanks = 0;
  let cards = 0;
  let bills = 0;
  for (const row of cache.assets) {
    const value = toDefault(dueAmount(row), row.currency);
    const group = groupOf(row);
    const id = normalizeCategory(row.category);
    if (group === "in") inBanks += value;
    else if (id === "credit-card") cards += value;
    else if (group === "out") bills += value;
  }
  const comingOut = cards + bills;
  return { inBanks, cards, bills, comingOut, available: inBanks - comingOut };
}

function monthTxs(month = ui.month) {
  return cache.txs.filter((row) => (row.date || "").startsWith(month));
}

function accountTxs(accountId) {
  return cache.txs
    .filter((row) => row.assetId === accountId || row.toAssetId === accountId)
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || ""));
}

function flowFor(rows) {
  let income = 0;
  let expense = 0;
  for (const row of rows) {
    const kind = txKind(row);
    const value = historicalDefault(row);
    if (kind === "deposit" || kind === "adjust") income += value;
    if (kind === "payment" || kind === "transfer") expense += value;
  }
  return { income, expense, left: income - expense };
}

function groupSum(rows, kind) {
  const want = kind === "income" ? "deposit" : "payment";
  const map = new Map();
  for (const row of rows.filter((item) => txKind(item) === want)) {
    const key = row.category || "other";
    map.set(key, (map.get(key) || 0) + historicalDefault(row));
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function tabbar(active) {
  const items = [
    ["#/", "Accounts", "accounts"],
    ["#/activity", "Activity", "activity"],
    ["#/report", "Report", "report"],
    ["#/settings", "Settings", "settings"],
  ];
  return `<nav class="tabbar">${items
    .map(
      ([href, label, key]) =>
        `<a href="${href}" class="${active === key ? "active" : ""}">${label}</a>`
    )
    .join("")}</nav>`;
}

function logo() {
  return `<img class="logo" src="./icons/icon.svg" alt="" />`;
}

function monthNav() {
  return `<nav class="month-nav">
    <button class="icon-btn" id="prevMonth" type="button">‹</button>
    <h2>${escapeHtml(monthLabel(ui.month))}</h2>
    <button class="icon-btn" id="nextMonth" type="button">›</button>
  </nav>`;
}

function barChart(items, kind) {
  const max = Math.max(1, ...items.map(([, value]) => value));
  if (!items.length) return `<p class="hint">Nothing in this month yet.</p>`;
  return `<div class="bar-list">${items
    .slice(0, 8)
    .map(([key, value]) => {
      const pct = Math.max(6, Math.round((value / max) * 100));
      return `<div class="bar-row">
        <span>${escapeHtml(categoryLabel(kind, key))}</span>
        <div class="bar-track ${kind}"><i style="width:${pct}%"></i></div>
        <strong>${formatMoney(value)}</strong>
      </div>`;
    })
    .join("")}</div>`;
}

function txCard(row, accountId) {
  const kind = txKind(row);
  const meta = txMeta(kind);
  const from = cache.assets.find((item) => item.id === row.assetId);
  const to = cache.assets.find((item) => item.id === row.toAssetId);
  const account = cache.assets.find((item) => item.id === accountId) || from;
  const outgoing = kind === "transfer"
    ? row.assetId === accountId
    : isOutgoingAccount(account)
      ? kind === "deposit"
      : isDeduction(kind);
  const cls = outgoing ? "out" : "in";
  const href = accountId ? `#/account/${accountId}/tx/${row.id}` : `#/activity/${row.id}`;
  const where =
    kind === "transfer"
      ? `${from?.name || "Account"} → ${to?.name || "Account"}`
      : from?.name || categoryLabel(kind === "deposit" ? "income" : "expense", row.category);
  return `<article class="card compact">
    <a class="card-main" href="${href}">
      <div class="meta">
        <h3>${escapeHtml(row.name || meta.label)}</h3>
        <p class="when">${prettyDate(row.date)} · ${escapeHtml(meta.label)} · ${escapeHtml(where)}</p>
      </div>
      ${moneyBlock(row.amount, row.currency, cls, historicalDefault(row))}
    </a>
  </article>`;
}

function accountCard(row, index = 0, total = 1) {
  const due = row.dueDate ? ` · due ${prettyDate(row.dueDate)}` : "";
  const amount = dueAmount(row);
  const cls = amountTone(row, amount);
  return `<article class="card compact with-reorder">
    <a class="card-main" href="#/account/${row.id}">
      <div class="meta">
        <h3>${escapeHtml(row.name)}</h3>
        <p class="when"><span class="type-icon">${typeIcon(row.category)}</span> ${escapeHtml(typeLabel(row))}${due}</p>
      </div>
      ${moneyBlock(amount, row.currency, cls)}
    </a>
    <div class="reorder">
      <button type="button" class="reorder-btn" data-move="up" data-id="${row.id}" aria-label="Move up" ${index === 0 ? "disabled" : ""}>▲</button>
      <button type="button" class="reorder-btn" data-move="down" data-id="${row.id}" aria-label="Move down" ${index === total - 1 ? "disabled" : ""}>▼</button>
    </div>
  </article>`;
}

function isCollapsed(key) {
  return Boolean(settings.collapsedGroups?.[key]);
}

function applyFoldState(key, collapsed) {
  settings.collapsedGroups = { ...(settings.collapsedGroups || {}), [key]: collapsed };
  const block = app.querySelector(`[data-collapse="${key}"]`);
  if (block) {
    block.classList.toggle("collapsed", collapsed);
    const head = block.querySelector(".fold-head");
    if (head) head.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }
}

async function setCollapsed(key, collapsed) {
  applyFoldState(key, collapsed);
  await persistSettings();
}

async function setCollapsedMany(keys, collapsed) {
  for (const key of keys) applyFoldState(key, collapsed);
  await persistSettings();
}

function collapseControls(keys) {
  if (!keys.length) return "";
  return `<div class="fold-actions">
    <button type="button" class="ghost compact" data-collapse-all="${keys.join(",")}">Collapse all</button>
    <button type="button" class="ghost compact" data-expand-all="${keys.join(",")}">Expand all</button>
  </div>`;
}

function fold(key, title, body, count) {
  const collapsed = isCollapsed(key);
  return `<section class="fold ${collapsed ? "collapsed" : ""}" data-collapse="${key}">
    <button type="button" class="fold-head" data-toggle="${key}" aria-expanded="${collapsed ? "false" : "true"}">
      <span class="section-title">${escapeHtml(title)}</span>
      ${count != null ? `<span class="fold-count">${count}</span>` : ""}
      <span class="fold-chevron" aria-hidden="true">▾</span>
    </button>
    <div class="fold-body">${body}</div>
  </section>`;
}

function sectionList(title, rows, key) {
  if (!rows.length) return "";
  const ordered = sortedAssets(rows);
  return fold(
    key,
    title,
    `<div class="list">${ordered.map((row, index) => accountCard(row, index, ordered.length)).join("")}</div>`,
    ordered.length
  );
}

function accountSections() {
  return [
    ["Cash & banks", cache.assets.filter((row) => ["cash", "bank", "savings"].includes(normalizeCategory(row.category))), "accounts:cash-banks"],
    ["Credit cards", byType("credit-card"), "accounts:credit-card"],
    ["Loans", byType("loan"), "accounts:loan"],
    ["Insurance", byType("insurance"), "accounts:insurance"],
    ["Utilities", byType("utilities"), "accounts:utilities"],
    ["Tithes", byType("tithes"), "accounts:tithes"],
    ["Travel", byType("travel"), "accounts:travel"],
    ["Healthcare", byType("healthcare"), "accounts:healthcare"],
    ["Schooling", byType("schooling"), "accounts:schooling"],
    [
      "Other assets",
      cache.assets.filter(
        (row) =>
          ["investments", "custom"].includes(normalizeCategory(row.category)) ||
          (groupOf(row) === "other" && !["travel", "healthcare", "schooling"].includes(normalizeCategory(row.category)))
      ),
      "accounts:other",
    ],
  ].filter(([, rows]) => rows.length);
}

function sectionId(row) {
  const id = normalizeCategory(row.category);
  if (["cash", "bank", "savings"].includes(id)) return "cash-banks";
  if (["travel", "healthcare", "schooling", "credit-card", "loan", "insurance", "utilities", "tithes", "investments"].includes(id)) {
    return id;
  }
  return "other";
}

function sectionPeers(row) {
  const key = sectionId(row);
  return cache.assets.filter((item) => sectionId(item) === key);
}

function byName(a, b) {
  return (a.name || "").localeCompare(b.name || "");
}

function byOrder(a, b) {
  return (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0) || byName(a, b);
}

function byDue(a, b) {
  return (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || byOrder(a, b);
}

function sortedAssets(rows = cache.assets) {
  return [...rows].sort(byOrder);
}

function byType(id) {
  return sortedAssets(cache.assets.filter((row) => normalizeCategory(row.category) === id));
}

function clearable(html) {
  return `<span class="clearable">${html}<button type="button" class="clear-btn" data-clear aria-label="Clear">×</button></span>`;
}

function appHeader() {
  const now = moneyNow();
  const cls = now.available < 0 ? "out" : "in";
  return `<header class="app-header">
    <div class="brand">
      ${logo()}
      <h1>Bochog Kakei</h1>
    </div>
    <div class="header-savings">
      <span class="eyebrow">Current savings</span>
      <strong class="amount ${cls}">${formatMoney(now.available)}</strong>
    </div>
  </header>`;
}

function shell(active, html) {
  return `${appHeader()}${html}${tabbar(active)}`;
}

async function renderAccounts() {
  const now = moneyNow();
  app.innerHTML = shell(
    "accounts",
    `
    <section class="hero">
      <div class="hero-split">
        <div>
          <span>In banks</span>
          <strong class="amount in">${formatMoney(now.inBanks)}</strong>
        </div>
        <div>
          <span>Coming out</span>
          <strong class="amount out">${formatMoney(now.comingOut)}</strong>
        </div>
      </div>
    </section>
    ${
      cache.assets.length
        ? `${(() => {
            const sections = accountSections();
            return `${collapseControls(sections.map((item) => item[2]))}
              ${sections.map(([title, rows, key]) => sectionList(title, rows, key)).join("")}`;
          })()}`
        : `<div class="empty">
            <h2>Start with balances</h2>
            <p>Add cash and bank accounts in Settings, then add credit cards, bills, travel, healthcare, and schooling funds.</p>
            <button class="primary" data-go="#/settings">Open Settings</button>
          </div>`
    }
  `
  );
}

async function renderAccount(id) {
  let row;
  try {
    row = await getAsset(id);
  } catch (err) {
    console.error(err);
    go("#/");
    return;
  }
  if (!row) {
    go("#/");
    return;
  }
  const rows = accountTxs(id);
  const opening = openingBalance(row);
  const total = dueAmount(row);
  const cls = amountTone(row, total);
  const initialLabel = groupOf(row) === "out" ? "Initial amount due" : "Initial balance";
  app.innerHTML = shell(
    "accounts",
    `
    <div class="form-top">
      <button class="ghost" data-go="#/">Back</button>
      <button class="ghost" data-go="#/account/${row.id}/edit">Edit</button>
    </div>
    <section class="hero account-hero" data-go="#/account/${row.id}/edit" role="button" tabindex="0">
      <p class="eyebrow"><span class="type-icon">${typeIcon(row.category)}</span> ${escapeHtml(typeLabel(row))}</p>
      <h1>${escapeHtml(row.name)}</h1>
      <p class="balance-note"><span>${initialLabel}</span> ${moneyBlock(opening, row.currency, amountTone(row, opening))}</p>
      <div class="hero-amount ${cls === "out" ? "amount out" : ""}">${moneyBlock(total, row.currency, cls)}</div>
      ${row.dueDate ? `<p class="hint">Due ${prettyDate(row.dueDate)}</p>` : ""}
      <p class="hint">Total of the initial balance and every transaction. Tap to edit.</p>
    </section>
    <header class="top">
      <h2 class="section-title" style="margin:0">Transactions</h2>
      <button class="primary" data-go="#/account/${row.id}/tx/new">Add</button>
    </header>
    ${
      rows.length
        ? `<div class="list">${rows.map((item) => txCard(item, id)).join("")}</div>`
        : `<div class="empty">
            <h2>No transactions yet</h2>
            <p>Add a payment or transfer to subtract, or a deposit or adjustment to add.</p>
          </div>`
    }
  `
  );
}

async function renderAccountForm(id) {
  const row = id ? await getAsset(id) : null;
  const selectedType = normalizeCategory(row?.category || "bank");
  const back = id ? `#/account/${id}` : "#/";
  app.innerHTML = shell(
    "accounts",
    `
    <div class="form-top">
      <button class="ghost" data-go="${back}">Back</button>
      ${id ? `<button class="danger compact" id="deleteAccount" type="button">Delete</button>` : ""}
    </div>
    <h1>${id ? "Edit account" : "New account"}</h1>
    <form class="form" id="accountForm">
      <label>Name
        ${clearable(`<input name="name" required value="${escapeAttr(row?.name || "")}" placeholder="MUFG, cash wallet, Tokyo Gas…" />`)}
      </label>
      <label>Type
        <select name="category" id="accountType">
          ${settings.assetCategories
            .map(
              (cat) =>
                `<option value="${cat.id}" ${selectedType === cat.id ? "selected" : ""}>${typeIcon(cat.id)} ${escapeHtml(cat.label)}</option>`
            )
            .join("")}
        </select>
      </label>
      <label>Currency
        <select name="currency">
          ${CURRENCIES.map((c) => `<option ${ (row?.currency || settings.defaultCurrency) === c ? "selected" : "" }>${c}</option>`).join("")}
        </select>
      </label>
      <label id="balanceLabel">${isAmountDueType(selectedType) ? "Initial amount due" : "Initial balance"}
        ${clearable(`<input name="initialBalance" type="number" step="any" required value="${escapeAttr(openingBalance(row))}" />`)}
      </label>
      <p class="fx-hint" id="fxHint"></p>
      <p class="hint">The balance shown on the account is this amount plus every transaction.</p>
      <p class="computed-balance" id="computedBalance"></p>
      <label id="dueField" class="${isDueType(selectedType) ? "" : "hidden"}">Due date
        <input name="dueDate" type="date" value="${escapeAttr(row?.dueDate || "")}" />
      </label>
      <label id="customField" class="${selectedType === "custom" ? "" : "hidden"}">Custom type
        ${clearable(`<input name="customType" value="${escapeAttr(row?.customType || "")}" placeholder="e.g. Pension, crypto, gold…" />`)}
      </label>
      <label>Notes
        ${clearable(`<textarea name="notes">${escapeHtml(row?.notes || "")}</textarea>`)}
      </label>
      <button class="primary" type="submit">Save</button>
    </form>
  `
  );
  updateFxHint();
  updateBalancePreview();
}

async function renderActivity() {
  const q = ui.txQuery.trim().toLowerCase();
  const rows = monthTxs()
    .filter((row) => ui.txType === "all" || txKind(row) === ui.txType)
    .filter((row) => !q || [row.name, row.notes, txMeta(txKind(row)).label].join(" ").toLowerCase().includes(q))
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || ""));
  app.innerHTML = shell(
    "activity",
    `
    <header class="top">
      <div>
        <p class="eyebrow">All accounts</p>
        <h1>Activity</h1>
      </div>
      <button class="primary" data-go="#/activity/new">Add</button>
    </header>
    ${monthNav()}
    ${clearable(`<input class="search" id="txSearch" type="search" placeholder="Search" value="${escapeAttr(ui.txQuery)}" />`)}
    <div class="filters">
      ${["all", "payment", "deposit", "adjust", "transfer"]
        .map((key) => `<button class="chip ${ui.txType === key ? "active" : ""}" data-tx-type="${key}">${key === "all" ? "All" : txMeta(key).label}</button>`)
        .join("")}
    </div>
    ${
      rows.length
        ? `<div class="list">${rows.map((row) => txCard(row)).join("")}</div>`
        : `<div class="empty"><h2>No activity this month</h2><p>Open an account and add a payment, deposit, adjustment, or transfer.</p></div>`
    }
  `
  );
}

function accountOptions(selected, extra = "") {
  return `<option value="">${extra || "Select account"}</option>${sortedAssets()
    .map((row) => `<option value="${row.id}" ${selected === row.id ? "selected" : ""}>${escapeHtml(row.name)}</option>`)
    .join("")}`;
}

async function renderTxForm(id, accountId) {
  const row = id ? await getTransaction(id) : null;
  const kind = row ? txKind(row) : "payment";
  const lockedAccount = accountId || row?.assetId || "";
  const back = accountId ? `#/account/${accountId}` : "#/activity";
  const cats = kind === "deposit" || kind === "adjust" ? settings.incomeCategories : settings.expenseCategories;
  app.innerHTML = shell(
    accountId ? "accounts" : "activity",
    `
    <div class="form-top">
      <button class="ghost" data-go="${back}">Back</button>
      ${id ? `<button class="danger compact" id="deleteTx" type="button">Delete</button>` : ""}
    </div>
    <h1>${id ? "Transaction" : "New transaction"}</h1>
    <form class="form" id="txForm" data-kind="${kind}" data-account-id="${escapeAttr(accountId || "")}">
      <label>Type
        <select name="type" id="txType">
          ${TX_TYPES.map((item) => `<option value="${item.id}" ${kind === item.id ? "selected" : ""}>${item.label}</option>`).join("")}
        </select>
      </label>
      <p class="hint" id="txHint">${isDeduction(kind) ? "This subtracts from the account." : "This adds to the account."}</p>
      <label>Date
        <input name="date" type="date" required value="${escapeAttr(row?.date || today())}" />
      </label>
      <label>Name
        ${clearable(`<input name="name" value="${escapeAttr(row?.name || "")}" placeholder="Electric bill, salary, card payment…" />`)}
      </label>
      <label>Amount
        ${clearable(`<input name="amount" type="number" step="any" required value="${escapeAttr(row?.amount ?? "")}" />`)}
      </label>
      <p class="fx-hint" id="fxHint"></p>
      <div class="row">
        <label>Currency
          <select name="currency">
            ${CURRENCIES.map((c) => `<option ${ (row?.currency || settings.defaultCurrency) === c ? "selected" : "" }>${c}</option>`).join("")}
          </select>
        </label>
        <label id="categoryField" class="${kind === "transfer" ? "hidden" : ""}">Category
          <select name="category">
            ${cats.map((cat) => `<option value="${cat.id}" ${row?.category === cat.id ? "selected" : ""}>${escapeHtml(cat.label)}</option>`).join("")}
          </select>
        </label>
      </div>
      <label id="assetField">${kind === "transfer" ? "From" : "Account"}
        <select name="assetId" required>${accountOptions(row?.assetId || lockedAccount)}</select>
      </label>
      <label id="toField" class="${kind === "transfer" ? "" : "hidden"}">To
        <select name="toAssetId">${accountOptions(row?.toAssetId, "Select account")}</select>
      </label>
      <label>Notes
        ${clearable(`<textarea name="notes">${escapeHtml(row?.notes || "")}</textarea>`)}
      </label>
      <button class="primary" type="submit">Save</button>
    </form>
  `
  );
  setTxType(kind);
  updateFxHint();
}

async function renderReport() {
  const rows = monthTxs();
  const flow = flowFor(rows);
  const kind = ui.reportKind;
  const items = groupSum(rows, kind);
  app.innerHTML = shell(
    "report",
    `
    <header class="top">
      <div>
        <p class="eyebrow">This month</p>
        <h1>Report</h1>
      </div>
    </header>
    ${monthNav()}
    <section class="hero">
      <div class="hero-split">
        <div>
          <span>Added</span>
          <strong class="amount in">${formatMoney(flow.income)}</strong>
        </div>
        <div>
          <span>Subtracted</span>
          <strong class="amount out">${formatMoney(flow.expense)}</strong>
        </div>
      </div>
    </section>
    <div class="filters">
      <button class="chip ${kind === "expense" ? "active" : ""}" data-report-kind="expense">Payments</button>
      <button class="chip ${kind === "income" ? "active" : ""}" data-report-kind="income">Deposits</button>
    </div>
    ${barChart(items, kind)}
    <div class="footer-links">
      <button class="ghost" id="csvBtn" type="button">CSV</button>
      <button class="ghost" id="excelBtn" type="button">Excel</button>
      <button class="ghost" id="pdfBtn" type="button">Print / PDF</button>
    </div>
  `
  );
}

function reportRows() {
  const want = ui.reportKind === "income" ? "deposit" : "payment";
  return monthTxs()
    .filter((row) => txKind(row) === want)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
    .map((row) => [
      row.date,
      row.name || "",
      categoryLabel(ui.reportKind, row.category),
      cache.assets.find((item) => item.id === row.assetId)?.name || "",
      row.amount,
      row.currency || settings.defaultCurrency,
    ]);
}

async function renderSettings() {
  const auto = await latestAutoBackup();
  const rateAge = settings.ratesUpdatedAt ? prettyDate(settings.ratesUpdatedAt.slice(0, 10)) : "not yet";
  const settingKeys = [
    "settings:appearance",
    "settings:currency",
    "settings:backup",
    "settings:accounts",
    "settings:expense",
    "settings:income",
  ];
  app.innerHTML = shell(
    "settings",
    `
    <header class="top">
      <div>
        <p class="eyebrow">This device only</p>
        <h1>Settings</h1>
      </div>
    </header>
    ${collapseControls(settingKeys)}
    ${fold(
      "settings:appearance",
      "Appearance",
      `<div class="theme-row">
        <button class="chip ${settings.theme === "light" ? "active" : ""}" data-theme-pick="light">Light</button>
        <button class="chip ${settings.theme === "dark" ? "active" : ""}" data-theme-pick="dark">Dark</button>
      </div>`
    )}
    ${fold(
      "settings:currency",
      "Currency",
      `<label>Default
        <select id="defaultCurrency">
          ${CURRENCIES.map((c) => `<option ${settings.defaultCurrency === c ? "selected" : ""}>${c}</option>`).join("")}
        </select>
      </label>
      <label style="margin-top:10px">
        <span><input id="autoRates" type="checkbox" ${settings.autoRates !== false ? "checked" : ""} /> Update rates automatically</span>
      </label>
      <div class="row" style="margin-top:10px">
        <label>USD → JPY
          ${clearable(`<input id="rateUSD" type="number" step="any" value="${escapeAttr(settings.rates.USD)}" />`)}
        </label>
        <label>PHP → JPY
          ${clearable(`<input id="ratePHP" type="number" step="any" value="${escapeAttr(settings.rates.PHP)}" />`)}
        </label>
      </div>
      <p class="rate-status">${settings.ratesError || `Rates from ${escapeHtml(settings.ratesSource || "default")} · ${rateAge}`}</p>
      <div class="footer-links">
        <button class="ghost" id="refreshRates" type="button">Refresh rates now</button>
      </div>`
    )}
    ${fold(
      "settings:backup",
      "Backup",
      `<p class="hint">Changes save on this device as you go. Nothing is uploaded. When you are done with a batch of updates, export a copy — that is the only sync.</p>
      <p class="rate-status">${auto?.createdAt ? `Last local backup: ${prettyDate(auto.createdAt.slice(0, 10))}` : "No local backup yet."}</p>
      <div class="footer-links">
        <button class="ghost" id="saveLocalBackup" type="button">Save local backup</button>
        <button class="ghost" id="backupBtn" type="button">Export backup</button>
        <label class="file-btn ghost">Import backup<input id="importFile" type="file" accept="application/json" /></label>
      </div>`
    )}
    ${fold(
      "settings:accounts",
      "Accounts",
      `<p class="hint">Use ↑ ↓ on the Accounts screen to change order within a group.</p>
      <button class="primary" data-go="#/account/new">Add account</button>
      <div class="list" style="margin-top:10px">
        ${
          cache.assets.length
            ? sortedAssets()
                .map(
                  (row) => `<div class="manage-row">
              <button class="ghost" data-go="#/account/${row.id}/edit">${typeIcon(row.category)} ${escapeHtml(row.name)}</button>
            </div>`
                )
                .join("")
            : `<p class="hint">No accounts yet.</p>`
        }
      </div>`
    )}
    ${fold("settings:expense", "Expense categories", catEditor("expenseCategories"))}
    ${fold("settings:income", "Income categories", catEditor("incomeCategories"))}
  `
  );
}

function catEditor(key) {
  return `<ul class="edit-list">${settings[key]
    .map(
      (row, index) => `<li>
        ${clearable(`<input data-cat-key="${key}" data-cat-index="${index}" value="${escapeAttr(row.label)}" />`)}
        <button class="danger compact" data-del-cat="${key}:${index}" type="button">Remove</button>
      </li>`
    )
    .join("")}</ul>
    <div class="add-row">
      ${clearable(`<input id="new-${key}" placeholder="New category" />`)}
      <button class="chip" data-add-cat="${key}" type="button">Add</button>
    </div>`;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function applyChanges(changes) {
  for (const { id, delta } of changes) {
    const asset = await getAsset(id);
    if (!asset) continue;
    await saveAsset({
      ...asset,
      value: nextValue(asset, delta),
      updatedAt: new Date().toISOString(),
    });
  }
}

async function computeEffect(kind, data, amount) {
  const assets = await listAssets();
  const from = assets.find((row) => row.id === data.assetId);
  const to = assets.find((row) => row.id === data.toAssetId);
  const fromAmount = from ? convertAmount(amount, data.currency, from.currency) : amount;
  const toAmount = to ? convertAmount(amount, data.currency, to.currency) : amount;
  if ((kind === "deposit" || kind === "adjust" || kind === "payment") && from) {
    return [{ id: from.id, delta: accountDelta(kind, from, fromAmount) }];
  }
  if (kind === "transfer" && from && to) {
    return [
      { id: from.id, delta: accountDelta(kind, from, fromAmount, "from") },
      { id: to.id, delta: accountDelta(kind, to, toAmount, "to") },
    ];
  }
  return [];
}

async function persistSettings() {
  await saveSettings(settings);
  applyTheme(settings.theme);
}

async function afterSave(hash) {
  await reload();
  go(hash);
}

function setTxType(kind) {
  const form = app.querySelector("#txForm");
  if (!form) return;
  form.dataset.kind = kind;
  const assetId = form.querySelector("[name=assetId]")?.value;
  const asset = cache.assets.find((row) => row.id === assetId);
  const hint = app.querySelector("#txHint");
  if (hint) {
    if (kind === "transfer") {
      hint.textContent = "Money leaves the From account. If To is a bill, loan, or utility, the amount due goes down.";
    } else if (isOutgoingAccount(asset)) {
      hint.textContent =
        kind === "payment" || kind === "adjust"
          ? "This adds to the amount due (coming out of savings)."
          : "This reduces the amount due (you paid it).";
    } else {
      hint.textContent = isDeduction(kind) ? "This subtracts from the account." : "This adds to the account.";
    }
  }
  form.querySelector("#categoryField")?.classList.toggle("hidden", kind === "transfer");
  form.querySelector("#toField")?.classList.toggle("hidden", kind !== "transfer");
  const assetLabel = form.querySelector("#assetField");
  if (assetLabel) assetLabel.childNodes[0].textContent = kind === "transfer" ? "From" : "Account";
  const select = form.querySelector("[name=category]");
  if (select && kind !== "transfer") {
    const cats = kind === "deposit" || kind === "adjust" ? settings.incomeCategories : settings.expenseCategories;
    select.innerHTML = cats.map((cat) => `<option value="${cat.id}">${escapeHtml(cat.label)}</option>`).join("");
  }
}

function updateFxHint() {
  const hint = app.querySelector("#fxHint");
  if (!hint) return;
  const form = app.querySelector("#accountForm, #txForm");
  if (!form) {
    hint.textContent = "";
    return;
  }
  const currency = form.querySelector("[name=currency]")?.value;
  const amount = Number(form.querySelector("[name=initialBalance], [name=amount]")?.value) || 0;
  hint.textContent = fxHintHtml(amount, currency);
}

function updateAccountTypeUi() {
  const type = app.querySelector("#accountType")?.value;
  const due = app.querySelector("#dueField");
  const custom = app.querySelector("#customField");
  const label = app.querySelector("#balanceLabel");
  if (due) due.classList.toggle("hidden", !isDueType(type));
  if (custom) custom.classList.toggle("hidden", type !== "custom");
  if (label) {
    const text = isAmountDueType(type) ? "Initial amount due" : "Initial balance";
    const node = [...label.childNodes].find((item) => item.nodeType === Node.TEXT_NODE);
    if (node) node.textContent = text;
    else label.prepend(text);
  }
  updateFxHint();
  updateBalancePreview();
}

function updateBalancePreview() {
  const form = app.querySelector("#accountForm");
  const computed = app.querySelector("#computedBalance");
  if (!form || !computed) return;
  const type = form.querySelector("[name=category]")?.value || "bank";
  const currency = form.querySelector("[name=currency]")?.value || settings.defaultCurrency;
  const opening = Number(form.querySelector("[name=initialBalance]")?.value) || 0;
  const draft = { id: parseRoute().id || "", category: normalizeCategory(type) };
  const total = dueAmount({ ...draft, initialBalance: opening });
  const tone = amountTone(draft, total);
  const label = isOutgoingAccount(draft) ? "Amount due" : "Current balance";
  const net = accountNet(draft.id);
  const netTone = isOutgoingAccount(draft) ? (net > 0 ? "out" : "in") : net < 0 ? "out" : "in";
  computed.innerHTML = `<span class="label">${label}</span><span class="computed-parts">${moneyBlock(total, currency, tone)}<small class="when">Transactions ${moneyBlock(net, currency, netTone)}</small></span>`;
}

async function ensureSortOrder() {
  const groups = new Map();
  for (const row of cache.assets) {
    const key = sectionId(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  for (const rows of groups.values()) {
    const missing = rows.filter((row) => row.sortOrder == null);
    if (!missing.length) continue;
    const max = rows.reduce((n, row) => Math.max(n, Number(row.sortOrder) || 0), 0);
    missing.sort(byName);
    for (let i = 0; i < missing.length; i++) {
      missing[i].sortOrder = max + (i + 1) * 10;
      await saveAsset({ ...missing[i], updatedAt: new Date().toISOString() });
    }
  }
}

async function moveAccount(id, dir) {
  const row = cache.assets.find((item) => item.id === id);
  if (!row) return;
  const peers = sortedAssets(sectionPeers(row));
  const i = peers.findIndex((item) => item.id === id);
  const j = i + (dir === "up" ? -1 : 1);
  if (i < 0 || j < 0 || j >= peers.length) return;
  const ids = peers.map((item) => item.id);
  [ids[i], ids[j]] = [ids[j], ids[i]];
  for (let k = 0; k < ids.length; k++) {
    const asset = cache.assets.find((item) => item.id === ids[k]);
    await saveAsset({ ...asset, sortOrder: (k + 1) * 10, updatedAt: new Date().toISOString() });
  }
  await reload();
  route();
}

function jpyPerUnitFromBaseJpy(map) {
  const rates = { JPY: 1 };
  for (const code of ["USD", "PHP"]) {
    const perJpy = Number(map[code] ?? map[code.toLowerCase()]);
    if (perJpy > 0) rates[code] = 1 / perJpy;
  }
  return rates;
}

async function fetchLiveRates() {
  let lastError = null;
  for (const url of RATE_URLS) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const map = data.rates || data.jpy || {};
      const rates = jpyPerUnitFromBaseJpy(map);
      if (rates.USD && rates.PHP) {
        return { rates, source: url.includes("er-api") ? "open.er-api.com" : "currency-api" };
      }
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("Rate lookup failed");
}

async function refreshRates({ force = false } = {}) {
  if (settings.autoRates === false && !force) return false;
  const updated = settings.ratesUpdatedAt ? Date.parse(settings.ratesUpdatedAt) : 0;
  if (!force && updated && Date.now() - updated < RATE_REFRESH_MS) return false;
  try {
    const { rates, source } = await fetchLiveRates();
    settings.rates = { ...settings.rates, ...rates, JPY: 1 };
    settings.ratesUpdatedAt = new Date().toISOString();
    settings.ratesSource = source;
    settings.ratesError = "";
    await persistSettings();
    return true;
  } catch {
    settings.ratesError = "Using saved rates (offline or rate lookup failed).";
    return false;
  }
}

async function route() {
  try {
    const r = parseRoute();
    if (r.name === "account") return await renderAccount(r.id);
    if (r.name === "account-form") return await renderAccountForm(r.id);
    if (r.name === "activity") return await renderActivity();
    if (r.name === "tx-form") return await renderTxForm(r.id, r.accountId);
    if (r.name === "report") return await renderReport();
    if (r.name === "settings") return await renderSettings();
    return await renderAccounts();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<section class="hero"><h1>Could not open this screen</h1><p class="hint">Your data is still on this device.</p><button class="primary" data-go="#/">Back to accounts</button></section>`;
  }
}

app.addEventListener("click", async (e) => {
  const move = e.target.closest("[data-move]");
  if (move) {
    e.preventDefault();
    if (move.disabled) return;
    await moveAccount(move.dataset.id, move.dataset.move);
    return;
  }
  const toggle = e.target.closest("[data-toggle]")?.dataset.toggle;
  if (toggle) {
    e.preventDefault();
    await setCollapsed(toggle, !isCollapsed(toggle));
    return;
  }
  const collapseAll = e.target.closest("[data-collapse-all]")?.dataset.collapseAll;
  if (collapseAll) {
    e.preventDefault();
    await setCollapsedMany(collapseAll.split(",").filter(Boolean), true);
    return;
  }
  const expandAll = e.target.closest("[data-expand-all]")?.dataset.expandAll;
  if (expandAll) {
    e.preventDefault();
    await setCollapsedMany(expandAll.split(",").filter(Boolean), false);
    return;
  }
  const clearBtn = e.target.closest("[data-clear]");
  if (clearBtn) {
    e.preventDefault();
    const field = clearBtn.parentElement?.querySelector("input, textarea");
    if (field) {
      field.value = "";
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
      field.focus();
    }
    return;
  }
  if (e.target.id === "refreshRates") {
    await refreshRates({ force: true });
    renderSettings();
    return;
  }
  if (e.target.id === "saveLocalBackup") {
    await saveAutoBackup({ force: true });
    renderSettings();
    return;
  }
  const goTo = e.target.closest("[data-go]")?.dataset.go;
  if (goTo) {
    e.preventDefault();
    go(goTo);
    return;
  }
  if (e.target.id === "prevMonth") {
    ui.month = shiftMonth(ui.month, -1);
    route();
    return;
  }
  if (e.target.id === "nextMonth") {
    ui.month = shiftMonth(ui.month, 1);
    route();
    return;
  }
  const theme = e.target.closest("[data-theme-pick]")?.dataset.themePick;
  if (theme) {
    applyTheme(theme);
    await persistSettings();
    renderSettings();
    return;
  }
  const txType = e.target.closest("[data-tx-type]")?.dataset.txType;
  if (txType) {
    ui.txType = txType;
    renderActivity();
    return;
  }
  const reportKind = e.target.closest("[data-report-kind]")?.dataset.reportKind;
  if (reportKind) {
    ui.reportKind = reportKind;
    renderReport();
    return;
  }
  const addCat = e.target.closest("[data-add-cat]")?.dataset.addCat;
  if (addCat) {
    const label = app.querySelector(`#new-${addCat}`)?.value.trim();
    if (!label) return;
    const id = `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Math.floor(Math.random() * 99)}`;
    settings[addCat].push({ id, label });
    await persistSettings();
    renderSettings();
    return;
  }
  const delCat = e.target.closest("[data-del-cat]")?.dataset.delCat;
  if (delCat) {
    const [key, index] = delCat.split(":");
    settings[key].splice(Number(index), 1);
    await persistSettings();
    renderSettings();
    return;
  }
  if (e.target.id === "deleteAccount") {
    if (!confirm("Delete this account?")) return;
    const id = parseRoute().id;
    await deleteAsset(id);
    await afterSave("#/");
    return;
  }
  if (e.target.id === "deleteTx") {
    if (!confirm("Delete this transaction?")) return;
    const routeNow = parseRoute();
    const row = await getTransaction(routeNow.id);
    if (row?.effect?.changes) await applyChanges(row.effect.changes.map((c) => ({ id: c.id, delta: -c.delta })));
    await deleteTransaction(routeNow.id);
    await afterSave(routeNow.accountId ? `#/account/${routeNow.accountId}` : "#/activity");
    return;
  }
  if (e.target.id === "backupBtn") {
    const data = await exportAll();
    downloadFile(`bochog-kakei-backup-${today()}.json`, JSON.stringify(data, null, 2), "application/json");
    return;
  }
  if (e.target.id === "csvBtn" || e.target.id === "excelBtn" || e.target.id === "pdfBtn") {
    const headers = ["Date", "Name", "Category", "Account", "Amount", "Currency"];
    const rows = reportRows();
    const name = `bochog-kakei-${ui.reportKind}-${today()}`;
    if (e.target.id === "csvBtn") downloadFile(`${name}.csv`, toCsv(headers, rows), "text/csv");
    if (e.target.id === "excelBtn") downloadFile(`${name}.xls`, toExcelXml("Report", headers, rows), "application/vnd.ms-excel");
    if (e.target.id === "pdfBtn") {
      const table = `<h1>Bochog Kakei</h1><p>${ui.reportKind} · ${monthLabel(ui.month)}</p><table><tr>${headers
        .map((h) => `<th>${h}</th>`)
        .join("")}</tr>${rows.map((row) => `<tr>${row.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table>`;
      printReport("Bochog Kakei report", table);
    }
  }
});

app.addEventListener("change", async (e) => {
  if (e.target.id === "accountType") {
    updateAccountTypeUi();
    return;
  }
  if (e.target.id === "txType") {
    setTxType(e.target.value);
    return;
  }
  if (e.target.name === "assetId" && app.querySelector("#txForm")) {
    setTxType(app.querySelector("#txType")?.value || "payment");
    return;
  }
  if (e.target.name === "currency" || e.target.name === "initialBalance" || e.target.name === "amount") {
    updateFxHint();
    updateBalancePreview();
    return;
  }
  if (e.target.id === "defaultCurrency") {
    settings.defaultCurrency = e.target.value;
    await persistSettings();
    return;
  }
  if (e.target.id === "autoRates") {
    settings.autoRates = e.target.checked;
    await persistSettings();
    if (settings.autoRates) await refreshRates({ force: true });
    renderSettings();
    return;
  }
  if (e.target.id === "rateUSD" || e.target.id === "ratePHP") {
    settings.rates.USD = Number(app.querySelector("#rateUSD").value) || settings.rates.USD;
    settings.rates.PHP = Number(app.querySelector("#ratePHP").value) || settings.rates.PHP;
    await persistSettings();
    return;
  }
  if (e.target.dataset.catKey) {
    const key = e.target.dataset.catKey;
    const index = Number(e.target.dataset.catIndex);
    const label = e.target.value.trim();
    if (!label) return;
    settings[key][index].label = label;
    await persistSettings();
    return;
  }
  if (e.target.id !== "importFile") return;
  const file = e.target.files?.[0];
  if (!file) return;
  if (!confirm("Import will replace data on this device. Continue?")) return;
  await importAll(JSON.parse(await file.text()));
  await reload();
  go("#/");
});

app.addEventListener("input", (e) => {
  if (e.target.name === "initialBalance" || e.target.name === "amount" || e.target.name === "currency") {
    updateFxHint();
    updateBalancePreview();
  }
  const start = e.target.selectionStart;
  if (e.target.id === "txSearch") {
    ui.txQuery = e.target.value;
    renderActivity().then(() => restoreCaret("txSearch", start));
  }
});

app.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (e.target.id === "accountForm") {
    const data = formData(e.target);
    const existing = parseRoute().id ? await getAsset(parseRoute().id) : null;
    const cat = catMeta(data.category);
    const id = existing?.id || uid();
    const category = normalizeCategory(data.category);
    const opening = Number(data.initialBalance) || 0;
    const draft = { id, category, initialBalance: opening, liability: Boolean(cat.liability) };
    await saveAsset({
      id,
      name: data.name.trim(),
      category,
      initialBalance: opening,
      value: settledValue(draft, opening),
      currency: data.currency,
      notes: data.notes || "",
      customType: data.category === "custom" ? (data.customType || "").trim() : "",
      dueDate: isDueType(data.category) ? data.dueDate || "" : "",
      liability: Boolean(cat.liability),
      sortOrder: existing?.sortOrder ?? sectionPeers({ category: data.category }).reduce((n, row) => Math.max(n, Number(row.sortOrder) || 0), 0) + 10,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await afterSave(`#/account/${id}`);
    return;
  }
  if (e.target.id === "txForm") {
    const data = formData(e.target);
    const kind = data.type || e.target.dataset.kind || "payment";
    const existing = parseRoute().id ? await getTransaction(parseRoute().id) : null;
    if (existing?.effect?.changes) {
      await applyChanges(existing.effect.changes.map((c) => ({ id: c.id, delta: -c.delta })));
    }
    const amount = Number(data.amount) || 0;
    if (kind === "transfer" && (!data.assetId || !data.toAssetId || data.assetId === data.toAssetId)) {
      alert("Choose two different accounts for a transfer.");
      return;
    }
    const changes = await computeEffect(kind, data, amount);
    await applyChanges(changes);
    await saveTransaction({
      id: existing?.id || uid(),
      type: kind,
      name: data.name.trim(),
      amount,
      currency: data.currency,
      date: data.date,
      category: data.category || "",
      assetId: data.assetId || "",
      toAssetId: kind === "transfer" ? data.toAssetId || "" : "",
      notes: data.notes || "",
      effect: { changes },
      fx: {
        rates: { ...(settings.rates || DEFAULT_SETTINGS.rates) },
        defaultCurrency: settings.defaultCurrency,
        converted: toDefault(amount, data.currency),
      },
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const accountId = e.target.dataset.accountId || data.assetId;
    await afterSave(accountId ? `#/account/${accountId}` : "#/activity");
  }
});

function restoreCaret(id, start) {
  const el = app.querySelector(`#${id}`);
  if (!el) return;
  el.focus();
  if (typeof start === "number") el.setSelectionRange(start, start);
}

window.addEventListener("hashchange", route);

const SNAPSHOT_PRUNE_KEY = "bochog-prune-snapshots-v13";

async function boot() {
  applyTheme(localStorage.getItem("bochog-theme") || "light");
  try {
    if (!localStorage.getItem(SNAPSHOT_PRUNE_KEY)) {
      await wipeSnapshots();
      localStorage.setItem(SNAPSHOT_PRUNE_KEY, "1");
    }
    await reload();
    await route();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<section class="hero"><h1>Could not open Bochog Kakei</h1><p class="hint">Try again, or open the home page instead of an account link.</p><button class="primary" data-go="#/">Open accounts</button></section>`;
    return;
  }
  refreshRates().catch(() => {});
}

boot();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}
