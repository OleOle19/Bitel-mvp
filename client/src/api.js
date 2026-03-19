const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api/v1";

function safeParseJson(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

export function getToken() {
  return localStorage.getItem("bitel_token");
}

export function setToken(token) {
  if (!token) {
    localStorage.removeItem("bitel_token");
    return;
  }
  localStorage.setItem("bitel_token", token);
}

export function getUser() {
  const raw = localStorage.getItem("bitel_user");
  const parsed = safeParseJson(raw, null);
  if (!parsed || typeof parsed !== "object") {
    localStorage.removeItem("bitel_user");
    return null;
  }
  return parsed;
}

export function setUser(user) {
  if (!user) {
    localStorage.removeItem("bitel_user");
    return;
  }
  localStorage.setItem("bitel_user", JSON.stringify(user));
}

export async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "Error");
  }
  if (res.status === 204) {
    return null;
  }
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  const text = await res.text();
  return text ? text : null;
}

export function login(email, password) {
  return apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export function fetchSummary({ period = "day", localId } = {}) {
  const params = new URLSearchParams();
  params.set("period", period);
  if (localId) params.set("localId", localId);
  return apiFetch(`/reports/summary?${params.toString()}`);
}

export function fetchLowStock(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return apiFetch(`/reports/inventory/low-stock${qs ? `?${qs}` : ""}`);
}

export function fetchCashDiffs() {
  return apiFetch("/reports/cash/differences");
}

export function fetchLiveCash(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return apiFetch(`/reports/cash/live${qs ? `?${qs}` : ""}`);
}

export function fetchCashClosures(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return apiFetch(`/reports/cash/closures${qs ? `?${qs}` : ""}`);
}

export function fetchAlerts(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return apiFetch(`/reports/alerts${qs ? `?${qs}` : ""}`);
}

export function fetchKpis(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return apiFetch(`/reports/kpis${qs ? `?${qs}` : ""}`);
}

export function fetchTopProducts(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return apiFetch(`/reports/sales/top-products${qs ? `?${qs}` : ""}`);
}

export function fetchSalesByCategory(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return apiFetch(`/reports/sales/by-category${qs ? `?${qs}` : ""}`);
}

export function globalSearch(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return apiFetch(`/reports/search${qs ? `?${qs}` : ""}`);
}

export function fetchCashReconciliation(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return apiFetch(`/reports/cash/reconciliation${qs ? `?${qs}` : ""}`);
}

export function fetchSalesBySeller() {
  return apiFetch("/reports/sales/by-seller");
}

export function fetchSalesByLocal(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return apiFetch(`/reports/sales/by-local${qs ? `?${qs}` : ""}`);
}

export function fetchInventoryMovements(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return apiFetch(`/inventory/movements${qs ? `?${qs}` : ""}`);
}

export function fetchKardexValued(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return apiFetch(`/reports/inventory/kardex-valued${qs ? `?${qs}` : ""}`);
}

export function fetchInventoryItems(localId) {
  const params = new URLSearchParams();
  if (localId) params.set("localId", localId);
  const qs = params.toString();
  return apiFetch(`/inventory${qs ? `?${qs}` : ""}`);
}

export function fetchTransfers() {
  return apiFetch("/inventory/transfers");
}

export function fetchLocalsLookup() {
  return apiFetch("/locals/lookup");
}

export function createInventoryItem(payload) {
  return apiFetch("/inventory", { method: "POST", body: JSON.stringify(payload) });
}

export function updateInventoryItem(id, payload) {
  return apiFetch(`/inventory/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function adjustInventory(payload) {
  return apiFetch("/inventory/adjust", { method: "POST", body: JSON.stringify(payload) });
}

export function transferInventory(payload) {
  return apiFetch("/inventory/transfer", { method: "POST", body: JSON.stringify(payload) });
}

export function transferInventoryBatch(payload) {
  return apiFetch("/inventory/transfer/batch", { method: "POST", body: JSON.stringify(payload) });
}

export function receiveTransfer(payload) {
  return apiFetch("/inventory/transfer/receive", { method: "POST", body: JSON.stringify(payload) });
}

export function receiveTransferBatch(payload) {
  return apiFetch("/inventory/transfer/batch/receive", { method: "POST", body: JSON.stringify(payload) });
}

export function observeTransfer(payload) {
  return apiFetch("/inventory/transfer/observe", { method: "POST", body: JSON.stringify(payload) });
}

export function observeTransferBatch(payload) {
  return apiFetch("/inventory/transfer/batch/observe", { method: "POST", body: JSON.stringify(payload) });
}

export function listCash() {
  return apiFetch("/cash");
}

export function openCash(payload) {
  return apiFetch("/cash/open", { method: "POST", body: JSON.stringify(payload) });
}

export function closeCash(payload) {
  return apiFetch("/cash/close", { method: "POST", body: JSON.stringify(payload) });
}

export function forceCloseCash(payload) {
  return apiFetch("/cash/force-close", { method: "POST", body: JSON.stringify(payload) });
}

export function listCashTransactions(cashSessionId) {
  return apiFetch(`/cash/${encodeURIComponent(cashSessionId)}/transactions`);
}

export function createCashTransaction(cashSessionId, payload) {
  return apiFetch(`/cash/${encodeURIComponent(cashSessionId)}/transactions`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function listSales(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return apiFetch(`/sales${qs ? `?${qs}` : ""}`);
}

export function createSale(payload) {
  return apiFetch("/sales", { method: "POST", body: JSON.stringify(payload) });
}

export function cancelSale(id, payload) {
  return apiFetch(`/sales/${id}/cancel`, { method: "POST", body: JSON.stringify(payload) });
}

export function sendSaleReceipt(id, payload) {
  return apiFetch(`/sales/${id}/receipt/send`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function createClient(payload) {
  return apiFetch("/clients", { method: "POST", body: JSON.stringify(payload) });
}

export function addClientLine(payload) {
  return apiFetch("/clients/line", { method: "POST", body: JSON.stringify(payload) });
}

export function lookupClientDocument(documentId, localId) {
  const params = new URLSearchParams();
  if (documentId) params.set("documentId", documentId);
  if (localId) params.set("localId", localId);
  const qs = params.toString();
  return apiFetch(`/clients/lookup-document${qs ? `?${qs}` : ""}`);
}

export function searchClients(query) {
  return apiFetch(`/clients/search?q=${encodeURIComponent(query)}`);
}

export function clientHistory(clientId) {
  return apiFetch(`/clients/history?clientId=${encodeURIComponent(clientId)}`);
}

export function fetchClientAccount(clientId) {
  return apiFetch(`/clients/account?clientId=${encodeURIComponent(clientId)}`);
}

export function addClientDebt(payload) {
  return apiFetch("/clients/account/debt", { method: "POST", body: JSON.stringify(payload) });
}

export function addClientPayment(payload) {
  return apiFetch("/clients/account/payment", { method: "POST", body: JSON.stringify(payload) });
}

export function fetchActivity(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return apiFetch(`/logs${qs ? `?${qs}` : ""}`);
}

export function resetDemoData(confirm = "RESET") {
  return apiFetch("/maintenance/reset-demo", {
    method: "POST",
    body: JSON.stringify({ confirm })
  });
}

export function importInventoryCsv(payload) {
  return apiFetch("/inventory/import", { method: "POST", body: JSON.stringify(payload) });
}

export function importInventoryExcel(payload) {
  return apiFetch("/inventory/import-excel", { method: "POST", body: JSON.stringify(payload) });
}

export async function downloadWithAuth(path, filename) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";
    let message = "No se pudo descargar";
    try {
      if (contentType.includes("application/json")) {
        const data = await res.json();
        message = data?.message || data?.error || message;
      } else {
        const text = await res.text();
        if (text) message = text;
      }
    } catch (error) {
      // ignore parsing errors
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  if (!blob || blob.size === 0) {
    throw new Error("El archivo descargado esta vacio.");
  }
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

const OFFLINE_QUEUE_KEY = "bitel_offline_queue_v1";

export function listOfflineQueue() {
  const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
  const parsed = safeParseJson(raw, []);
  if (!Array.isArray(parsed)) {
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
    return [];
  }
  return parsed;
}

function saveOfflineQueue(queue) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

export function enqueueOfflineSale(payload) {
  const queue = listOfflineQueue();
  queue.unshift({
    id: `offline-${Date.now()}`,
    kind: "SALE",
    createdAt: new Date().toISOString(),
    payload
  });
  saveOfflineQueue(queue.slice(0, 100));
  return queue[0];
}

export async function retryOfflineQueue() {
  const queue = listOfflineQueue();
  const remaining = [];
  const results = [];
  for (const entry of queue) {
    if (entry.kind !== "SALE") {
      remaining.push(entry);
      continue;
    }
    try {
      await createSale(entry.payload);
      results.push({ id: entry.id, ok: true });
    } catch (err) {
      remaining.push(entry);
      results.push({ id: entry.id, ok: false, error: err?.message || String(err) });
    }
  }
  saveOfflineQueue(remaining);
  return { results, remainingCount: remaining.length };
}

export async function downloadBackup() {
  return downloadWithAuth("/reports/backup.json", "bitel-backup.json");
}
