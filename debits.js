export const DEFAULT_LOW_MARGIN = 30000;

export const BANKS = [
  { id: "mizuho", label: "Mizuho", aliases: ["mizuho", "みずほ"] },
  {
    id: "jp-bank",
    label: "JP Bank",
    aliases: ["jp bank", "jpbank", "japan post", "yucho", "yuucho", "ゆうちょ", "郵便"],
  },
  { id: "smbc", label: "SMBC", aliases: ["smbc", "sumitomo", "三井住友"] },
  { id: "yokohama", label: "Yokohama Bank", aliases: ["yokohama", "横浜"] },
];

export const DEFAULT_AUTO_DEBITS = [
  { id: "A-01", payor: "Metlife Insurance", debitDay: 27, bankId: "mizuho", amount: 0, enabled: true, match: ["metlife", "メットライフ"] },
  { id: "A-02", payor: "Orico Mastercard", debitDay: 27, bankId: "mizuho", amount: 0, enabled: true, match: ["orico", "オリコ"] },
  { id: "A-03", payor: "Saison Gold", debitDay: 4, bankId: "mizuho", amount: 0, enabled: true, match: ["saison gold", "セゾンゴールド"] },
  { id: "A-04", payor: "Saison Mitsui", debitDay: 4, bankId: "mizuho", amount: 0, enabled: true, match: ["saison mitsui", "セゾン三井"] },
  { id: "B-01", payor: "Hannah's Food", debitDay: 15, bankId: "jp-bank", amount: 0, enabled: true, match: ["hannah"] },
  { id: "B-02", payor: "Aeon Card", debitDay: 2, bankId: "jp-bank", amount: 0, enabled: true, match: ["aeon", "イオン"] },
  { id: "B-03", payor: "Taiju Insurance", debitDay: 27, bankId: "jp-bank", amount: 0, enabled: true, match: ["taiju", "大樹"] },
  { id: "C-01", payor: "House Loan", debitDay: 27, bankId: "smbc", amount: 0, enabled: true, match: ["house loan", "housing loan", "mortgage", "住宅"] },
  { id: "D-01", payor: "Car Loan", debitDay: 27, bankId: "yokohama", amount: 0, enabled: true, match: ["car loan", "auto loan", "マイカー", "自動車"] },
];

export function bankById(id) {
  return BANKS.find((row) => row.id === id) || null;
}

export function mergeAutoDebits(saved, defaults = DEFAULT_AUTO_DEBITS) {
  const list = Array.isArray(saved) ? saved.map(normalizeDebit).filter(Boolean) : [];
  const merged = list.map((row) => {
    const fallback = defaults.find((item) => item.id === row.id);
    return fallback ? { ...fallback, ...row, match: row.match?.length ? row.match : fallback.match } : row;
  });
  for (const item of defaults) {
    if (!merged.some((row) => row.id === item.id)) merged.push({ ...item });
  }
  return merged;
}

export function normalizeDebit(row) {
  if (!row || !row.id) return null;
  return {
    id: String(row.id),
    payor: String(row.payor || "").trim() || "Unnamed",
    debitDay: clampDay(row.debitDay),
    bankId: String(row.bankId || ""),
    amount: Math.max(0, Number(row.amount) || 0),
    enabled: row.enabled !== false,
    match: Array.isArray(row.match) ? row.match.map(String) : [],
    currency: row.currency || "JPY",
  };
}

export function clampDay(value) {
  const day = Math.round(Number(value) || 1);
  return Math.min(31, Math.max(1, day));
}

export function debitDayThisMonth(debitDay, date = new Date()) {
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return Math.min(clampDay(debitDay), last);
}

export function isUpcomingDebit(debitDay, date = new Date()) {
  return debitDayThisMonth(debitDay, date) >= date.getDate();
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesAlias(name, aliases) {
  const n = normalizeName(name);
  if (!n) return false;
  return (aliases || []).some((alias) => {
    const a = normalizeName(alias);
    return a && (n === a || n.includes(a));
  });
}

function isBankLike(row) {
  const cat = String(row?.category || "").toLowerCase();
  return cat === "bank" || cat === "cash" || cat === "savings";
}

function isPayorLike(row) {
  const cat = String(row?.category || "").toLowerCase();
  return row?.liability || ["credit-card", "loan", "insurance", "utilities", "tithes"].includes(cat);
}

export function findBankAccount(assets, bank) {
  const aliases = [bank.label, ...(bank.aliases || [])];
  const matches = (assets || [])
    .filter((row) => isBankLike(row) && matchesAlias(row.name, aliases))
    .sort((a, b) => {
      const catA = String(a.category).toLowerCase() === "bank" ? 0 : 1;
      const catB = String(b.category).toLowerCase() === "bank" ? 0 : 1;
      return catA - catB || String(a.name).localeCompare(String(b.name));
    });
  return matches[0] || null;
}

export function findPayorAccount(assets, debit) {
  const aliases = [debit.payor, ...(debit.match || [])];
  const matches = (assets || []).filter((row) => matchesAlias(row.name, aliases));
  return matches.find(isPayorLike) || matches[0] || null;
}

export function resolveDebitAmount(debit, assets, dueAmount, convertToDefault) {
  if (Number(debit.amount) > 0) {
    return convertToDefault(Number(debit.amount), debit.currency || "JPY");
  }
  const source = findPayorAccount(assets, debit);
  if (!source) return 0;
  return convertToDefault(Math.abs(Number(dueAmount(source)) || 0), source.currency || "JPY");
}

export function fundingStatus(available, upcoming, lowMargin = DEFAULT_LOW_MARGIN) {
  if (available < 0) {
    return { id: "insufficient", label: "Insufficient", icon: "❌" };
  }
  if (upcoming > 0 && available <= (Number(lowMargin) || 0)) {
    return { id: "low", label: "Low Margin", icon: "⚠" };
  }
  return { id: "ok", label: "Sufficient", icon: "✅" };
}

export function bankFunding({
  assets,
  autoDebits,
  banks = BANKS,
  now = new Date(),
  dueAmount,
  convertToDefault,
  lowMargin = DEFAULT_LOW_MARGIN,
}) {
  return banks.map((bank) => {
    const account = findBankAccount(assets, bank);
    const current = account ? convertToDefault(dueAmount(account), account.currency) : 0;
    const items = (autoDebits || [])
      .filter((row) => row.enabled !== false && row.bankId === bank.id && isUpcomingDebit(row.debitDay, now))
      .map((row) => {
        const amount = resolveDebitAmount(row, assets, dueAmount, convertToDefault);
        const source = Number(row.amount) > 0 ? null : findPayorAccount(assets, row);
        return {
          ...row,
          resolvedAmount: amount,
          sourceAccount: source,
          debitDayActual: debitDayThisMonth(row.debitDay, now),
        };
      });
    const upcoming = items.reduce((sum, row) => sum + row.resolvedAmount, 0);
    const available = current - upcoming;
    return {
      bank,
      account,
      current,
      upcoming,
      available,
      items,
      status: fundingStatus(available, upcoming, lowMargin),
    };
  });
}
