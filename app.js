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
  listAssets,
  listTransactions,
  saveAsset,
  saveSettings,
  saveTransaction,
} from "./db.js";
import { downloadFile, printReport, toCsv, toExcelXml } from "./export.js";

const app = document.getElementById("app");

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
  const [a, b] = parts;
  if (a === "account" && b === "new") return { name: "account-form", id: null };
  if (a === "account" && b) return { name: "account-form", id: b };
  if (a === "activity" && b === "new") return { name: "tx-form", id: null };
  if (a === "activity" && b) return { name: "tx-form", id: b };
  if (a === "activity") return { name: "activity" };
  if (a === "report") return { name: "report" };
  if (a === "settings") return { name: "settings" };
  if (a === "assets" || a === "budget" || a === "goals" || a === "reports") return { name: "accounts" };
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
  const n = Number(amount) || 0;
  const digits = currency === "JPY" ? 0 : 2;
  const symbol = { JPY: "¥", PHP: "₱", USD: "$" }[currency] || "";
  return `${symbol}${n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function toDefault(amount, currency) {
  const rates = settings.rates || DEFAULT_SETTINGS.rates;
  const from = rates[currency] || 1;
  const to = rates[settings.defaultCurrency] || 1;
  return (Number(amount) || 0) * (from / to);
}

function catMeta(id) {
  return settings.assetCategories.find((item) => item.id === id) || { id, label: id, liability: false, group: "other" };
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

function isLiability(asset) {
  const cat = catMeta(asset?.category);
  return Boolean(asset?.liability || cat.liability || cat.group === "out");
}

function isDueType(type) {
  return type === "bill" || type === "insurance";
}

function isAmountDueType(type) {
  return type === "credit-card" || type === "bill" || type === "insurance";
}

function groupOf(asset) {
  const cat = catMeta(asset.category);
  if (cat.group === "in" || cat.group === "out") return cat.group;
  if (["cash", "bank", "savings"].includes(asset.category)) return "in";
  if (["credit-card", "bill", "insurance"].includes(asset.category) || isLiability(asset)) return "out";
  return "other";
}

function txKind(row) {
  if (row.type === "income" || row.type === "deposit") return "deposit";
  if (row.type === "expense" || row.type === "payment") return "payment";
  if (row.type === "adjust" || row.type === "transfer") return row.type;
  return "payment";
}

async function reload() {
  const [assets, txs, nextSettings] = await Promise.all([listAssets(), listTransactions(), getSettings()]);
  cache = { assets, txs };
  settings = nextSettings;
  applyTheme(settings.theme);
}

function moneyNow() {
  let inBanks = 0;
  let cards = 0;
  let bills = 0;
  for (const row of cache.assets) {
    const value = toDefault(row.value, row.currency);
    const group = groupOf(row);
    if (group === "in") inBanks += value;
    else if (row.category === "credit-card") cards += value;
    else if (group === "out") bills += value;
  }
  const comingOut = cards + bills;
  return { inBanks, cards, bills, comingOut, available: inBanks - comingOut };
}

function monthTxs(month = ui.month) {
  return cache.txs.filter((row) => (row.date || "").startsWith(month));
}

function flowFor(rows) {
  let income = 0;
  let expense = 0;
  for (const row of rows) {
    const kind = txKind(row);
    const value = toDefault(row.amount, row.currency);
    if (kind === "deposit") income += value;
    if (kind === "payment") expense += value;
  }
  return { income, expense, left: income - expense };
}

function groupSum(rows, kind) {
  const want = kind === "income" ? "deposit" : "payment";
  const map = new Map();
  for (const row of rows.filter((item) => txKind(item) === want)) {
    const key = row.category || "other";
    map.set(key, (map.get(key) || 0) + toDefault(row.amount, row.currency));
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

function accountCard(row) {
  const cat = catMeta(row.category);
  const due = row.dueDate ? ` · due ${prettyDate(row.dueDate)}` : "";
  const cls = groupOf(row) === "out" ? "out" : "in";
  return `<article class="card">
    <a class="card-main" href="#/account/${row.id}">
      <div class="meta">
        <h3>${escapeHtml(row.name)}</h3>
        <p class="when">${escapeHtml(cat.label)}${due}</p>
      </div>
      <strong class="amount ${cls}">${formatMoney(row.value, row.currency)}</strong>
    </a>
  </article>`;
}

function sectionList(title, rows) {
  if (!rows.length) return "";
  return `<h2 class="section-title">${escapeHtml(title)}</h2>
    <div class="list">${rows.map(accountCard).join("")}</div>`;
}

async function renderAccounts() {
  const now = moneyNow();
  const cash = cache.assets.filter((row) => groupOf(row) === "in").sort(byName);
  const cards = cache.assets.filter((row) => row.category === "credit-card").sort(byName);
  const insurance = cache.assets.filter((row) => row.category === "insurance").sort(byDue);
  const bills = cache.assets
    .filter((row) => row.category === "bill" || (groupOf(row) === "out" && row.category !== "credit-card" && row.category !== "insurance"))
    .sort(byDue);
  app.innerHTML = `
    <header class="top">
      <div class="brand">
        ${logo()}
        <div>
          <p class="eyebrow">Household money</p>
          <h1>Bochog Kakei</h1>
        </div>
      </div>
      <button class="primary" data-go="#/account/new">Add</button>
    </header>
    <section class="hero">
      <p class="eyebrow">Current savings</p>
      <p class="hero-amount">${formatMoney(now.available)}</p>
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
      <p class="hint" style="margin-top:12px">Cash and bank balances minus credit cards, utilities, insurance, and other bills due.</p>
    </section>
    ${
      cache.assets.length
        ? `${sectionList("Cash & banks", cash)}
           ${sectionList("Credit cards", cards)}
           ${sectionList("Insurance", insurance)}
           ${sectionList("Bills due", bills)}`
        : `<div class="empty">
            <h2>Start with balances</h2>
            <p>Add each bank or cash account, then add credit cards and bills (utilities, insurance). Current savings is banks minus those upcoming expenses.</p>
            <button class="primary" data-go="#/account/new">Add an account</button>
          </div>`
    }
    ${tabbar("accounts")}
  `;
}

function byName(a, b) {
  return (a.name || "").localeCompare(b.name || "");
}

function byDue(a, b) {
  return (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || byName(a, b);
}

async function renderAccountForm(id) {
  const row = id ? await getAsset(id) : null;
  const selectedType = row?.category || "bank";
  app.innerHTML = `
    <div class="form-top">
      <button class="ghost" data-go="#/">Back</button>
      ${id ? `<button class="danger compact" id="deleteAccount" type="button">Delete</button>` : ""}
    </div>
    <h1>${id ? "Account" : "New account"}</h1>
    <form class="form" id="accountForm">
      <label>Name
        <input name="name" required value="${escapeAttr(row?.name || "")}" placeholder="MUFG, cash wallet, Tokyo Gas…" />
      </label>
      <label>Type
        <input type="hidden" name="category" id="accountType" value="${escapeAttr(selectedType)}" />
        <div class="type-grid">
          ${settings.assetCategories
            .map(
              (cat) =>
                `<button type="button" class="chip ${selectedType === cat.id ? "active" : ""}" data-account-type="${cat.id}">${escapeHtml(cat.label)}</button>`
            )
            .join("")}
        </div>
      </label>
      <label>Currency
        <select name="currency">
          ${CURRENCIES.map((c) => `<option ${ (row?.currency || settings.defaultCurrency) === c ? "selected" : "" }>${c}</option>`).join("")}
        </select>
      </label>
      <label id="balanceLabel">${isAmountDueType(selectedType) ? "Amount due" : "Current balance"}
        <input name="value" type="number" step="any" required value="${escapeAttr(row?.value ?? "")}" />
      </label>
      <label id="dueField" class="${isDueType(selectedType) ? "" : "hidden"}">Due date
        <input name="dueDate" type="date" value="${escapeAttr(row?.dueDate || "")}" />
      </label>
      <label>Notes
        <textarea name="notes">${escapeHtml(row?.notes || "")}</textarea>
      </label>
      <button class="primary" type="submit">Save</button>
    </form>
    ${tabbar("accounts")}
  `;
}

async function renderActivity() {
  const q = ui.txQuery.trim().toLowerCase();
  const rows = monthTxs()
    .filter((row) => ui.txType === "all" || txKind(row) === ui.txType)
    .filter((row) => !q || [row.name, row.notes, categoryLabel(txKind(row) === "deposit" ? "income" : "expense", row.category)].join(" ").toLowerCase().includes(q))
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || ""));
  app.innerHTML = `
    <header class="top">
      <div>
        <p class="eyebrow">Transactions</p>
        <h1>Activity</h1>
      </div>
      <button class="primary" data-go="#/activity/new">Add</button>
    </header>
    ${monthNav()}
    <input class="search" id="txSearch" type="search" placeholder="Search" value="${escapeAttr(ui.txQuery)}" />
    <div class="filters">
      ${["all", "payment", "deposit", "transfer", "adjust"]
        .map((key) => `<button class="chip ${ui.txType === key ? "active" : ""}" data-tx-type="${key}">${key === "all" ? "All" : key[0].toUpperCase() + key.slice(1)}</button>`)
        .join("")}
    </div>
    ${
      rows.length
        ? `<div class="list">${rows
            .map((row) => {
              const kind = txKind(row);
              const asset = cache.assets.find((item) => item.id === row.assetId);
              const to = cache.assets.find((item) => item.id === row.toAssetId);
              const sign = kind === "deposit" ? "+" : kind === "payment" ? "−" : kind === "adjust" ? "=" : "→";
              const cls = kind === "deposit" ? "in" : kind === "payment" ? "out" : "";
              const where = kind === "transfer"
                ? `${asset?.name || "Account"} → ${to?.name || "Account"}`
                : asset?.name || categoryLabel(kind === "deposit" ? "income" : "expense", row.category);
              return `<article class="card">
                <a class="card-main" href="#/activity/${row.id}">
                  <div class="meta">
                    <h3>${escapeHtml(row.name || kind)}</h3>
                    <p class="when">${prettyDate(row.date)} · ${escapeHtml(where)}</p>
                  </div>
                  <strong class="amount ${cls}">${sign}${formatMoney(row.amount, row.currency)}</strong>
                </a>
              </article>`;
            })
            .join("")}</div>`
        : `<div class="empty"><h2>No activity this month</h2><p>Add a payment, deposit, or transfer. Account balances update when you save.</p></div>`
    }
    ${tabbar("activity")}
  `;
}

function txTypeOptions(current) {
  return ["payment", "deposit", "transfer", "adjust"]
    .map((key) => `<button type="button" class="chip ${current === key ? "active" : ""}" data-pick-type="${key}">${key[0].toUpperCase() + key.slice(1)}</button>`)
    .join("");
}

function accountOptions(selected, extra = "") {
  return `<option value="">${extra || "Select account"}</option>${cache.assets
    .map((row) => `<option value="${row.id}" ${selected === row.id ? "selected" : ""}>${escapeHtml(row.name)}</option>`)
    .join("")}`;
}

async function renderTxForm(id) {
  const row = id ? await getTransaction(id) : null;
  const kind = row ? txKind(row) : "payment";
  const cats = kind === "deposit" ? settings.incomeCategories : settings.expenseCategories;
  app.innerHTML = `
    <div class="form-top">
      <button class="ghost" data-go="#/activity">Back</button>
      ${id ? `<button class="danger compact" id="deleteTx" type="button">Delete</button>` : ""}
    </div>
    <h1>${id ? "Transaction" : "New transaction"}</h1>
    <form class="form" id="txForm" data-kind="${kind}">
      <div class="type-toggle">${txTypeOptions(kind)}</div>
      <label>Date
        <input name="date" type="date" required value="${escapeAttr(row?.date || today())}" />
      </label>
      <label>Name
        <input name="name" value="${escapeAttr(row?.name || "")}" placeholder="Electric bill, salary, card payment…" />
      </label>
      <label>Amount
        <input name="amount" type="number" step="any" required value="${escapeAttr(row?.amount ?? "")}" />
      </label>
      <div class="row">
        <label>Currency
          <select name="currency">
            ${CURRENCIES.map((c) => `<option ${ (row?.currency || settings.defaultCurrency) === c ? "selected" : "" }>${c}</option>`).join("")}
          </select>
        </label>
        <label id="categoryField" class="${kind === "transfer" || kind === "adjust" ? "hidden" : ""}">Category
          <select name="category">
            ${cats.map((cat) => `<option value="${cat.id}" ${row?.category === cat.id ? "selected" : ""}>${escapeHtml(cat.label)}</option>`).join("")}
          </select>
        </label>
      </div>
      <label id="assetField">${kind === "transfer" ? "From" : "Account"}
        <select name="assetId" required>${accountOptions(row?.assetId)}</select>
      </label>
      <label id="toField" class="${kind === "transfer" ? "" : "hidden"}">To
        <select name="toAssetId">${accountOptions(row?.toAssetId, "Select account")}</select>
      </label>
      <label>Notes
        <textarea name="notes">${escapeHtml(row?.notes || "")}</textarea>
      </label>
      <p class="hint">Payment, deposit, and transfer update the account balances. Adjustment sets the account to this amount.</p>
      <button class="primary" type="submit">Save</button>
    </form>
    ${tabbar("activity")}
  `;
}

async function renderReport() {
  const rows = monthTxs();
  const flow = flowFor(rows);
  const kind = ui.reportKind;
  const items = groupSum(rows, kind);
  app.innerHTML = `
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
          <span>Income</span>
          <strong class="amount in">${formatMoney(flow.income)}</strong>
        </div>
        <div>
          <span>Expenses</span>
          <strong class="amount out">${formatMoney(flow.expense)}</strong>
        </div>
      </div>
    </section>
    <div class="filters">
      <button class="chip ${kind === "expense" ? "active" : ""}" data-report-kind="expense">Expenses</button>
      <button class="chip ${kind === "income" ? "active" : ""}" data-report-kind="income">Income</button>
    </div>
    ${barChart(items, kind)}
    <div class="footer-links">
      <button class="ghost" id="csvBtn" type="button">CSV</button>
      <button class="ghost" id="excelBtn" type="button">Excel</button>
      <button class="ghost" id="pdfBtn" type="button">Print / PDF</button>
    </div>
    ${tabbar("report")}
  `;
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
  app.innerHTML = `
    <header class="top">
      <div>
        <p class="eyebrow">This device only</p>
        <h1>Settings</h1>
      </div>
    </header>
    <h2 class="section-title">Appearance</h2>
    <div class="theme-row">
      <button class="chip ${settings.theme === "light" ? "active" : ""}" data-theme-pick="light">Light</button>
      <button class="chip ${settings.theme === "dark" ? "active" : ""}" data-theme-pick="dark">Dark</button>
    </div>
    <h2 class="section-title">Currency</h2>
    <label>Default
      <select id="defaultCurrency">
        ${CURRENCIES.map((c) => `<option ${settings.defaultCurrency === c ? "selected" : ""}>${c}</option>`).join("")}
      </select>
    </label>
    <div class="row" style="margin-top:10px">
      <label>USD → JPY
        <input id="rateUSD" type="number" step="any" value="${escapeAttr(settings.rates.USD)}" />
      </label>
      <label>PHP → JPY
        <input id="ratePHP" type="number" step="any" value="${escapeAttr(settings.rates.PHP)}" />
      </label>
    </div>
    <h2 class="section-title">Expense categories</h2>
    ${catEditor("expenseCategories")}
    <h2 class="section-title">Income categories</h2>
    ${catEditor("incomeCategories")}
    <h2 class="section-title">Backup</h2>
    <p class="hint">Data stays on this device. Export a copy before clearing the browser.</p>
    <div class="footer-links">
      <button class="ghost" id="backupBtn" type="button">Export backup</button>
      <label class="file-btn ghost">Import backup<input id="importFile" type="file" accept="application/json" /></label>
    </div>
    ${tabbar("settings")}
  `;
}

function catEditor(key) {
  return `<ul class="edit-list">${settings[key]
    .map(
      (row, index) => `<li>
        <input data-cat-key="${key}" data-cat-index="${index}" value="${escapeAttr(row.label)}" />
        <button class="danger compact" data-del-cat="${key}:${index}" type="button">Remove</button>
      </li>`
    )
    .join("")}</ul>
    <div class="add-row">
      <input id="new-${key}" placeholder="New category" />
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
      value: (Number(asset.value) || 0) + delta,
      updatedAt: new Date().toISOString(),
    });
  }
}

function deltaFor(asset, kind, amount) {
  if (!asset) return 0;
  if (kind === "payment") return isLiability(asset) ? amount : -amount;
  if (kind === "deposit") return isLiability(asset) ? -amount : amount;
  return 0;
}

async function computeEffect(kind, data, amount) {
  const assets = await listAssets();
  const from = assets.find((row) => row.id === data.assetId);
  const to = assets.find((row) => row.id === data.toAssetId);
  if (kind === "adjust" && from) {
    return [{ id: from.id, delta: amount - (Number(from.value) || 0) }];
  }
  if (kind === "transfer" && from && to) {
    return [
      { id: from.id, delta: deltaFor(from, "payment", amount) },
      { id: to.id, delta: deltaFor(to, "deposit", amount) },
    ];
  }
  if ((kind === "payment" || kind === "deposit") && from) {
    return [{ id: from.id, delta: deltaFor(from, kind, amount) }];
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
  for (const chip of form.querySelectorAll("[data-pick-type]")) {
    chip.classList.toggle("active", chip.dataset.pickType === kind);
  }
  form.querySelector("#categoryField")?.classList.toggle("hidden", kind === "transfer" || kind === "adjust");
  form.querySelector("#toField")?.classList.toggle("hidden", kind !== "transfer");
  const assetLabel = form.querySelector("#assetField");
  if (assetLabel) assetLabel.childNodes[0].textContent = kind === "transfer" ? "From" : "Account";
  const select = form.querySelector("[name=category]");
  if (select && kind !== "transfer" && kind !== "adjust") {
    const cats = kind === "deposit" ? settings.incomeCategories : settings.expenseCategories;
    select.innerHTML = cats.map((cat) => `<option value="${cat.id}">${escapeHtml(cat.label)}</option>`).join("");
  }
}

function updateAccountTypeUi() {
  const type = app.querySelector("#accountType")?.value;
  const due = app.querySelector("#dueField");
  const label = app.querySelector("#balanceLabel");
  if (due) due.classList.toggle("hidden", !isDueType(type));
  if (label) label.childNodes[0].textContent = isAmountDueType(type) ? "Amount due" : "Current balance";
}

async function route() {
  const r = parseRoute();
  if (r.name === "account-form") return renderAccountForm(r.id);
  if (r.name === "activity") return renderActivity();
  if (r.name === "tx-form") return renderTxForm(r.id);
  if (r.name === "report") return renderReport();
  if (r.name === "settings") return renderSettings();
  return renderAccounts();
}

app.addEventListener("click", async (e) => {
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
  const pickType = e.target.closest("[data-pick-type]")?.dataset.pickType;
  if (pickType) {
    e.preventDefault();
    setTxType(pickType);
    return;
  }
  const accountType = e.target.closest("[data-account-type]")?.dataset.accountType;
  if (accountType) {
    e.preventDefault();
    const input = app.querySelector("#accountType");
    if (input) input.value = accountType;
    for (const chip of app.querySelectorAll("[data-account-type]")) {
      chip.classList.toggle("active", chip.dataset.accountType === accountType);
    }
    updateAccountTypeUi();
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
    const id = parseRoute().id;
    const row = await getTransaction(id);
    if (row?.effect?.changes) await applyChanges(row.effect.changes.map((c) => ({ id: c.id, delta: -c.delta })));
    await deleteTransaction(id);
    await afterSave("#/activity");
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
  if (e.target.id === "defaultCurrency") {
    settings.defaultCurrency = e.target.value;
    await persistSettings();
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
    await saveAsset({
      id: existing?.id || uid(),
      name: data.name.trim(),
      category: data.category,
      value: Number(data.value) || 0,
      currency: data.currency,
      notes: data.notes || "",
      dueDate: isDueType(data.category) ? data.dueDate || "" : "",
      liability: Boolean(cat.liability),
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await afterSave("#/");
    return;
  }
  if (e.target.id === "txForm") {
    const data = formData(e.target);
    const kind = e.target.dataset.kind || "payment";
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
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await afterSave("#/activity");
  }
});

function restoreCaret(id, start) {
  const el = app.querySelector(`#${id}`);
  if (!el) return;
  el.focus();
  if (typeof start === "number") el.setSelectionRange(start, start);
}

window.addEventListener("hashchange", route);

async function boot() {
  applyTheme(localStorage.getItem("bochog-theme") || "light");
  await reload();
  await saveSettings(settings);
  await reload();
  route();
}

boot();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}
