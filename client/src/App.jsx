import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchSummary,
  login,
  setToken,
  getToken,
  getUser,
  setUser,
  fetchLowStock,
  fetchCashDiffs,
  fetchLiveCash,
  fetchCashClosures,
  fetchAlerts,
  fetchKpis,
  fetchTopProducts,
  fetchSalesByCategory,
  globalSearch,
  fetchCashReconciliation,
  fetchSalesByLocal,
  fetchInventoryMovements,
  fetchKardexValued,
  fetchInventoryItems,
  fetchTransfers,
  fetchLocalsLookup,
  createInventoryItem,
  updateInventoryItem,
  transferInventory,
  transferInventoryBatch,
  receiveTransfer,
  receiveTransferBatch,
  observeTransfer,
  listCash,
  openCash,
  closeCash,
  forceCloseCash,
  listCashTransactions,
  createCashTransaction,
  listSales,
  createSale,
  cancelSale,
  sendSaleReceipt,
  createClient,
  lookupClientDocument,
  searchClients,
  clientHistory,
  importInventoryExcel,
  fetchActivity,
  resetDemoData,
  downloadWithAuth,
  enqueueOfflineSale,
  listOfflineQueue,
  retryOfflineQueue,
  downloadBackup
} from "./api.js";

const PERIODS = [
  { id: "day", label: "Hoy" },
  { id: "week", label: "Semana" },
  { id: "month", label: "Mes" },
  { id: "year", label: "Año" }
];

const SALE_TYPE_OPTIONS = [
  { value: "PRODUCT", label: "Producto" },
  { value: "SERVICE", label: "Servicio" }
];
const PAYMENT_METHOD_OPTIONS = [
  { value: "CASH", label: "Efectivo" },
  { value: "BIPAY", label: "BiPay" },
  { value: "TRANSFER", label: "Transferencia" }
];
const RECEIPT_OPTIONS = [
  { value: "BOLETA_FISICA", label: "Boleta física" },
  { value: "BOLETA_ELECTRONICA", label: "Boleta electrónica" }
];
const CASH_DENOMINATIONS = [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1];
const VALUE_LABELS = {
  PRODUCT: "Producto",
  SERVICE: "Servicio",
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  BIPAY: "BiPay",
  IN: "Ingreso",
  OUT: "Salida",
  ACTIVE: "Activo",
  CLOSED: "Cerrado",
  OPEN: "Abierto",
  CANCELLED: "Anulado",
  COMPLETED: "Completado",
  PENDING: "Pendiente",
  BOLETA_FISICA: "Boleta física",
  BOLETA_ELECTRONICA: "Boleta electrónica",
  RECEIVED: "Recibido",
  OBSERVED: "Observado",
  SENT: "Enviado",
  DELIVERED: "Entregado",
  REJECTED: "Rechazado",
  CANCELED: "Anulado",
  CREATE: "Creacion",
  UPDATE: "Actualizacion",
  DELETE: "Eliminacion",
  SALE: "Venta",
  INVENTORY_ITEM: "Item de inventario",
  CASH_SESSION: "Caja",
  EXPENSE: "Gasto",
  BANK_DEPOSIT: "Deposito a cuenta",
  DEPOSIT: "Ingreso",
  WITHDRAWAL: "Retiro",
  IMPORT_CSV: "Importacion CSV",
  IMPORT_EXCEL: "Importacion Excel",
  TRANSFER_SENT: "Transferencia enviada",
  TRANSFER_SENT_BATCH: "Envio por lote",
  TRANSFER_RECEIVED: "Transferencia recibida",
  TRANSFER_PARTIAL_RECEIVED: "Recepcion parcial",
  TRANSFER_PARTIAL_RETURN: "Devolucion por diferencia",
  TRANSFER_OBSERVED_RETURN: "Transferencia observada",
  SALE_CANCEL: "Venta anulada"
};

function parseAmount(value, { integer = false } = {}) {
  if (value === null || value === undefined) return 0;
  const normalized = String(value).replace(",", ".");
  const parsed = Number(normalized);
  if (Number.isNaN(parsed)) return 0;
  return integer ? Math.round(parsed) : parsed;
}

function normalizeDocumentId(value) {
  return String(value || "").replace(/\D/g, "");
}

function detectDocumentType(value) {
  const normalized = normalizeDocumentId(value);
  if (normalized.length === 8) return "DNI";
  if (normalized.length === 11) return "RUC";
  return "";
}

function extractErrorMessage(err, fallback) {
  if (!err) return fallback;
  const raw = err.message || String(err);
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed.message || parsed.error || fallback;
    }
  } catch (error) {
    // ignore parse errors
  }
  return raw || fallback;
}

export default function App() {
  const queryClient = useQueryClient();
  const [token, setLocalToken] = useState(getToken());
  const [user, setLocalUser] = useState(getUser());
  const [form, setForm] = useState({ email: "", password: "" });
  const [period, setPeriod] = useState("day");
  const [error, setError] = useState("");
  const [section, setSection] = useState("dashboard");
  const [auditOpen, setAuditOpen] = useState(false);
  const [sectionErrors, setSectionErrors] = useState({});
  const [toast, setToast] = useState({ type: "", message: "" });

  const periodIndex = useMemo(() => {
    const idx = PERIODS.findIndex((p) => p.id === period);
    return idx >= 0 ? idx : 0;
  }, [period]);

  const [inventoryForm, setInventoryForm] = useState({
    localId: "",
    sku: "",
    name: "",
    category: "",
    quantity: "",
    minStock: "",
    price: ""
  });
  const [inventoryMode, setInventoryMode] = useState("create");
  const [inventoryListLocalId, setInventoryListLocalId] = useState("");
  const [inventorySearch, setInventorySearch] = useState("");
  const [transferForm, setTransferForm] = useState({
    fromLocalId: "",
    itemId: "",
    toLocalId: "",
    quantity: "",
    note: ""
  });
  const [transferBatchForm, setTransferBatchForm] = useState({
    fromLocalId: "",
    toLocalId: "",
    note: ""
  });
  const [transferBatchItems, setTransferBatchItems] = useState([
    { itemId: "", quantity: "1" }
  ]);
  const [lastTransferBatchCode, setLastTransferBatchCode] = useState("");
  const [receiveBatchForm, setReceiveBatchForm] = useState({ batchCode: "", note: "" });
  const [receiveForm, setReceiveForm] = useState({
    transferCode: "",
    receivedQuantity: "",
    note: ""
  });
  const [observeForm, setObserveForm] = useState({ transferCode: "", observation: "" });
  const [movementFilters, setMovementFilters] = useState({
    localId: "",
    itemId: "",
    from: "",
    to: ""
  });

  const [cashOpenForm, setCashOpenForm] = useState({ localId: "", openingAmount: "" });
  const [cashCloseForm, setCashCloseForm] = useState({ cashSessionId: "", closingAmount: "" });
  const [cashCloseBreakdown, setCashCloseBreakdown] = useState(() => ({}));
  const [cashForceForm, setCashForceForm] = useState({
    localId: "",
    closingAmount: "",
    reason: ""
  });
  const [cashTxForm, setCashTxForm] = useState({ type: "EXPENSE", amount: "", reason: "" });

  const [saleForm, setSaleForm] = useState({
    localId: "",
    type: "PRODUCT",
    method: "CASH",
    discountTotal: 0,
    receiptType: "BOLETA_FISICA",
    receiptNumber: ""
  });
  const [saleItems, setSaleItems] = useState([
    {
      description: "",
      quantity: "1",
      unitPrice: "",
      itemId: "",
      discountBitel: "",
      discountStore: "",
      maxQuantity: null
    }
  ]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(null);
  const [receiptSaleId, setReceiptSaleId] = useState("");
  const [receiptCashId, setReceiptCashId] = useState("");
  const [offlineQueue, setOfflineQueue] = useState(() => listOfflineQueue());

  const [clientForm, setClientForm] = useState({
    fullName: "",
    documentId: "",
    phone: "",
    localId: ""
  });
  const [clientLookupState, setClientLookupState] = useState({
    loading: false,
    source: "",
    message: ""
  });
  const clientAutoLookupRef = useRef("");
  const toastTimerRef = useRef(null);
  const [clientQuery, setClientQuery] = useState("");
  const [clientHistoryId, setClientHistoryId] = useState("");

  const [auditFilters, setAuditFilters] = useState({
    localId: "",
    user: "",
    action: "",
    entity: "",
    from: "",
    to: ""
  });

  const [reportsFilters, setReportsFilters] = useState({ localId: "", from: "", to: "" });
  const [globalSearchTerm, setGlobalSearchTerm] = useState("");
  const [globalSearchDebounced, setGlobalSearchDebounced] = useState("");
  const [receiptSaleEmail, setReceiptSaleEmail] = useState("");
  const [inventoryImport, setInventoryImport] = useState({
    localId: "",
    mode: "SET",
    fileBase64: "",
    filename: ""
  });

  const role = user?.role ?? null;
  const isAdmin = role === "ADMIN";
  const isAuditor = role === "AUDITOR";
  const isVendedor = role === "VENDEDOR";
  const isAlmacen = role === "ALMACEN";
  const roleDisplay = (() => {
    if (!role) return "";
    const labels = {
      ADMIN: "Administrador",
      AUDITOR: "Auditor operativo",
      VENDEDOR: "Vendedor",
      ALMACEN: "Almacen"
    };
    return labels[role] || role;
  })();

  const canViewDashboard = isAdmin || isAuditor || isVendedor;
  const canViewOps = isAdmin || isAuditor || isVendedor;
  const canViewInventory = isAdmin || isAuditor || isVendedor || isAlmacen;
  const canViewClients = isAdmin || isAuditor || isVendedor;
  const canViewReports = isAdmin || isAuditor || isVendedor;
  const canViewAudit = isAdmin;
  const canExportReports = isAdmin || isAuditor || isVendedor;

  const canCreateSales = isAdmin || isAuditor || isVendedor;
  const canCancelSales = isAdmin || isAuditor || isVendedor;
  const canManageCash = isAdmin || isAuditor || isVendedor;
  const canForceCloseCash = isAdmin || isAuditor;
  const canListCash = canManageCash || isAuditor;
  const canDownloadCashReceipt = canManageCash;
  const canDownloadSalesReceipt = isAdmin || isAuditor || isVendedor;

  const canManageInventoryItems = isAdmin || isAuditor || isVendedor || isAlmacen;
  const canViewInventoryMovements = isAdmin || isAuditor || isVendedor || isAlmacen;
  const canViewTransfers = isAdmin || isAuditor || isVendedor || isAlmacen;
  const canManageTransfers = isAdmin || isAuditor || isVendedor || isAlmacen;
  const canPrintTransfers = isAdmin || isAuditor || isVendedor || isAlmacen;

  const canRetryOffline = isAdmin || isAuditor || isVendedor;
  const clientDocumentType = detectDocumentType(clientForm.documentId);
  const isLocalFixed = Boolean(
    user?.localId && user?.role !== "ADMIN" && user?.role !== "AUDITOR"
  );
  const fixedLocalId = isLocalFixed ? user?.localId || "" : "";
  const setSectionError = (key, message) => {
    setSectionErrors((prev) => ({ ...prev, [key]: message }));
  };

  const clearSectionError = (key) => {
    setSectionErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const showToast = (message, type = "success") => {
    setToast({ type, message: String(message || "") });
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast({ type: "", message: "" });
    }, 2200);
  };

  const summaryQuery = useQuery({
    queryKey: ["summary", period, token],
    queryFn: () => fetchSummary({ period }),
    enabled: Boolean(token) && canViewDashboard
  });

  const lowStockQuery = useQuery({
    queryKey: ["lowStock", token],
    queryFn: () => fetchLowStock(),
    enabled: Boolean(token) && canViewReports
  });

  const localsQuery = useQuery({
    queryKey: ["localsLookup", token],
    queryFn: fetchLocalsLookup,
    enabled: Boolean(token)
  });

  const cashDiffsQuery = useQuery({
    queryKey: ["cashDiffs", token],
    queryFn: () => fetchCashDiffs(),
    enabled: Boolean(token) && canViewReports
  });

  const liveCashQuery = useQuery({
    queryKey: ["liveCash", token],
    queryFn: () => fetchLiveCash(),
    enabled: Boolean(token) && section === "dashboard" && canListCash
  });

  const inventoryQuery = useQuery({
    queryKey: ["inventory", token, inventoryListLocalId],
    queryFn: () => fetchInventoryItems(inventoryListLocalId || undefined),
    enabled: Boolean(token) && section === "inventory"
  });

  const movementsQuery = useQuery({
    queryKey: ["inventoryMovements", token, movementFilters],
    queryFn: () => fetchInventoryMovements(cleanFilters(movementFilters)),
    enabled: Boolean(token) && section === "inventory" && canViewInventoryMovements
  });

  useEffect(() => {
    if (!user?.localId) return;
    if (user.role === "ADMIN" || user.role === "AUDITOR") return;
    setSaleForm((prev) => ({ ...prev, localId: user.localId }));
    setCashOpenForm((prev) => ({ ...prev, localId: user.localId }));
    setCashForceForm((prev) => ({ ...prev, localId: user.localId }));
    setInventoryListLocalId(user.localId);
    if (inventoryMode === "create") {
      setInventoryForm((prev) => ({ ...prev, localId: user.localId }));
    }
    setClientForm((prev) => ({ ...prev, localId: user.localId }));
    setMovementFilters((prev) => ({ ...prev, localId: user.localId }));
    setInventoryImport((prev) => ({ ...prev, localId: user.localId }));
    setReportsFilters((prev) => ({ ...prev, localId: user.localId }));
  }, [user?.localId, user?.role, inventoryMode]);

  useEffect(() => {
    if (!user) return;
    if (user.role === "ADMIN" || user.role === "AUDITOR") {
      setSaleForm((prev) => ({ ...prev, localId: "" }));
      setCashOpenForm((prev) => ({ ...prev, localId: "" }));
      setCashForceForm((prev) => ({ ...prev, localId: "" }));
      setInventoryListLocalId("");
      setInventoryImport((prev) => ({ ...prev, localId: "" }));
      setClientForm((prev) => ({ ...prev, localId: "" }));
      setReportsFilters((prev) => ({ ...prev, localId: "" }));
    }
  }, [user?.role]);

  useEffect(() => {
    if (token && !user) {
      const storedUser = getUser();
      if (storedUser) {
        setLocalUser(storedUser);
      } else {
        setLocalToken(null);
      }
    }
  }, [token, user]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setGlobalSearchDebounced(String(globalSearchTerm || "").trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [globalSearchTerm]);

  useEffect(() => {
    if (!token) return;
    setOfflineQueue(listOfflineQueue());
  }, [token]);

  useEffect(() => {
    if (token) return;
    setSection("dashboard");
    setSectionErrors({});
    setSaleForm({
      localId: "",
      type: "PRODUCT",
      method: "CASH",
      discountTotal: 0,
      receiptType: "BOLETA_FISICA",
      receiptNumber: ""
    });
    setSaleItems([
      {
        description: "",
        quantity: "1",
        unitPrice: "",
        itemId: "",
        discountBitel: "",
        discountStore: "",
        maxQuantity: null
      }
    ]);
    setCashOpenForm({ localId: "", openingAmount: "" });
    setCashCloseForm({ cashSessionId: "", closingAmount: "" });
    setCashCloseBreakdown({});
    setCashForceForm({ localId: "", closingAmount: "", reason: "" });
    setCashTxForm({ type: "EXPENSE", amount: "", reason: "" });
    setInventoryForm({
      localId: "",
      sku: "",
      name: "",
      category: "",
      quantity: "",
      minStock: "",
      price: ""
    });
    setInventoryMode("create");
    setInventorySearch("");
    setTransferForm({ fromLocalId: "", itemId: "", toLocalId: "", quantity: "", note: "" });
    setTransferBatchForm({ fromLocalId: "", toLocalId: "", note: "" });
    setTransferBatchItems([{ itemId: "", quantity: "1" }]);
    setLastTransferBatchCode("");
    setReceiveBatchForm({ batchCode: "", note: "" });
    setReceiveForm({ transferCode: "", receivedQuantity: "", note: "" });
    setObserveForm({ transferCode: "", observation: "" });
    setMovementFilters({ localId: "", itemId: "", from: "", to: "" });
    setClientForm({ fullName: "", documentId: "", phone: "", localId: "" });
    setClientQuery("");
    setClientHistoryId("");
    setReceiptSaleId("");
    setReceiptSaleEmail("");
    setReceiptCashId("");
    setOfflineQueue([]);
    setAuditFilters({
      localId: "",
      user: "",
      action: "",
      entity: "",
      from: "",
      to: ""
    });
    setReportsFilters({ localId: "", from: "", to: "" });
    setGlobalSearchTerm("");
    setInventoryImport({ localId: "", mode: "SET", fileBase64: "", filename: "" });
  }, [token]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    clearSectionError(section);
  }, [section]);

  useEffect(() => {
    if (section === "audit") {
      setSection("reports");
    }
  }, [section]);

  const transfersQuery = useQuery({
    queryKey: ["transfers", token],
    queryFn: fetchTransfers,
    enabled: Boolean(token) && section === "inventory" && canViewTransfers
  });

  const cashQuery = useQuery({
    queryKey: ["cashSessions", token],
    queryFn: listCash,
    enabled: Boolean(token) && section === "ops" && canListCash
  });

  const salesQuery = useQuery({
    queryKey: ["sales", token],
    queryFn: () => listSales({ status: "ACTIVE" }),
    enabled: Boolean(token) && section === "ops"
  });

  const inventoryForSalesQuery = useQuery({
    queryKey: ["inventoryForSales", token, fixedLocalId, saleForm.localId],
    queryFn: () => fetchInventoryItems((fixedLocalId || saleForm.localId) || undefined),
    enabled: Boolean(token) && section === "ops" && Boolean(fixedLocalId || saleForm.localId)
  });

  const clientsSearchQuery = useQuery({
    queryKey: ["clientsSearch", clientQuery, token],
    queryFn: () => searchClients(clientQuery),
    enabled: Boolean(token) && section === "clients" && clientQuery.length > 0
  });

  const clientHistoryQuery = useQuery({
    queryKey: ["clientHistory", clientHistoryId, token],
    queryFn: () => clientHistory(clientHistoryId),
    enabled: Boolean(token) && section === "clients" && clientHistoryId.length > 0
  });

  const activityQuery = useQuery({
    queryKey: ["activity", auditFilters, token],
    queryFn: () => fetchActivity(cleanFilters(auditFilters)),
    enabled: Boolean(token) && section === "reports" && auditOpen && canViewAudit
  });

  const activityTimelineQuery = useQuery({
    queryKey: ["activityTimeline", token],
    queryFn: () => fetchActivity({}),
    enabled: Boolean(token) && section === "reports" && canViewAudit
  });

  const reportsSalesByLocal = useQuery({
    queryKey: ["reportSalesByLocal", token, reportsFilters],
    queryFn: () => fetchSalesByLocal(cleanFilters(reportsFilters)),
    enabled: Boolean(token) && section === "reports" && canViewReports && isAdmin
  });

  const reportsCashClosures = useQuery({
    queryKey: ["reportCashClosures", token, reportsFilters],
    queryFn: () => fetchCashClosures(cleanFilters(reportsFilters)),
    enabled: Boolean(token) && section === "reports" && canViewReports
  });

  const reportsLowStock = useQuery({
    queryKey: ["reportLowStock", token, reportsFilters.localId],
    queryFn: () =>
      fetchLowStock(
        cleanFilters({
          localId: reportsFilters.localId || undefined
        })
      ),
    enabled: Boolean(token) && section === "reports" && canViewReports
  });

  const reportsMovements = useQuery({
    queryKey: ["reportMovements", token, reportsFilters],
    queryFn: () => fetchInventoryMovements(cleanFilters(reportsFilters)),
    enabled: Boolean(token) && section === "reports" && canViewReports && canViewInventoryMovements
  });

  const reportsKardexValuedQuery = useQuery({
    queryKey: ["reportKardexValued", token, reportsFilters],
    queryFn: () => fetchKardexValued(cleanFilters(reportsFilters)),
    enabled:
      Boolean(token) && section === "reports" && canViewReports && canViewInventoryMovements
  });

  const alertsQuery = useQuery({
    queryKey: ["alerts", token, user?.localId],
    queryFn: () =>
      fetchAlerts({
        localId: user?.role === "ADMIN" || user?.role === "AUDITOR" ? undefined : user?.localId
      }),
    enabled: Boolean(token) && canViewReports
  });

  const reportsKpisQuery = useQuery({
    queryKey: ["reportKpis", token, reportsFilters],
    queryFn: () => fetchKpis(cleanFilters(reportsFilters)),
    enabled: Boolean(token) && section === "reports" && canViewReports
  });

  const reportsTopProductsQuery = useQuery({
    queryKey: ["reportTopProducts", token, reportsFilters],
    queryFn: () => fetchTopProducts(cleanFilters({ ...reportsFilters, limit: 12 })),
    enabled: Boolean(token) && section === "reports" && canViewReports
  });

  const reportsSalesByCategoryQuery = useQuery({
    queryKey: ["reportSalesByCategory", token, reportsFilters],
    queryFn: () => fetchSalesByCategory(cleanFilters(reportsFilters)),
    enabled: Boolean(token) && section === "reports" && canViewReports
  });

  const globalSearchQuery = useQuery({
    queryKey: ["globalSearch", token, globalSearchDebounced, reportsFilters.localId],
    queryFn: () =>
      globalSearch(
        cleanFilters({
          q: globalSearchDebounced,
          localId: reportsFilters.localId || undefined
        })
      ),
    enabled:
      Boolean(token) &&
      section === "reports" &&
      canViewReports &&
      globalSearchDebounced.length > 0
  });

  const cashTransactionsQuery = useQuery({
    queryKey: ["cashTransactions", token, cashCloseForm.cashSessionId],
    queryFn: () => listCashTransactions(cashCloseForm.cashSessionId),
    enabled:
      Boolean(token) &&
      section === "ops" &&
      canManageCash &&
      Boolean(cashCloseForm.cashSessionId)
  });

  const cashReconciliationQuery = useQuery({
    queryKey: ["cashReconciliation", token, cashCloseForm.cashSessionId],
    queryFn: () => fetchCashReconciliation({ cashSessionId: cashCloseForm.cashSessionId }),
    enabled:
      Boolean(token) &&
      section === "ops" &&
      canManageCash &&
      Boolean(cashCloseForm.cashSessionId)
  });

  const greeting = useMemo(() => {
    const now = new Date();
    const hours = now.getHours();
    if (hours < 12) return "Buenos dias";
    if (hours < 18) return "Buenas tardes";
    return "Buenas noches";
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    try {
      const data = await login(form.email, form.password);
      setToken(data.accessToken);
      setLocalToken(data.accessToken);
      setUser(data.user);
      setLocalUser(data.user);
      setSection("dashboard");
    } catch (err) {
      setError("Credenciales invalidas.");
    }
  }

  function handleLogout() {
    localStorage.removeItem("bitel_token");
    localStorage.removeItem("bitel_user");
    setLocalToken(null);
    setLocalUser(null);
    setSection("dashboard");
  }

  async function handleResetDemo() {
    if (!user || user.role !== "ADMIN") return;
    const typed = window.prompt(
      'Esto borrara ventas, caja, inventario, transferencias y auditoria (se conservan usuarios y locales). Escribe "BORRAR" para confirmar:'
    );
    if (typed !== "BORRAR") return;
    clearSectionError("admin");
    try {
      const result = await resetDemoData("RESET");
      localStorage.removeItem("bitel_offline_queue_v1");
      setOfflineQueue([]);
      setReceiptSaleId("");
      setReceiptCashId("");
      setClientHistoryId("");
      setInventoryMode("create");
      setInventoryForm({
        localId: "",
        sku: "",
        name: "",
        category: "",
        quantity: "",
        minStock: "",
        price: ""
      });
      queryClient.invalidateQueries();
      window.alert(
        `Listo. Datos borrados:\\n${JSON.stringify(result?.deleted || {}, null, 2)}`
      );
    } catch (err) {
      setSectionError("admin", extractErrorMessage(err, "No se pudo reiniciar la demo."));
    }
  }

  function cleanFilters(filters) {
    const output = {};
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        output[key] = value;
      }
    });
    return output;
  }

  async function handleCreateInventory(e) {
    e.preventDefault();
    clearSectionError("inventory");
    clearSectionError("ops");
    try {
      const localId = resolveLocalId(inventoryForm.localId);
      const sku = String(inventoryForm.sku || "").trim();
      const name = String(inventoryForm.name || "").trim();
      const category = String(inventoryForm.category || "").trim();
      const minStockRaw = String(inventoryForm.minStock || "").trim();

      if (!localId) {
        setSectionError("inventory", "Selecciona un local.");
        return;
      }
      if (!sku) {
        setSectionError("inventory", "Ingresa un código (SKU).");
        return;
      }
      if (!name) {
        setSectionError("inventory", "Ingresa el nombre del producto.");
        return;
      }

      await createInventoryItem({
        localId,
        sku,
        name,
        category: category || undefined,
        quantity: parseAmount(inventoryForm.quantity, { integer: true }),
        minStock: minStockRaw ? parseAmount(minStockRaw, { integer: true }) : undefined,
        price: parseAmount(inventoryForm.price)
      });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      setInventoryForm({
        localId: "",
        sku: "",
        name: "",
        category: "",
        quantity: "",
        minStock: "",
        price: ""
      });
      setInventoryMode("create");
    } catch (err) {
      setSectionError(
        "inventory",
        extractErrorMessage(err, "No se pudo guardar el producto. Revisa los datos.")
      );
    }
  }

  async function handleUpdateInventory(e) {
    e.preventDefault();
    if (!inventoryForm.id) return;
    clearSectionError("inventory");
    clearSectionError("ops");
    try {
      await updateInventoryItem(inventoryForm.id, {
        name: inventoryForm.name,
        category: inventoryForm.category,
        quantity: parseAmount(inventoryForm.quantity, { integer: true }),
        price: parseAmount(inventoryForm.price)
      });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      setInventoryForm({
        localId: "",
        sku: "",
        name: "",
        category: "",
        quantity: "",
        minStock: "",
        price: ""
      });
      setInventoryMode("create");
    } catch (err) {
      setSectionError(
        "inventory",
        "No se pudo actualizar el producto. Revisa los datos o la conexion."
      );
    }
  }

  function selectInventoryItem(item) {
    if (!inventoryQuery.data || inventoryQuery.data.length === 0) {
      return;
    }
    clearSectionError("inventory");
    setInventoryForm({
      id: item.id,
      localId: item.localId,
      sku: item.sku,
      name: item.name,
      category: item.category || "",
      quantity: String(item.quantity ?? ""),
      minStock: String(item.minStock ?? ""),
      price: String(item.price ?? "")
    });
    setInventoryMode("edit");
  }

  async function handleTransferInventory(e) {
    e.preventDefault();
    clearSectionError("inventory");
    try {
      const fromLocalId =
        resolveLocalId(transferForm.fromLocalId) || fixedLocalId || undefined;
      if (!fromLocalId && !isLocalFixed) {
        setSectionError("inventory", "Selecciona el local de origen para enviar.");
        return;
      }
      await transferInventory({
        ...transferForm,
        fromLocalId,
        toLocalId: resolveLocalId(transferForm.toLocalId),
        quantity: parseAmount(transferForm.quantity, { integer: true })
      });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
    } catch (err) {
      setSectionError(
        "inventory",
        extractErrorMessage(err, "No se pudo transferir el producto.")
      );
    }
  }

  const isTransferBatchItemComplete = (row) => {
    const hasItem = String(row.itemId || "").trim().length > 0;
    const qty = parseAmount(row.quantity, { integer: true });
    return hasItem && qty > 0;
  };

  async function handleTransferBatchInventory(e) {
    e.preventDefault();
    clearSectionError("inventory");
    try {
      const fromLocalId =
        resolveLocalId(transferBatchForm.fromLocalId) || fixedLocalId || undefined;
      const toLocalId = resolveLocalId(transferBatchForm.toLocalId);
      if (!fromLocalId && !isLocalFixed) {
        setSectionError("inventory", "Selecciona el local de origen para enviar.");
        return;
      }
      if (!toLocalId) {
        setSectionError("inventory", "Selecciona el local destino.");
        return;
      }
      const items = transferBatchItems
        .filter((row) => isTransferBatchItemComplete(row))
        .map((row) => ({
          itemId: String(row.itemId || "").trim(),
          quantity: parseAmount(row.quantity, { integer: true })
        }));
      if (items.length === 0) {
        setSectionError("inventory", "Agrega al menos un producto para enviar.");
        return;
      }

      const result = await transferInventoryBatch({
        fromLocalId,
        toLocalId,
        note: transferBatchForm.note,
        items
      });
      if (result?.batchCode) {
        setLastTransferBatchCode(result.batchCode);
      }
      setTransferBatchItems([{ itemId: "", quantity: "1" }]);
      setTransferBatchForm({ fromLocalId: transferBatchForm.fromLocalId, toLocalId: "", note: "" });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
    } catch (err) {
      setSectionError(
        "inventory",
        extractErrorMessage(err, "No se pudo generar el envio por lote.")
      );
    }
  }

  async function handleReceiveTransferBatch(e) {
    e.preventDefault();
    clearSectionError("inventory");
    try {
      const batchCode = String(receiveBatchForm.batchCode || "").trim();
      if (!batchCode) {
        setSectionError("inventory", "Ingresa el codigo del envio.");
        return;
      }
      await receiveTransferBatch({ batchCode, note: receiveBatchForm.note });
      setReceiveBatchForm({ batchCode: "", note: "" });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
    } catch (err) {
      setSectionError(
        "inventory",
        extractErrorMessage(err, "No se pudo recibir el envio por lote.")
      );
    }
  }

  async function handleReceiveTransfer(e) {
    e.preventDefault();
    clearSectionError("inventory");
    try {
      await receiveTransfer({
        transferCode: receiveForm.transferCode,
        receivedQuantity: receiveForm.receivedQuantity
          ? parseAmount(receiveForm.receivedQuantity, { integer: true })
          : undefined,
        note: receiveForm.note
      });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
    } catch (err) {
      setSectionError(
        "inventory",
        extractErrorMessage(err, "No se pudo recibir la transferencia.")
      );
    }
  }

  async function handleObserveTransfer(e) {
    e.preventDefault();
    clearSectionError("inventory");
    try {
      await observeTransfer(observeForm);
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
    } catch (err) {
      setSectionError(
        "inventory",
        extractErrorMessage(err, "No se pudo observar la transferencia.")
      );
    }
  }

  async function handleOpenCash(e) {
    e.preventDefault();
    clearSectionError("ops");
    try {
      const payload = {
        ...cashOpenForm,
        localId: resolveLocalId(cashOpenForm.localId),
        openingAmount: parseAmount(cashOpenForm.openingAmount)
      };
      let result = await openCash(payload);
      if (result?.requiresConfirmation) {
        const attempts = Number(result.openedToday ?? 1) + 1;
        const confirmed = window.confirm(
          `${result.message || "Ya hubo una apertura de caja hoy."}\n\n` +
            `Esta seria la apertura #${attempts} del dia. Deseas continuar?`
        );
        if (!confirmed) {
          return;
        }
        result = await openCash({ ...payload, force: true });
      }
      if (result) {
        setCashOpenForm((prev) => ({ ...prev, openingAmount: "" }));
      }
      queryClient.invalidateQueries({ queryKey: ["cashSessions"] });
    } catch (err) {
      setSectionError("ops", extractErrorMessage(err, "No se pudo abrir la caja."));
    }
  }

  async function handleCloseCash(e) {
    e.preventDefault();
    clearSectionError("ops");
    try {
      const cashSessionId = openCashSession?.id || cashCloseForm.cashSessionId;
      if (!cashSessionId) {
        setSectionError("ops", "No hay caja abierta para cerrar.");
        return;
      }
      await closeCash({
        ...cashCloseForm,
        cashSessionId,
        closingAmount: parseAmount(cashCloseForm.closingAmount),
        breakdown: cashCloseBreakdown
      });
      queryClient.invalidateQueries({ queryKey: ["cashSessions"] });
      queryClient.invalidateQueries({ queryKey: ["cashTransactions"] });
    } catch (err) {
      setSectionError("ops", extractErrorMessage(err, "No se pudo cerrar la caja."));
    }
  }

  async function handleForceCloseCash(e) {
    e.preventDefault();
    clearSectionError("ops");
    try {
      await forceCloseCash({
        ...cashForceForm,
        localId: resolveLocalId(cashForceForm.localId),
        closingAmount: parseAmount(cashForceForm.closingAmount)
      });
      queryClient.invalidateQueries({ queryKey: ["cashSessions"] });
    } catch (err) {
      setSectionError("ops", extractErrorMessage(err, "No se pudo forzar el cierre."));
    }
  }

  async function handleCashTransaction(e) {
    e.preventDefault();
    clearSectionError("ops");
    if (!openCashSession?.id) {
      setSectionError("ops", "Necesitas una caja abierta para registrar gastos o depositos.");
      return;
    }
    const normalizedReason = String(cashTxForm.reason || "").trim();
    if (cashTxForm.type === "EXPENSE" && !normalizedReason) {
      setSectionError("ops", "El motivo es obligatorio para gasto operativo.");
      return;
    }
    try {
      await createCashTransaction(openCashSession.id, {
        type: cashTxForm.type,
        amount: parseAmount(cashTxForm.amount),
        reason: normalizedReason || undefined
      });
      setCashTxForm({ type: cashTxForm.type, amount: "", reason: "" });
      queryClient.invalidateQueries({ queryKey: ["cashTransactions"] });
      queryClient.invalidateQueries({ queryKey: ["cashSessions"] });
    } catch (err) {
      setSectionError("ops", extractErrorMessage(err, "No se pudo registrar el movimiento de caja."));
    }
  }

  async function handleCreateSale(e) {
    e.preventDefault();
    clearSectionError("ops");
    const saleLocalId = resolveLocalId(saleForm.localId);
    if (!saleLocalId) {
      setSectionError("ops", "Debes indicar el local.");
      return;
    }
    if (cashQuery.isSuccess && !openCashSession) {
      setSectionError("ops", "No hay caja abierta para este local.");
      return;
    }
    let payload = null;
    try {
      const localInventory = inventoryForSalesLocal || [];
      const normalizedItems = saleItems.map((item) => {
        const description = String(item.description || "").trim();
        const rawItemId = String(item.itemId || "").trim();
        const matchById = rawItemId
          ? localInventory.find(
              (inv) =>
                (inv.id && inv.id.toLowerCase() === rawItemId.toLowerCase()) ||
                (inv.sku && inv.sku.toLowerCase() === rawItemId.toLowerCase())
            )
          : null;
        const matchByDescription = description
          ? localInventory.find(
              (inv) => inv.name && inv.name.toLowerCase() === description.toLowerCase()
            )
          : null;
        const match = matchById || matchByDescription;
        const resolvedItemId = match?.id || undefined;
        const resolvedPrice =
          match && match.price !== undefined && match.price !== null
            ? match.price
            : item.unitPrice;
        const discountBitel = parseAmount(item.discountBitel);
        const discountStore = parseAmount(item.discountStore);
        return {
          itemId: resolvedItemId,
          description: description || match?.name || "",
          quantity: parseAmount(item.quantity, { integer: true }),
          unitPrice: parseAmount(resolvedPrice ?? 0),
          discountAmount: discountBitel,
          _storeDiscount: discountStore,
          _rawItemId: rawItemId,
          _matchById: Boolean(matchById)
        };
      });
      const storeDiscountTotal = normalizedItems.reduce(
        (sum, item) => sum + Number(item._storeDiscount ?? 0),
        0
      );
      const itemsPayload = normalizedItems.filter(
        (item) =>
          item.description ||
          item.itemId ||
          item.quantity ||
          item.unitPrice ||
          item.discountAmount ||
          item._storeDiscount
      );
      if (itemsPayload.length === 0) {
        setSectionError("ops", "Agrega al menos un producto.");
        return;
      }
      const missingDescription = itemsPayload.find((item) => !item.description);
      if (missingDescription) {
        setSectionError("ops", "Cada producto debe tener una descripcion.");
        return;
      }
      const invalidQuantity = itemsPayload.find((item) => !item.quantity || item.quantity < 1);
      if (invalidQuantity) {
        setSectionError("ops", "Las cantidades deben ser mayores a cero.");
        return;
      }
      const invalidItemId = itemsPayload.find((item) => item._rawItemId && !item.itemId);
      if (invalidItemId) {
        setSectionError(
          "ops",
          "Selecciona un producto/servicio valido del inventario para usar su precio fijo."
        );
        return;
      }
      const canValidateInventory =
        inventoryForSalesQuery.isSuccess && localInventory && localInventory.length > 0;
      if (canValidateInventory) {
        const invalidItemId = itemsPayload.find((item) => item._rawItemId && !item._matchById);
        if (invalidItemId) {
          setSectionError(
            "ops",
            "Hay productos que no pertenecen al local o el codigo es invalido."
          );
          return;
        }
        const overStockItem = itemsPayload.find((item) => {
          if (!item.itemId) return false;
          const match = localInventory.find((inv) => inv.id === item.itemId);
          if (!match || match.quantity === undefined || match.quantity === null) return false;
          return item.quantity > Number(match.quantity);
        });
        if (overStockItem) {
          setSectionError("ops", "La cantidad supera el stock disponible.");
          return;
        }
      }
      const { receiptNumber: _ignored, ...saleBase } = saleForm;
      payload = {
        ...saleBase,
        localId: saleLocalId,
        discountTotal: storeDiscountTotal,
        items: itemsPayload.map(({ _rawItemId, _matchById, _storeDiscount, ...item }) => item)
      };
      await createSale(payload);
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      setSaleItems([
        {
          description: "",
          quantity: "1",
          unitPrice: "",
          itemId: "",
          discountBitel: "",
          discountStore: "",
          maxQuantity: null
        }
      ]);
      showToast("Venta registrada correctamente.");
    } catch (err) {
      const message = extractErrorMessage(err, "No se pudo registrar la venta.");
      const raw = String(err?.message || err || "").toLowerCase();
      const isNetwork =
        raw.includes("failed to fetch") || raw.includes("network") || raw.includes("fetch");
      if (isNetwork) {
        try {
          if (payload) enqueueOfflineSale(payload);
          setOfflineQueue(listOfflineQueue());
          setSectionError(
            "ops",
            "Sin conexion: la venta se guardo como pendiente offline para reintento."
          );
          return;
        } catch (queueErr) {
          // fall through to default message
        }
      }
      setSectionError("ops", message);
    }
  }

  async function handleLookupClientByDocument(options = {}) {
    const { silent = false, documentId: providedDocumentId, scopedLocalId: providedLocalId } = options;
    if (!silent) {
      clearSectionError("clients");
    }
    const normalizedDocumentId = normalizeDocumentId(providedDocumentId ?? clientForm.documentId);
    const documentType = detectDocumentType(normalizedDocumentId);
    if (!documentType) {
      if (!silent) {
        setSectionError("clients", "Ingresa un DNI (8) o RUC (11) valido.");
      }
      return false;
    }
    setClientLookupState({ loading: true, source: "", message: "" });
    try {
      const scopedLocalId =
        providedLocalId !== undefined
          ? providedLocalId
          : resolveLocalId(isLocalFixed ? fixedLocalId : clientForm.localId);
      const result = await lookupClientDocument(normalizedDocumentId, scopedLocalId || undefined);
      const fullName = String(result?.data?.fullName || "").trim();
      const phone = String(result?.data?.phone || "").trim();
      setClientForm((prev) => ({
        ...prev,
        documentId: normalizedDocumentId,
        fullName: fullName || prev.fullName,
        phone: phone || prev.phone
      }));
      if (result?.client?.id) {
        setClientHistoryId(result.client.id);
      }
      const sourceLabel =
        result?.source === "LOCAL_DB"
          ? "Base local"
          : result?.source === "RENIEC"
            ? "RENIEC"
            : result?.source === "SUNAT"
              ? "SUNAT"
              : result?.source === "NOT_CONFIGURED"
                ? "Sin integracion externa"
                : "Busqueda";
      const message = result?.found
        ? `Datos encontrados (${sourceLabel}).`
        : `No se encontraron datos (${sourceLabel}).`;
      setClientLookupState({
        loading: false,
        source: String(result?.source || ""),
        message
      });
      return Boolean(result?.found);
    } catch (err) {
      setClientLookupState({ loading: false, source: "", message: "" });
      if (!silent) {
        setSectionError("clients", extractErrorMessage(err, "No se pudo consultar el documento."));
      }
      return false;
    }
  }

  useEffect(() => {
    if (!token) return;
    const normalizedDocumentId = normalizeDocumentId(clientForm.documentId);
    const documentType = detectDocumentType(normalizedDocumentId);
    if (!documentType) {
      clientAutoLookupRef.current = "";
      return;
    }

    const scopedLocalId = resolveLocalId(isLocalFixed ? fixedLocalId : clientForm.localId) || "";
    const lookupKey = `${normalizedDocumentId}:${scopedLocalId}`;
    if (clientAutoLookupRef.current === lookupKey) return;
    clientAutoLookupRef.current = lookupKey;

    void handleLookupClientByDocument({
      silent: true,
      documentId: normalizedDocumentId,
      scopedLocalId
    });
  }, [token, clientForm.documentId, clientForm.localId, isLocalFixed, fixedLocalId]);

  async function handleCreateClient(e) {
    e.preventDefault();
    clearSectionError("clients");
    const normalizedDocumentId = normalizeDocumentId(clientForm.documentId);
    const documentType = detectDocumentType(normalizedDocumentId);
    if (normalizedDocumentId && !documentType) {
      setSectionError("clients", "Documento invalido. Usa DNI (8) o RUC (11).");
      return;
    }
    const scopedLocalId = resolveLocalId(isLocalFixed ? fixedLocalId : clientForm.localId);
    if (!scopedLocalId && !isAdmin && !isAuditor) {
      setSectionError("clients", "Selecciona un local.");
      return;
    }
    const payload = {
      ...clientForm,
      documentId: normalizedDocumentId || undefined,
      localId: scopedLocalId || undefined
    };
    try {
      const created = await createClient(payload);
      if (created?.id) {
        setClientHistoryId(created.id);
      }
      setClientForm({ fullName: "", documentId: "", phone: "", localId: "" });
      setClientLookupState({ loading: false, source: "", message: "" });
      queryClient.invalidateQueries({ queryKey: ["clientsSearch"] });
    } catch (err) {
      setSectionError("clients", extractErrorMessage(err, "No se pudo crear el cliente."));
    }
  }

  async function handleInventoryImport() {
    clearSectionError("inventory");
    const localId = resolveLocalId(inventoryImport.localId);
    if (!localId) {
      setSectionError("inventory", "Selecciona un local para importar.");
      return;
    }
    if (!String(inventoryImport.fileBase64 || "").trim()) {
      setSectionError("inventory", "Selecciona un archivo Excel (.xlsx) para importar.");
      return;
    }
    try {
      await importInventoryExcel({
        localId,
        mode: inventoryImport.mode,
        fileBase64: inventoryImport.fileBase64
      });
      setInventoryImport((prev) => ({ ...prev, fileBase64: "", filename: "" }));
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryMovements"] });
    } catch (err) {
      setSectionError("inventory", extractErrorMessage(err, "No se pudo importar el Excel."));
    }
  }

  async function handleRetryOffline() {
    clearSectionError("ops");
    try {
      await retryOfflineQueue();
      setOfflineQueue(listOfflineQueue());
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    } catch (err) {
      setSectionError("ops", extractErrorMessage(err, "No se pudo reintentar la cola offline."));
    }
  }

  async function handleSendSaleReceipt() {
    clearSectionError("ops");
    if (!receiptSaleId) {
      setSectionError("ops", "Selecciona una venta real para enviar el comprobante.");
      return;
    }
    const selectedSale = (salesQuery.data || []).find((row) => row.id === receiptSaleId) || null;
    if (selectedSale?.receiptType !== "BOLETA_ELECTRONICA") {
      setSectionError(
        "ops",
        "El envio aplica para boleta electronica. Para boleta fisica usa Descargar comprobante."
      );
      return;
    }
    const email = String(receiptSaleEmail || "").trim().toLowerCase();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      setSectionError("ops", "Ingresa un correo valido para enviar el comprobante.");
      return;
    }
    try {
      await sendSaleReceipt(receiptSaleId, { email });
      showToast(`Comprobante enviado a ${email}.`);
      setReceiptSaleEmail("");
    } catch (err) {
      setSectionError("ops", extractErrorMessage(err, "No se pudo enviar el comprobante."));
    }
  }

  const navItems = [];
  if (canViewDashboard) navItems.push({ id: "dashboard", label: "Resumen" });
  if (canViewOps) navItems.push({ id: "ops", label: "Operacion diaria" });
  if (canViewInventory) navItems.push({ id: "inventory", label: "Inventario" });
  if (canViewClients) navItems.push({ id: "clients", label: "Clientes" });
  if (canViewReports) navItems.push({ id: "reports", label: "Reportes" });
  if (isAdmin) navItems.push({ id: "admin", label: "Administracion" });

  useEffect(() => {
    if (!token || !user?.role) return;
    if (section === "dashboard" && !canViewDashboard) {
      if (canViewOps) setSection("ops");
      else if (canViewInventory) setSection("inventory");
      return;
    }
    if (section === "ops" && !canViewOps) {
      setSection(canViewInventory ? "inventory" : canViewDashboard ? "dashboard" : "ops");
      return;
    }
    if (section === "inventory" && !canViewInventory) {
      setSection(canViewOps ? "ops" : canViewDashboard ? "dashboard" : "inventory");
      return;
    }
    if (section === "clients" && !canViewClients) {
      setSection(canViewOps ? "ops" : canViewInventory ? "inventory" : "dashboard");
      return;
    }
    if (section === "reports" && !canViewReports) {
      setSection(canViewOps ? "ops" : canViewInventory ? "inventory" : "dashboard");
      return;
    }
    if (section === "admin" && !isAdmin) {
      if (canViewDashboard) setSection("dashboard");
      else if (canViewOps) setSection("ops");
      else if (canViewInventory) setSection("inventory");
    }
  }, [
    token,
    user?.role,
    section,
    canViewDashboard,
    canViewOps,
    canViewInventory,
    canViewClients,
    canViewReports,
    isAdmin
  ]);

  const localsList = localsQuery.data || [];
  const localsById = useMemo(() => {
    const map = {};
    localsList.forEach((local) => {
      if (local?.id) {
        map[local.id] = local;
      }
    });
    return map;
  }, [localsList]);
  const localsByCode = useMemo(() => {
    const map = {};
    localsList.forEach((local) => {
      if (local?.code) {
        map[String(local.code).toUpperCase()] = local;
      }
    });
    return map;
  }, [localsList]);
  const localsByName = useMemo(() => {
    const map = {};
    localsList.forEach((local) => {
      if (local?.name) {
        map[String(local.name).toLowerCase()] = local;
      }
    });
    return map;
  }, [localsList]);
  const formatLocalLabel = (value) => {
    if (!value) return "";
    if (typeof value === "object") {
      if (value.code) return value.code;
      if (value.id && localsById[value.id]?.code) return localsById[value.id].code;
      if (value.name) {
        const byName = localsByName[String(value.name).toLowerCase()];
        if (byName?.code) return byName.code;
      }
      return value.name || value.id || "";
    }
    const direct = localsById[value];
    if (direct?.code) return direct.code;
    const byCode = localsByCode[String(value).toUpperCase()];
    if (byCode?.code) return byCode.code;
    const byName = localsByName[String(value).toLowerCase()];
    if (byName?.code) return byName.code;
    return value;
  };
  const formatLocalName = (value) => {
    if (!value) return "";
    if (typeof value === "object") {
      if (value.name) return value.name;
      if (value.id && localsById[value.id]?.name) return localsById[value.id].name;
      if (value.code) {
        const byCode = localsByCode[String(value.code).toUpperCase()];
        if (byCode?.name) return byCode.name;
      }
      return value.name || value.code || value.id || "";
    }
    const direct = localsById[value];
    if (direct?.name) return direct.name;
    const byCode = localsByCode[String(value).toUpperCase()];
    if (byCode?.name) return byCode.name;
    const byName = localsByName[String(value).toLowerCase()];
    if (byName?.name) return byName.name;
    return value;
  };
  const resolveLocalId = (value) => {
    if (!value) return value;
    const raw = String(value).trim();
    if (!raw) return raw;
    if (localsById[raw]?.id) return localsById[raw].id;
    const byCode = localsByCode[raw.toUpperCase()];
    if (byCode?.id) return byCode.id;
    const byName = localsByName[raw.toLowerCase()];
    if (byName?.id) return byName.id;
    return raw;
  };
  const localOptions = useMemo(() => {
    const filtered = localsList.filter((local) => local && local.active !== false);
    filtered.sort((a, b) => String(a.code ?? "").localeCompare(String(b.code ?? "")));
    return filtered.map((local) => ({
      id: local.id,
      label: `${local.code ?? local.id} - ${local.name ?? ""}`.trim()
    }));
  }, [localsList]);
  const formatShortId = (value) => {
    if (!value) return "";
    const cleaned = String(value).replace(/-/g, "");
    return cleaned.length <= 10 ? cleaned : cleaned.slice(0, 10);
  };
  const copyToClipboard = async (text) => {
    const value = String(text ?? "");
    if (!value) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return;
      }
    } catch (err) {
      // fallback below
    }
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
    } finally {
      document.body.removeChild(textarea);
    }
  };
  const CodePill = ({ full }) => {
    const display = formatShortId(full);
    return (
      <button
        type="button"
        className="code-pill"
        title={String(full)}
        onClick={() => copyToClipboard(full)}
      >
        {display}
      </button>
    );
  };
  const ACTION_LABELS = {
    "auth.login": "Inicio de sesion",
    "auth.login_failed": "Intento fallido de inicio de sesion",
    "user.update": "Usuario actualizado",
    "client.account.debt": "Deuda registrada",
    "client.account.payment": "Pago registrado",
    "sale.create": "Venta registrada",
    "sale.cancel": "Venta anulada",
    "sale.receipt.email": "Comprobante enviado por correo",
    "cash.open": "Caja abierta",
    "cash.close": "Caja cerrada",
    "cash.force_close": "Cierre forzado",
    "cash.tx.create": "Gasto/Deposito de caja",
    "inventory.adjust": "Ajuste de inventario",
    "inventory.import_csv": "Importacion de inventario (CSV)",
    "inventory.import_excel": "Importacion de inventario (Excel)",
    "inventory.create": "Producto creado",
    "inventory.update": "Producto actualizado",
    "inventory.transfer.sent": "Envio de inventario",
    "inventory.transfer.received": "Recepcion de inventario",
    "inventory.transfer.partial_received": "Recepcion parcial",
    "inventory.transfer.observed": "Transferencia observada",
    "inventory.transfer.batch_sent": "Envio por lote",
    "inventory.transfer.batch_received": "Recepcion por lote",
    "inventory.transfer.batch_observed": "Lote observado"
  };
  const ENTITY_LABELS = {
    User: "Usuario",
    Sale: "Venta",
    CashSession: "Caja",
    InventoryItem: "Inventario",
    InventoryTransfer: "Transferencia"
  };
  const statusTone = (raw) => {
    const key = String(raw || "").toUpperCase();
    if (["ACTIVE", "OPEN", "COMPLETED", "RECEIVED", "DELIVERED"].includes(key)) return "ok";
    if (["PENDING", "SENT", "OBSERVED"].includes(key)) return "warn";
    if (["CLOSED", "CANCELLED", "CANCELED", "REJECTED"].includes(key)) return "neutral";
    return "neutral";
  };
  const StatusPill = ({ value }) => {
    const raw = String(value || "");
    if (!raw) return "";
    const key = raw.toUpperCase();
    const label = VALUE_LABELS[key] || raw;
    const tone = statusTone(raw);
    return (
      <span className={`status-pill ${tone}`} title={raw}>
        <span className="dot" aria-hidden="true" />
        {label}
      </span>
    );
  };
  const ActionPill = ({ value }) => {
    const raw = String(value || "");
    if (!raw) return "";
    const label = ACTION_LABELS[raw] || raw;
    return (
      <span className="action-pill" title={raw}>
        {label}
      </span>
    );
  };
  const formatDateTime = (value) => {
    if (!value) return "";
    const raw = String(value);
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return raw.replace("T", " ").replace("Z", "");
    }
    return parsed.toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" });
  };
  const formatSaleReceiptLabel = (row) => {
    if (!row) return "";
    const pieces = [];
    const date = formatDateTime(row.createdAt || row.date || row.updatedAt);
    if (date) pieces.push(`Venta ${date}`);
    if (row.localId) pieces.push(formatLocalLabel(row.localId));
    if (row.total !== undefined && row.total !== null) {
      pieces.push(`S/ ${Number(row.total).toFixed(2)}`);
    }
    return pieces.filter(Boolean).join(" · ");
  };
  const formatCashReceiptLabel = (row) => {
    if (!row) return "";
    const pieces = [];
    const openDate = formatDateTime(row.openedAt || row.createdAt);
    const closeDate = formatDateTime(row.closedAt || row.updatedAt);
    if (openDate) pieces.push(`Apertura ${openDate}`);
    if (!openDate && closeDate) pieces.push(`Cierre ${closeDate}`);
    if (row.localId) pieces.push(formatLocalLabel(row.localId));
    if (row.status) pieces.push(VALUE_LABELS[row.status] || row.status);
    if (row.openingAmount !== undefined && row.openingAmount !== null) {
      pieces.push(`S/ ${Number(row.openingAmount).toFixed(2)}`);
    }
    if (
      row.closingAmount !== undefined &&
      row.closingAmount !== null &&
      Number(row.closingAmount) > 0
    ) {
      pieces.push(`Cierre S/ ${Number(row.closingAmount).toFixed(2)}`);
    }
    return pieces.filter(Boolean).join(" · ");
  };

  const inventoryRows = inventoryQuery.data || [];
  const inventoryForSales = inventoryForSalesQuery.data || inventoryRows || [];
  const resolvedSaleLocalId = resolveLocalId(saleForm.localId);
  const inventoryForSalesLocal = useMemo(() => {
    const localId = fixedLocalId || resolvedSaleLocalId;
    if (!localId) return inventoryForSales;
    return inventoryForSales.filter((item) => item.localId === localId);
  }, [inventoryForSales, fixedLocalId, resolvedSaleLocalId]);
  const hasLiveInventory =
    inventoryForSalesQuery.isSuccess && inventoryForSalesLocal.length > 0;
  const suggestionInventory = useMemo(() => {
    if (hasLiveInventory) return inventoryForSalesLocal;
    return [];
  }, [hasLiveInventory, inventoryForSalesLocal, fixedLocalId, resolvedSaleLocalId]);
  const isSaleItemEmpty = (item) => {
    const values = [
      item.description,
      item.itemId,
      item.unitPrice,
      item.discountBitel,
      item.discountStore
    ];
    return values.every((value) => !String(value ?? "").trim());
  };
  const isSaleItemComplete = (item) => {
    const hasId = String(item.itemId ?? "").trim().length > 0;
    const hasDescription = String(item.description ?? "").trim().length > 0;
    const hasQuantity = parseAmount(item.quantity, { integer: true }) > 0;
    const hasPrice = parseAmount(item.unitPrice) > 0;
    return hasId && hasDescription && hasQuantity && hasPrice;
  };
  const addSaleItemRow = () => {
    setSaleItems((prev) => {
      if (prev.some((item) => !isSaleItemComplete(item))) {
        return prev;
      }
      return [
        ...prev,
        {
          description: "",
          quantity: "1",
          unitPrice: "",
          itemId: "",
          discountBitel: "",
          discountStore: "",
          maxQuantity: null
        }
      ];
    });
  };
  const clampQuantity = (value, max) => {
    if (value === "") return "";
    const parsed = parseAmount(value, { integer: true });
    if (!parsed || parsed < 1) return "1";
    if (Number.isFinite(max) && max > 0 && parsed > max) return String(max);
    return String(parsed);
  };
  const normalizeKey = (value) => String(value || "").trim().toLowerCase();
  const findInventoryMatch = (value, source) => {
    const key = normalizeKey(value);
    if (!key) return null;
    const list = source || suggestionInventory;
    return (
      list.find(
        (inv) =>
          (inv.id && String(inv.id).toLowerCase() === key) ||
          (inv.sku && String(inv.sku).toLowerCase() === key)
      ) || null
    );
  };
  const getProductSuggestions = (query) => {
    if (saleForm.type !== "PRODUCT") return [];
    const term = String(query || "").trim().toLowerCase();
    if (term.length < 1) return [];
    return suggestionInventory
      .filter((inv) => {
        const nameMatch = inv.name && String(inv.name).toLowerCase().includes(term);
        const skuMatch = inv.sku && String(inv.sku).toLowerCase().includes(term);
        const idMatch = inv.id && String(inv.id).toLowerCase().includes(term);
        return nameMatch || skuMatch || idMatch;
      })
      .slice(0, 6);
  };
  const applyProductSuggestion = (index, inv) => {
    const copy = [...saleItems];
    const maxQty = Number(inv.quantity ?? 0);
    const resolvedMax = Number.isFinite(maxQty) && maxQty > 0 ? maxQty : null;
    const displayCode = inv.sku || inv.id || "";
    copy[index] = {
      ...copy[index],
      description: inv.name || copy[index].description,
      itemId: displayCode || copy[index].itemId,
      unitPrice:
        inv.price !== undefined && inv.price !== null
          ? String(inv.price)
          : copy[index].unitPrice,
      maxQuantity: resolvedMax
    };
    if (!String(copy[index].quantity ?? "").trim()) {
      copy[index].quantity = "1";
    } else if (resolvedMax) {
      copy[index].quantity = clampQuantity(copy[index].quantity, resolvedMax);
    }
    setSaleItems(copy);
  };
  const renderTableValue = (value, key, row) => {
    const lowerKey = key ? String(key).toLowerCase() : "";
    if (lowerKey === "status") {
      return <StatusPill value={value} />;
    }
    if (lowerKey === "action") {
      return <ActionPill value={value} />;
    }
    if (lowerKey === "userid") {
      if (row?.user?.fullName) return row.user.fullName;
    }
    if (lowerKey === "entity") {
      if (typeof value === "string" && ENTITY_LABELS[value]) return ENTITY_LABELS[value];
    }
    if (key && String(key).toLowerCase().includes("local")) {
      return formatLocalLabel(value);
    }
    if (key === "itemId" && row?.item?.sku) {
      const name = row.item?.name ? ` - ${row.item.name}` : "";
      return `${row.item.sku}${name}`;
    }
    if (key && typeof value === "number") {
      const lowerKey = String(key).toLowerCase();
      const moneyKeys = [
        "total",
        "subtotal",
        "discounttotal",
        "unitprice",
        "price",
        "openingamount",
        "closingamount",
        "expectedamount",
        "difference",
        "margin",
        "avgticket",
        "avgmargin",
        "value"
      ];
      const qtyKeys = ["quantity", "count", "itemscount", "salescount", "avgitems"];
      if (qtyKeys.includes(lowerKey)) {
        return String(Math.trunc(value));
      }
      if (moneyKeys.includes(lowerKey)) {
        return `S/ ${Number(value).toFixed(2)}`;
      }
    }
    if (key && typeof value === "string") {
      const lowerKey = String(key).toLowerCase();
      if (lowerKey.includes("date") || lowerKey.includes("at")) {
        return formatDateTime(value);
      }
      const moneyKeys = [
        "total",
        "subtotal",
        "discounttotal",
        "unitprice",
        "price",
        "openingamount",
        "closingamount",
        "expectedamount",
        "difference",
        "margin",
        "avgticket",
        "avgmargin",
        "value"
      ];
      const qtyKeys = ["quantity", "count", "itemscount", "salescount", "avgitems"];
      const parsed = Number(String(value).replace(",", "."));
      if (Number.isFinite(parsed)) {
        if (qtyKeys.includes(lowerKey)) {
          return String(Math.trunc(parsed));
        }
        if (moneyKeys.includes(lowerKey)) {
          return `S/ ${parsed.toFixed(2)}`;
        }
      }
    }
    if (key && value) {
      const lowerKey = String(key).toLowerCase();
      const isInventoryRow = row && (row.sku || row.name) && (row.quantity !== undefined);
      const isLocalRow = row && (row.code || row.address);
      const isUserRow = row && row.email;
      const isProcessCode = !isInventoryRow && !isLocalRow && !isUserRow;
      if ((lowerKey === "id" || lowerKey.includes("code")) && isProcessCode) {
        return <CodePill full={value} />;
      }
    }
    return renderValue(value);
  };
  const renderLocalSelect = ({
    value,
    onChange,
    disabled = false,
    required = false,
    emptyLabel = "Selecciona local"
  }) => {
    if (!localOptions.length) {
      return (
        <input
          placeholder={emptyLabel}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          readOnly={disabled}
        />
      );
    }
    const normalizedValue = value || "";
    return (
      <select
        value={normalizedValue}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required={required}
      >
        {!disabled && <option value="">{emptyLabel}</option>}
        {localOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    );
  };
  const inventoryColumns = [
    { key: "sku", label: "Codigo" },
    { key: "name", label: "Producto" },
    { key: "quantity", label: "Stock" },
    { key: "price", label: "Precio" },
    ...(canManageInventoryItems ? [{ key: "action", label: "Acciones" }] : [])
  ];
  const transferColumns = [
    { key: "batchCode", label: "Envio" },
    { key: "fromLocalId", label: "Origen" },
    { key: "toLocalId", label: "Destino" },
    { key: "status", label: "Estado" },
    { key: "itemsCount", label: "Items" },
    { key: "createdAt", label: "Fecha" },
    ...(canPrintTransfers ? [{ key: "action", label: "Acciones" }] : [])
  ];

  const transferGroups = useMemo(() => {
    const list = transfersQuery.data || [];
    if (!Array.isArray(list) || list.length === 0) return [];
    const map = new Map();
    list.forEach((t) => {
      const groupCode = String(t.batchCode || t.transferCode || t.id || "").trim();
      if (!groupCode) return;
      const key = groupCode;
      const existing = map.get(key);
      const createdAt = t.createdAt || t.updatedAt || t.receivedAt || null;
      const row = existing || {
        batchCode: groupCode,
        fromLocalId: t.fromLocalId,
        toLocalId: t.toLocalId,
        createdAt,
        status: t.status,
        itemsCount: 0,
        _transfers: []
      };
      row._transfers.push(t);
      row.itemsCount = row._transfers.length;
      // Aggregate status: Observado > Enviado/Pendiente > Recibido
      const statuses = row._transfers.map((x) => x.status);
      if (statuses.some((s) => String(s).toUpperCase() === "OBSERVED")) {
        row.status = "OBSERVED";
      } else if (statuses.every((s) => String(s).toUpperCase() === "RECEIVED")) {
        row.status = "RECEIVED";
      } else {
        row.status = "SENT";
      }
      const newest = row._transfers.reduce((acc, cur) => {
        const a = acc ? new Date(acc.createdAt || 0).getTime() : 0;
        const b = cur.createdAt ? new Date(cur.createdAt).getTime() : 0;
        return b > a ? cur : acc;
      }, null);
      if (newest?.createdAt) row.createdAt = newest.createdAt;
      map.set(key, row);
    });
    return Array.from(map.values()).sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
  }, [transfersQuery.data]);

  const receiveBatchPreview = useMemo(() => {
    const code = String(receiveBatchForm.batchCode || "").trim();
    if (!code || code.length < 4) return null;

    const allTransfers = Array.isArray(transfersQuery.data) ? transfersQuery.data : [];
    const batchMatches = allTransfers.filter((row) => String(row.batchCode || "").trim() === code);
    if (batchMatches.length > 0) {
      const rows = batchMatches.map((row, idx) => ({
        id: row.id || `${code}-${idx}`,
        sku: row.item?.sku || row.itemId || "",
        item: row.item?.name || row.item?.sku || row.itemId || "",
        quantity: Number(row.quantity || 0),
        status: row.status
      }));
      const pendingCount = rows.filter((row) => String(row.status || "").toUpperCase() === "SENT").length;
      return {
        mode: "batch",
        code,
        totalCount: rows.length,
        pendingCount,
        rows
      };
    }

    const transferMatch = allTransfers.find(
      (row) => String(row.transferCode || "").trim() === code
    );
    if (transferMatch) {
      return {
        mode: "transfer-code",
        code,
        suggestedBatch: String(transferMatch.batchCode || "").trim()
      };
    }

    return { mode: "not-found", code };
  }, [receiveBatchForm.batchCode, transfersQuery.data]);

  const topLocalsBySales = useMemo(() => {
    if (!isAdmin) return [];
    const list = Array.isArray(reportsSalesByLocal.data) ? reportsSalesByLocal.data : [];
    return list
      .map((row) => ({
        id: row.localId,
        localId: row.localId,
        total: Number(row?._sum?.total ?? 0),
        salesCount: Number(row?._count?._all ?? 0)
      }))
      .sort((a, b) => b.total - a.total);
  }, [reportsSalesByLocal.data, isAdmin]);

  const filteredInventory = inventoryRows.filter((item) => {
    if (inventoryListLocalId && item.localId && item.localId !== inventoryListLocalId) {
      return false;
    }
    if (!inventorySearch) return true;
    const haystack = `${item.sku} ${item.name}`.toLowerCase();
    return haystack.includes(inventorySearch.toLowerCase());
  });
  const cashDiffTotal = useMemo(
    () =>
      (cashDiffsQuery.data || []).reduce(
        (sum, row) => sum + Number(row?.difference ?? 0),
        0
      ),
    [cashDiffsQuery.data]
  );

  const openCashSession = useMemo(() => {
    const localToMatch =
      fixedLocalId || resolvedSaleLocalId || resolveLocalId(cashOpenForm.localId);
    if (!localToMatch) return null;
    return (cashQuery.data || []).find(
      (row) => row.status === "OPEN" && (!localToMatch || row.localId === localToMatch)
    );
  }, [cashQuery.data, fixedLocalId, resolvedSaleLocalId, cashOpenForm.localId]);

  useEffect(() => {
    setCashCloseForm((prev) => ({ ...prev, cashSessionId: openCashSession?.id || "" }));
  }, [openCashSession?.id]);

  useEffect(() => {
    if (!openCashSession?.id) return;
    setCashCloseBreakdown({});
  }, [openCashSession?.id]);

  useEffect(() => {
    const total = CASH_DENOMINATIONS.reduce(
      (sum, denom) => sum + Number(denom) * Number(cashCloseBreakdown[String(denom)] ?? 0),
      0
    );
    const hasAny = Object.values(cashCloseBreakdown).some((value) => Number(value) > 0);
    const normalized = Number(total.toFixed(2));
    setCashCloseForm((prev) => ({
      ...prev,
      closingAmount: hasAny ? normalized.toFixed(2) : ""
    }));
  }, [cashCloseBreakdown]);

  useEffect(() => {
    if (!salesQuery.data || salesQuery.data.length === 0) {
      if (receiptSaleId) setReceiptSaleId("");
      return;
    }
    if (!receiptSaleId) {
      setReceiptSaleId(salesQuery.data[0].id);
    }
  }, [salesQuery.data, receiptSaleId]);

  useEffect(() => {
    if (!cashQuery.data || cashQuery.data.length === 0) {
      if (receiptCashId) setReceiptCashId("");
      return;
    }
    if (!receiptCashId) {
      setReceiptCashId(cashQuery.data[0].id);
    }
  }, [cashQuery.data, receiptCashId]);

  if (!token) {
    return (
      <div className="app" key="guest">
        <main className="login-card">
          <header>
            <h1>Bitel Multi-local</h1>
            <p>Acceso seguro para locales y administracion.</p>
          </header>
          <form onSubmit={handleLogin} className="form">
            <label>
              Correo
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="admin@bitel.local"
                required
              />
            </label>
            <label>
              Contrasena
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="********"
                required
              />
            </label>
            {error && <div className="error">{error}</div>}
            <button type="submit">Ingresar</button>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className="app" key="auth">
      <header className="topbar">
        <div>
          <h1>{greeting}</h1>
          <p>Panel de control multi-local</p>
          {user && (
            <span className="role-chip">
              {roleDisplay} {user.localId ? `- Local ${formatLocalName(user.localId)}` : ""}
            </span>
          )}
        </div>
        <div className="topbar-actions">
          <div className="periods" style={{ "--i": periodIndex }}>
            <span className="periods-indicator" aria-hidden="true" />
            {PERIODS.map((p) => (
              <button
                key={p.id}
                className={period === p.id ? "active" : ""}
                onClick={() => setPeriod(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button className="logout" onClick={handleLogout}>
            Cerrar sesion
          </button>
        </div>
      </header>

      <nav className="nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={section === item.id ? "active" : ""}
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {sectionErrors[section] && (
        <div className="section-banner error-banner">{sectionErrors[section]}</div>
      )}

      {toast.message && <div className={`floating-toast ${toast.type}`}>{toast.message}</div>}

      {alertsQuery.data &&
        Boolean(
          (alertsQuery.data.lowStockCount ?? 0) > 0 ||
            (alertsQuery.data.cashDiffsCount ?? 0) > 0 ||
            (alertsQuery.data.pendingTransfersCount ?? 0) > 0 ||
            (alertsQuery.data.observedTransfersCount ?? 0) > 0
        ) && (
          <div className="section-banner warn-banner">
            Alertas: Stock bajo ({alertsQuery.data.lowStockCount || 0}) · Diferencias de caja (
            {alertsQuery.data.cashDiffsCount || 0}) · Transferencias pendientes (
            {alertsQuery.data.pendingTransfersCount || 0}) · Observadas (
            {alertsQuery.data.observedTransfersCount || 0})
          </div>
        )}

      {section === "dashboard" && (
        <>
          <section className="grid">
            <article className="card highlight">
              <h2>Ventas totales</h2>
              <div className="value">
                S/ {summaryQuery.data?.totalSales?.toFixed?.(2) ?? "0.00"}
              </div>
              <span>Operaciones: {summaryQuery.data?.salesCount ?? 0}</span>
            </article>

            <article className="card">
              <h2>Operaciones</h2>
              <div className="value">{summaryQuery.data?.salesCount ?? 0}</div>
              <span>Ventas registradas</span>
            </article>

            <article className="card">
              <h2>Productos</h2>
              <div className="value">
                S/ {summaryQuery.data?.byType?.PRODUCT?.total?.toFixed?.(2) ?? "0.00"}
              </div>
              <span>Ops: {summaryQuery.data?.byType?.PRODUCT?.count ?? 0}</span>
            </article>

            <article className="card">
              <h2>Servicios</h2>
              <div className="value">
                S/ {summaryQuery.data?.byType?.SERVICE?.total?.toFixed?.(2) ?? "0.00"}
              </div>
              <span>Ops: {summaryQuery.data?.byType?.SERVICE?.count ?? 0}</span>
            </article>

            {canListCash && (
              <article className="card">
                <h2>Caja en jornada</h2>
                <div className="value">
                  S/ {Number(liveCashQuery.data?.totalExpected ?? 0).toFixed(2)}
                </div>
                <span>Cajas abiertas: {liveCashQuery.data?.sessionsOpen ?? 0}</span>
              </article>
            )}
          </section>

          {isAdmin && Array.isArray(summaryQuery.data?.byLocal) && summaryQuery.data.byLocal.length > 0 && (
            <section className="panel">
              <div>
                <h3>Operaciones por local</h3>
                <Table
                  renderCell={renderTableValue}
                  columns={[
                    { key: "localId", label: "Local" },
                    { key: "total", label: "Total" },
                    { key: "count", label: "Operaciones" }
                  ]}
                  rows={summaryQuery.data.byLocal}
                  emptyFallback={[]}
                  emptyLabel=""
                />
              </div>
            </section>
          )}

          <section className="panel">
            <div className="panel-note">
              <h3>Actividad y auditoria</h3>
              <p>
                Cada operacion queda registrada para control y reportes consolidados por local
                y total.
              </p>
            </div>
          </section>

          <section className="grid">
            <article className="card">
              <h2>Stock bajo</h2>
              <div className="value">{lowStockQuery.data?.length ?? 0}</div>
              <span>Items en alerta</span>
            </article>
            <article className="card">
              <h2>Diferencias de caja</h2>
              <div className="value">{cashDiffsQuery.data?.length ?? 0}</div>
              <span>Monto: S/ {Number(cashDiffTotal).toFixed(2)}</span>
            </article>
          </section>
        </>
      )}

      {section === "ops" && (
        <div className="accordion-stack">
          <Accordion title="Ventas y caja" defaultOpen>
            <section className="panel">
            <div>
              <h3>Ventas</h3>
              <form className="form grid-form" onSubmit={handleCreateSale}>
                <fieldset disabled={!canCreateSales}>
                {renderLocalSelect({
                  value: isLocalFixed ? fixedLocalId : saleForm.localId,
                  onChange: (value) => setSaleForm({ ...saleForm, localId: value }),
                  disabled: isLocalFixed,
                  required: true,
                  emptyLabel: "Selecciona local"
                })}
                <select
                  value={saleForm.type}
                  onChange={(e) => setSaleForm({ ...saleForm, type: e.target.value })}
                >
                {SALE_TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
                </select>
                <select
                  value={saleForm.method}
                  onChange={(e) => setSaleForm({ ...saleForm, method: e.target.value })}
                >
                {PAYMENT_METHOD_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
                </select>
                <select
                  value={saleForm.receiptType}
                  onChange={(e) => setSaleForm({ ...saleForm, receiptType: e.target.value })}
                >
                  {RECEIPT_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Se asigna al registrar"
                  value={saleForm.receiptNumber || ""}
                  readOnly
                />
                <div className="table-note">
                  Precio fijo por inventario: para variar el total usa descuentos o actualiza el
                  precio en Inventario.
                </div>
                {saleItems.map((item, index) => {
                  const suggestions = getProductSuggestions(item.description);
                  const showSuggestions =
                    activeSuggestionIndex === index && suggestions.length > 0;
                  const maxQuantity = item.maxQuantity ?? null;
                  const lineTotal =
                    parseAmount(item.quantity) * parseAmount(item.unitPrice) -
                    parseAmount(item.discountBitel) -
                    parseAmount(item.discountStore);
                  return (
                    <div key={index} className="sale-row">
                      <div className="inline-row">
                        <input
                          placeholder="Codigo"
                          value={item.itemId}
                          onChange={(e) => {
                            const nextValue = e.target.value;
                            const copy = [...saleItems];
                            copy[index].itemId = nextValue;
                            const match = findInventoryMatch(nextValue, suggestionInventory);
                            if (match) {
                              copy[index].description = match.name || copy[index].description;
                              copy[index].unitPrice =
                                match.price !== undefined && match.price !== null
                                  ? String(match.price)
                                  : copy[index].unitPrice;
                              const maxQty = Number(match.quantity ?? 0);
                              copy[index].maxQuantity =
                                Number.isFinite(maxQty) && maxQty > 0 ? maxQty : null;
                              if (copy[index].quantity) {
                                copy[index].quantity = clampQuantity(
                                  copy[index].quantity,
                                  copy[index].maxQuantity
                                );
                              }
                            } else {
                              copy[index].maxQuantity = null;
                              copy[index].unitPrice = "";
                            }
                            setSaleItems(copy);
                          }}
                          required
                        />
                        <div className="inline-field">
                          <input
                            placeholder="Descripcion / buscar producto"
                            value={item.description}
                            onFocus={() => setActiveSuggestionIndex(index)}
                            onBlur={() => {
                              window.setTimeout(() => {
                                setActiveSuggestionIndex((prev) =>
                                  prev === index ? null : prev
                                );
                              }, 120);
                            }}
                            onChange={(e) => {
                              const nextValue = e.target.value;
                              const copy = [...saleItems];
                              copy[index].description = nextValue;
                              const match = suggestionInventory.find(
                                (inv) =>
                                  inv.name && inv.name.toLowerCase() === nextValue.toLowerCase()
                              );
                              if (match) {
                                copy[index].itemId = match.sku || match.id || copy[index].itemId;
                                copy[index].unitPrice =
                                  match.price !== undefined && match.price !== null
                                    ? String(match.price)
                                    : copy[index].unitPrice;
                                const maxQty = Number(match.quantity ?? 0);
                                copy[index].maxQuantity =
                                  Number.isFinite(maxQty) && maxQty > 0 ? maxQty : null;
                              } else {
                                const idMatch = findInventoryMatch(
                                  copy[index].itemId,
                                  suggestionInventory
                                );
                                if (idMatch) {
                                  const maxQty = Number(idMatch.quantity ?? 0);
                                  copy[index].maxQuantity =
                                    Number.isFinite(maxQty) && maxQty > 0 ? maxQty : null;
                                } else {
                                  copy[index].maxQuantity = null;
                                  copy[index].unitPrice = "";
                                }
                              }
                              if (copy[index].quantity) {
                                copy[index].quantity = clampQuantity(
                                  copy[index].quantity,
                                  copy[index].maxQuantity
                                );
                              }
                              setSaleItems(copy);
                            }}
                            required
                          />
                        </div>
                        <input
                          type="number"
                          min="1"
                          max={maxQuantity || undefined}
                          placeholder="Cantidad"
                          value={item.quantity}
                          onChange={(e) => {
                            const copy = [...saleItems];
                            copy[index].quantity = clampQuantity(e.target.value, maxQuantity);
                            setSaleItems(copy);
                          }}
                          required
                        />
                        <div className="inline-field">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Precio fijo (S/)"
                            value={item.unitPrice}
                            readOnly
                            required
                          />
                          <span className="price-hint">
                            Total: S/ {Number(lineTotal > 0 ? lineTotal : 0).toFixed(2)}
                          </span>
                        </div>
                        <div className="discount-pair">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Desc. Bitel"
                            value={item.discountBitel}
                            onChange={(e) => {
                              const copy = [...saleItems];
                              copy[index].discountBitel = e.target.value;
                              setSaleItems(copy);
                            }}
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Desc. tienda"
                            value={item.discountStore}
                            onChange={(e) => {
                              const copy = [...saleItems];
                              copy[index].discountStore = e.target.value;
                              setSaleItems(copy);
                            }}
                          />
                        </div>
                      </div>
                      {showSuggestions && (
                        <div className="suggestions-panel">
                          <div className="suggestions-title">Sugerencias</div>
                          <div className="suggestions-table">
                            {suggestions.map((inv) => {
                              const isLow =
                                inv.minStock !== undefined &&
                                inv.quantity !== undefined &&
                                Number(inv.quantity) <= Number(inv.minStock);
                              return (
                                <button
                                  key={inv.id || inv.sku}
                                  type="button"
                                  className="suggestion-row"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    applyProductSuggestion(index, inv);
                                    setActiveSuggestionIndex(null);
                                  }}
                                >
                                  <div>
                                    <div className="suggestion-name">{inv.name}</div>
                                    <div className="suggestion-meta">{inv.sku || inv.id}</div>
                                  </div>
                                  <div className="suggestion-right">
                                    <span className="suggestion-price">
                                      S/ {Number(inv.price ?? 0).toFixed(2)}
                                    </span>
                                    <span
                                      className={`suggestion-stock ${isLow ? "low" : ""}`}
                                    >
                                      Stock: {Number(inv.quantity ?? 0)}
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="inline-actions">
                  <button
                    type="button"
                    onClick={addSaleItemRow}
                    disabled={saleItems.some((item) => !isSaleItemComplete(item))}
                  >
                    Agregar producto
                  </button>
                  <button type="submit">Registrar venta</button>
                </div>
                {offlineQueue.length > 0 && (
                  <div className="offline-note">
                    <div className="table-note">
                      Pendientes offline: {offlineQueue.length}. Se reintentan cuando vuelva la
                      conexion.
                    </div>
                    {canRetryOffline && (
                      <div className="inline-actions">
                        <button type="button" onClick={handleRetryOffline}>
                          Reintentar cola offline
                        </button>
                      </div>
                    )}
                  </div>
                )}
                </fieldset>
              </form>
              {!canCreateSales && (
                <div className="table-note">Modo solo lectura: no puedes registrar ventas.</div>
              )}
            </div>
            <div className="panel-note">
              <h3>Caja por turno</h3>
              {!canListCash ? (
                <div className="table-note">Tu rol no tiene permisos para ver caja.</div>
              ) : (
                <>
                  {openCashSession && (
                    <div className="table-note">
                      Caja abierta en {formatLocalLabel(openCashSession.localId)} ·{" "}
                      {formatDateTime(openCashSession.openedAt)} ·{" "}
                      <StatusPill value={openCashSession.status} />
                    </div>
                  )}
                  {!canManageCash && (
                    <div className="table-note">
                      Solo lectura: puedes ver caja, pero no abrir/cerrar ni registrar movimientos.
                    </div>
                  )}
                  <div className="cash-stack">
                <div className="cash-block">
                  <h4>Abrir caja</h4>
                  <form className="form" onSubmit={handleOpenCash}>
                    <fieldset disabled={!canManageCash}>
                    {renderLocalSelect({
                      value: isLocalFixed ? fixedLocalId : cashOpenForm.localId,
                      onChange: (value) => setCashOpenForm({ ...cashOpenForm, localId: value }),
                      disabled: isLocalFixed,
                      required: true,
                      emptyLabel: "Selecciona local"
                    })}
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Monto de apertura (S/)"
                      value={cashOpenForm.openingAmount}
                      onChange={(e) =>
                        setCashOpenForm({ ...cashOpenForm, openingAmount: e.target.value })
                      }
                      required
                    />
                    <button type="submit">Abrir caja</button>
                    </fieldset>
                  </form>
                </div>
                <div className="cash-block">
                  <h4>Cerrar caja</h4>
                  <form className="form" onSubmit={handleCloseCash}>
                    <fieldset disabled={!canManageCash}>
                    <div className="denoms-grid">
                      {CASH_DENOMINATIONS.map((denom) => (
                        <label key={denom}>
                          {Number(denom) >= 1
                            ? String(denom)
                            : Number(denom).toFixed(2)}
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={cashCloseBreakdown[String(denom)] ?? ""}
                            onChange={(e) => {
                              const count = parseAmount(e.target.value, { integer: true });
                              setCashCloseBreakdown((prev) => ({
                                ...prev,
                                [String(denom)]: count
                              }));
                            }}
                            placeholder="0"
                          />
                        </label>
                      ))}
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Monto de cierre (S/)"
                      value={cashCloseForm.closingAmount}
                      readOnly
                      required
                    />
                    <div className="table-note">
                      El monto de cierre se calcula solo con el conteo de billetes y monedas.
                    </div>
                    <button type="submit">Cerrar caja</button>
                    </fieldset>
                  </form>
                </div>

                {openCashSession && (
                  <div className="cash-block">
                    <h4>Movimientos de caja</h4>
                    <form className="form" onSubmit={handleCashTransaction}>
                      <fieldset disabled={!canManageCash}>
                      <select
                        value={cashTxForm.type}
                        onChange={(e) => setCashTxForm({ ...cashTxForm, type: e.target.value })}
                      >
                        <option value="EXPENSE">Gasto operativo</option>
                        <option value="BANK_DEPOSIT">Deposito a cuenta (transferencia)</option>
                      </select>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Monto (S/)"
                        value={cashTxForm.amount}
                        onChange={(e) => setCashTxForm({ ...cashTxForm, amount: e.target.value })}
                        required
                      />
                      <input
                        placeholder={
                          cashTxForm.type === "EXPENSE"
                            ? "Motivo (obligatorio)"
                            : "Motivo (opcional)"
                        }
                        value={cashTxForm.reason}
                        onChange={(e) => setCashTxForm({ ...cashTxForm, reason: e.target.value })}
                        required={cashTxForm.type === "EXPENSE"}
                      />
                      <button type="submit">Registrar</button>
                      </fieldset>
                    </form>
                    <Table
                      renderCell={(value, key, row) => {
                        if (key === "amount") {
                          const amount = Number(value ?? 0);
                          return (
                            <span className={amount < 0 ? "money-neg" : "money-pos"}>
                              S/ {amount.toFixed(2)}
                            </span>
                          );
                        }
                        return renderValue(value);
                      }}
                      columns={[
                        { key: "type", label: "Tipo" },
                        { key: "amount", label: "Monto" },
                        { key: "reason", label: "Motivo" },
                        { key: "createdAt", label: "Fecha" }
                      ]}
                      rows={(cashTransactionsQuery.data || []).map((row) => ({
                        id: row.id,
                        type: row.meta?.type || "",
                        amount: Number(row.meta?.signedAmount ?? 0),
                        reason: row.meta?.reason || "",
                        createdAt: row.createdAt
                      }))}
                      emptyFallback={[]}
                      emptyLabel=""
                    />
                    {cashReconciliationQuery.data && (
                      <div className="table-note">
                        Esperado (con movimientos): S/{" "}
                        {Number(cashReconciliationQuery.data.expected ?? 0).toFixed(2)}
                      </div>
                    )}
                  </div>
                )}
                {canForceCloseCash && (
                  <div className="cash-block">
                    <h4>Forzar cierre</h4>
                    <form className="form" onSubmit={handleForceCloseCash}>
                      <fieldset disabled={!canForceCloseCash}>
                      {renderLocalSelect({
                        value: isLocalFixed ? fixedLocalId : cashForceForm.localId,
                        onChange: (value) => setCashForceForm({ ...cashForceForm, localId: value }),
                        disabled: isLocalFixed,
                        required: true,
                        emptyLabel: "Selecciona local"
                      })}
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Monto de cierre (S/)"
                        value={cashForceForm.closingAmount}
                        onChange={(e) =>
                          setCashForceForm({ ...cashForceForm, closingAmount: e.target.value })
                        }
                        required
                      />
                      <input
                        placeholder="Motivo"
                        value={cashForceForm.reason}
                        onChange={(e) =>
                          setCashForceForm({ ...cashForceForm, reason: e.target.value })
                        }
                      />
                      <button type="submit">Forzar cierre</button>
                      </fieldset>
                    </form>
                  </div>
                )}
              </div>
                </>
              )}
            </div>
            </section>
          </Accordion>

          <Accordion title="Ventas recientes y acciones">
            <section className="panel">
            <div>
              <h3>Ventas recientes</h3>
              <Table
                renderCell={renderTableValue}
                columns={[
                  { key: "id", label: "Codigo" },
                  { key: "type", label: "Tipo" },
                  { key: "method", label: "Pago" },
                  { key: "total", label: "Total" },
                  { key: "createdAt", label: "Fecha" }
                ]}
                rows={salesQuery.data || []}
                emptyFallback={[]}
                emptyLabel=""
              />
              <div className="inline-actions table-actions">
                <button
                  type="button"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["sales"] })}
                >
                  Refrescar
                </button>
              </div>
            </div>
            <div className="panel-note">
              <h3>Acciones</h3>
              <p>Para anular una venta, copia el codigo desde la tabla (clic en el codigo) y pegalo aqui:</p>
              <div className="inline-actions">
                <button
                  type="button"
                  disabled={!canCancelSales}
                  onClick={async () => {
                    const id = window.prompt("ID de venta");
                    const reason = window.prompt("Motivo de anulacion");
                    if (id && reason) {
                      clearSectionError("ops");
                      try {
                        await cancelSale(id, { reason });
                        queryClient.invalidateQueries({ queryKey: ["sales"] });
                      } catch (err) {
                        setSectionError(
                          "ops",
                          extractErrorMessage(err, "No se pudo anular la venta.")
                        );
                      }
                    }
                  }}
                >
                  Anular venta
                </button>
              </div>
              {!canCancelSales && (
                <div className="table-note">Solo administrador, auditor o vendedor puede anular ventas.</div>
              )}
              <div className="form compact">
                <fieldset disabled={!canDownloadSalesReceipt}>
                  <label>
                    Comprobante
                    <select
                      value={receiptSaleId}
                      onChange={(e) => setReceiptSaleId(e.target.value)}
                      disabled={!salesQuery.data || salesQuery.data.length === 0}
                    >
                      {(salesQuery.data || []).map((row) => (
                        <option key={row.id} value={row.id}>
                          {formatSaleReceiptLabel(row) || row.id}
                        </option>
                      ))}
                      {(!salesQuery.data || salesQuery.data.length === 0) && (
                        <option value="">Sin ventas reales</option>
                      )}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!receiptSaleId) {
                        setSectionError("ops", "Selecciona una venta real para descargar.");
                        return;
                      }
                      clearSectionError("ops");
                      try {
                        await downloadWithAuth(
                          `/sales/${receiptSaleId}/receipt.pdf`,
                          `comprobante-${receiptSaleId}.pdf`
                        );
                      } catch (err) {
                        setSectionError(
                          "ops",
                          extractErrorMessage(err, "No se pudo descargar el comprobante.")
                        );
                      }
                    }}
                    disabled={!receiptSaleId}
                  >
                    Descargar comprobante
                  </button>
                  <input
                    type="email"
                    placeholder="Correo del cliente (comprobante electronico)"
                    value={receiptSaleEmail}
                    onChange={(e) => setReceiptSaleEmail(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={handleSendSaleReceipt}
                    disabled={
                      !receiptSaleId ||
                      (salesQuery.data || []).find((row) => row.id === receiptSaleId)?.receiptType !==
                        "BOLETA_ELECTRONICA"
                    }
                  >
                    Enviar comprobante
                  </button>
                  <div className="table-note">
                    Envio electronico disponible para boletas electronicas.
                  </div>
                </fieldset>
                {!canDownloadSalesReceipt && (
                  <div className="table-note">Sin permisos para descargar comprobantes.</div>
                )}
                {(!salesQuery.data || salesQuery.data.length === 0) && (
                  <div className="table-note">Necesitas ventas reales para descargar.</div>
                )}
              </div>
            </div>
            </section>
          </Accordion>

          {canListCash && (
            <Accordion title="Cajas recientes y cierres">
              <section className="panel">
              <div>
                <h3>Cajas recientes</h3>
                <Table
                  renderCell={renderTableValue}
                  columns={[
                    { key: "localId", label: "Local" },
                    { key: "status", label: "Estado" },
                    { key: "openedAt", label: "Apertura" },
                    { key: "closedAt", label: "Cierre" },
                    { key: "openingAmount", label: "Monto apertura" },
                    { key: "closingAmount", label: "Monto cierre" },
                    { key: "difference", label: "Diferencia" }
                  ]}
                  rows={cashQuery.data || []}
                  emptyFallback={[]}
                  emptyLabel=""
                />
              </div>
              <div className="panel-note">
                <h3>PDF cierre</h3>
                <div className="form compact">
                  <fieldset disabled={!canDownloadCashReceipt}>
                    <label>
                      Cierre de caja
                      <select
                        value={receiptCashId}
                        onChange={(e) => setReceiptCashId(e.target.value)}
                        disabled={!cashQuery.data || cashQuery.data.length === 0}
                      >
                        {(cashQuery.data || []).map((row) => (
                          <option key={row.id} value={row.id}>
                            {formatCashReceiptLabel(row) || row.id}
                          </option>
                        ))}
                        {(!cashQuery.data || cashQuery.data.length === 0) && (
                          <option value="">Sin cajas reales</option>
                        )}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!receiptCashId) {
                          setSectionError("ops", "Selecciona una caja real para descargar.");
                          return;
                        }
                        clearSectionError("ops");
                        try {
                          await downloadWithAuth(
                            `/cash/${receiptCashId}/receipt.pdf`,
                            `cierre-${receiptCashId}.pdf`
                          );
                        } catch (err) {
                          setSectionError(
                            "ops",
                            extractErrorMessage(err, "No se pudo descargar el cierre.")
                          );
                        }
                      }}
                      disabled={!receiptCashId}
                    >
                      Descargar cierre
                    </button>
                  </fieldset>
                  {!canDownloadCashReceipt && (
                    <div className="table-note">Sin permisos para descargar cierres.</div>
                  )}
                  {(!cashQuery.data || cashQuery.data.length === 0) && (
                    <div className="table-note">No hay cajas reales para descargar.</div>
                  )}
                </div>
              </div>
              </section>
            </Accordion>
          )}
        </div>
      )}

      {section === "inventory" && (
        <div className="accordion-stack">
          <Accordion title="Listado y registro de productos" defaultOpen>
            <section className="panel inventory-layout">
            <div>
              <h3>Inventario</h3>
              <div className="filter-grid">
                {renderLocalSelect({
                  value: isLocalFixed ? fixedLocalId : inventoryListLocalId,
                  onChange: (value) => setInventoryListLocalId(value),
                  disabled: isLocalFixed,
                  emptyLabel: "Todos los locales"
                })}
              </div>
              <input
                placeholder="Buscar por codigo o nombre"
                value={inventorySearch}
                onChange={(e) => setInventorySearch(e.target.value)}
              />
              {canExportReports && (
                <div className="inline-actions inventory-actions">
                  <button
                    type="button"
                    onClick={async () => {
                      const localId = isLocalFixed ? fixedLocalId : inventoryListLocalId;
                      const params = new URLSearchParams();
                      if (localId) params.set("localId", localId);
                      const qs = params.toString();
                      try {
                        await downloadWithAuth(
                          `/reports/inventory/items.xlsx${qs ? `?${qs}` : ""}`,
                          `inventario-${localId || "todos"}.xlsx`
                        );
                      } catch (err) {
                        setSectionError(
                          "inventory",
                          extractErrorMessage(err, "No se pudo exportar el inventario.")
                        );
                      }
                    }}
                  >
                    Exportar Excel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const localId = isLocalFixed ? fixedLocalId : inventoryListLocalId;
                      const params = new URLSearchParams();
                      if (localId) params.set("localId", localId);
                      const qs = params.toString();
                      try {
                        await downloadWithAuth(
                          `/reports/inventory/items.pdf${qs ? `?${qs}` : ""}`,
                          `inventario-${localId || "todos"}.pdf`
                        );
                      } catch (err) {
                        setSectionError(
                          "inventory",
                          extractErrorMessage(err, "No se pudo exportar el inventario.")
                        );
                      }
                    }}
                  >
                    Exportar PDF
                  </button>
                </div>
              )}
              <div className="table table-scroll inventory-table">
                <div className="table-row header sticky">
                  {inventoryColumns.map((col) => (
                    <div key={col.key} className="cell">
                      {col.label}
                    </div>
                  ))}
                </div>
                {filteredInventory.map((item) => {
                  const qty = Number(item.quantity ?? 0);
                  const min = Number(item.minStock ?? 0);
                  const isLow = (Number.isFinite(min) && min > 0 && qty <= min) || qty <= 3;
                  const isMid = !isLow && qty <= 10;
                  return (
                  <div
                    key={item.id}
                    className={`table-row ${isLow ? "low-stock-row" : ""} ${
                      isMid ? "mid-stock-row" : ""
                    }`}
                  >
                    {inventoryColumns.map((col) => (
                      <div
                        key={col.key}
                        className={`cell ${col.key === "action" ? "action-cell" : ""}`}
                      >
                        {col.key === "action" ? (
                          <button
                            type="button"
                            onClick={() => selectInventoryItem(item)}
                          >
                            Editar
                          </button>
                        ) : (
                          renderTableValue(item[col.key], col.key, item)
                        )}
                      </div>
                    ))}
                  </div>
                );
                })}
                {filteredInventory.length === 0 && <div className="empty">Sin datos.</div>}
              </div>
            </div>
            {canManageInventoryItems ? (
              <div className="panel-note">
                <h3>{inventoryMode === "edit" ? "Editar producto" : "Nuevo producto"}</h3>
                <form
                  className="form"
                  onSubmit={inventoryMode === "edit" ? handleUpdateInventory : handleCreateInventory}
                >
                  <fieldset>
                  <label>
                    Local
                    {renderLocalSelect({
                      value: inventoryForm.localId,
                      onChange: (value) => setInventoryForm({ ...inventoryForm, localId: value }),
                      disabled: inventoryMode === "edit" || isLocalFixed,
                      required: true,
                      emptyLabel: "Selecciona local"
                    })}
                  </label>
                  <label>
                    Codigo
                    <input
                      value={inventoryForm.sku}
                      onChange={(e) => setInventoryForm({ ...inventoryForm, sku: e.target.value })}
                      required
                      readOnly={inventoryMode === "edit"}
                    />
                  </label>
                  <label>
                    Producto
                    <input
                      value={inventoryForm.name}
                      onChange={(e) => setInventoryForm({ ...inventoryForm, name: e.target.value })}
                      required
                    />
                  </label>
                  <label>
                    Categoria
                    <input
                      value={inventoryForm.category}
                      onChange={(e) =>
                        setInventoryForm({ ...inventoryForm, category: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Stock
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={inventoryForm.quantity}
                      onChange={(e) =>
                        setInventoryForm({ ...inventoryForm, quantity: e.target.value })
                      }
                      required
                    />
                  </label>
                  <label>
                    Precio venta (S/)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={inventoryForm.price}
                      onChange={(e) =>
                        setInventoryForm({ ...inventoryForm, price: e.target.value })
                      }
                    />
                  </label>
                  <div className="inline-actions">
                    <button type="submit">
                      {inventoryMode === "edit" ? "Actualizar" : "Guardar"}
                    </button>
                    {inventoryMode === "edit" && (
                      <button
                        type="button"
                        onClick={() => {
                          setInventoryForm({
                            localId: "",
                            sku: "",
                            name: "",
                            category: "",
                            quantity: "",
                            minStock: "",
                            price: ""
                          });
                          setInventoryMode("create");
                          clearSectionError("inventory");
                        }}
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                  </fieldset>
                </form>

                <h4>Importar desde Excel</h4>
                <div className="table-note">
                  Columnas soportadas: `sku,name,category,quantity,minStock,price` (con header en la primera fila).
                </div>
                <div className="inline-actions">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await downloadWithAuth(
                          "/inventory/template.xlsx",
                          "plantilla-inventario.xlsx"
                        );
                      } catch (err) {
                        setSectionError(
                          "inventory",
                          extractErrorMessage(err, "No se pudo descargar la plantilla.")
                        );
                      }
                    }}
                  >
                    Descargar plantilla
                  </button>
                </div>
                <fieldset>
                  {renderLocalSelect({
                    value: isLocalFixed ? fixedLocalId : inventoryImport.localId,
                    onChange: (value) => setInventoryImport({ ...inventoryImport, localId: value }),
                    disabled: isLocalFixed,
                    required: true,
                    emptyLabel: "Selecciona local para importar"
                  })}
                  <select
                    value={inventoryImport.mode}
                    onChange={(e) => setInventoryImport({ ...inventoryImport, mode: e.target.value })}
                  >
                    <option value="SET">Reemplazar stock</option>
                    <option value="INCREMENT">Sumar al stock</option>
                  </select>
                  <input
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        const bytes = new Uint8Array(reader.result || []);
                        let binary = "";
                        for (let i = 0; i < bytes.length; i++) {
                          binary += String.fromCharCode(bytes[i]);
                        }
                        const fileBase64 = btoa(binary);
                        setInventoryImport((prev) => ({
                          ...prev,
                          filename: file.name,
                          fileBase64
                        }));
                      };
                      reader.readAsArrayBuffer(file);
                    }}
                  />
                  {inventoryImport.filename && (
                    <div className="table-note">Archivo seleccionado: {inventoryImport.filename}</div>
                  )}
                  <div className="inline-actions">
                    <button type="button" onClick={handleInventoryImport}>
                      Importar
                    </button>
                  </div>
                </fieldset>
              </div>
            ) : (
              <div className="panel-note">
                <h3>Inventario (solo lectura)</h3>
                <p className="table-note">
                  Puedes ver el stock por local, pero no crear/editar/importar/exportar productos.
                </p>
              </div>
            )}
            </section>
          </Accordion>

          {canViewInventoryMovements && (
            <Accordion title="Kardex y movimientos">
              <section className="panel">
              <div>
                <h3>Kardex / Movimientos</h3>
                <div className="filter-grid">
                  {renderLocalSelect({
                    value: isLocalFixed ? fixedLocalId : movementFilters.localId,
                    onChange: (value) => setMovementFilters({ ...movementFilters, localId: value }),
                    disabled: isLocalFixed,
                    emptyLabel: "Todos los locales"
                  })}
                  <input
                    placeholder="Codigo de producto o servicio"
                    value={movementFilters.itemId}
                    onChange={(e) =>
                      setMovementFilters({ ...movementFilters, itemId: e.target.value })
                    }
                  />
                  <input
                    type="date"
                    value={movementFilters.from}
                    onChange={(e) =>
                      setMovementFilters({ ...movementFilters, from: e.target.value })
                    }
                  />
                  <input
                    type="date"
                    value={movementFilters.to}
                    onChange={(e) => setMovementFilters({ ...movementFilters, to: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      queryClient.invalidateQueries({ queryKey: ["inventoryMovements"] })
                    }
                  >
                    Filtrar movimientos
                  </button>
                </div>
                <Table
                  renderCell={renderTableValue}
                  columns={[
                    { key: "id", label: "ID" },
                    { key: "type", label: "Tipo" },
                    { key: "itemId", label: "Item" },
                    { key: "quantity", label: "Cantidad" },
                    { key: "reason", label: "Motivo" },
                    { key: "createdAt", label: "Fecha" }
                  ]}
                  rows={movementsQuery.data || []}
                  emptyFallback={[]}
                  emptyLabel=""
                />
              </div>
              </section>
            </Accordion>
          )}

          {canViewTransfers && (
            <Accordion title="Transferencias entre locales">
              <section className="panel">
              <div>
                <h3>Transferencias</h3>
                <div className="table table-scroll transfers-table">
                  <div className="table-row header sticky">
                    {transferColumns.map((col) => (
                      <div key={col.key} className="cell">
                        {col.label}
                      </div>
                    ))}
                  </div>
                  {transferGroups.map((row) => (
                    <div key={row.batchCode} className="table-row">
                      {transferColumns.map((col) => (
                        <div
                          key={col.key}
                          className={`cell ${col.key === "action" ? "action-cell" : ""}`}
                        >
                          {col.key === "action" ? (
                            <button
                              type="button"
                              onClick={() => {
                                const first = row._transfers?.[0];
                                if (!first) return;
                                const isBatch =
                                  row._transfers?.length > 1 || Boolean(first.batchCode);
                                if (isBatch) {
                                  downloadWithAuth(
                                    `/inventory/transfer/batch/${encodeURIComponent(
                                      row.batchCode
                                    )}/receipt.pdf`,
                                    `envio-${row.batchCode}.pdf`
                                  );
                                  return;
                                }
                                downloadWithAuth(
                                  `/inventory/transfer/${first.id}/receipt.pdf`,
                                  `transfer-${first.id}.pdf`
                                );
                              }}
                            >
                              Imprimir
                            </button>
                          ) : (
                            renderTableValue(row[col.key], col.key, row)
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                  {transferGroups.length === 0 && <div className="empty">Sin datos.</div>}
                </div>
              </div>
              <div className="panel-note">
                <h3>Envio por lote</h3>
                {lastTransferBatchCode && (
                  <div className="table-note">
                    Codigo de envio: <CodePill full={lastTransferBatchCode} /> (clic para copiar)
                  </div>
                )}
                <form className="form" onSubmit={handleTransferBatchInventory}>
                  <fieldset disabled={!canManageTransfers}>
                    <label>
                      Origen
                      {renderLocalSelect({
                        value: isLocalFixed ? fixedLocalId : transferBatchForm.fromLocalId,
                        onChange: (value) =>
                          setTransferBatchForm({ ...transferBatchForm, fromLocalId: value }),
                        disabled: isLocalFixed,
                        required: !isLocalFixed,
                        emptyLabel: "Selecciona local origen"
                      })}
                    </label>
                    <label>
                      Destino
                      {renderLocalSelect({
                        value: transferBatchForm.toLocalId,
                        onChange: (value) =>
                          setTransferBatchForm({ ...transferBatchForm, toLocalId: value }),
                        required: true,
                        emptyLabel: "Selecciona local destino"
                      })}
                    </label>
                    <div className="transfer-items">
                      {transferBatchItems.map((row, idx) => (
                        <div key={idx} className="transfer-item-row">
                          <input
                            placeholder="Codigo de producto (SKU)"
                            value={row.itemId}
                            onChange={(e) => {
                              const copy = [...transferBatchItems];
                              copy[idx].itemId = e.target.value;
                              setTransferBatchItems(copy);
                            }}
                            required={idx === 0}
                          />
                          <input
                            type="number"
                            min="1"
                            step="1"
                            placeholder="Cant."
                            value={row.quantity}
                            onChange={(e) => {
                              const copy = [...transferBatchItems];
                              copy[idx].quantity = e.target.value;
                              setTransferBatchItems(copy);
                            }}
                            required={idx === 0}
                          />
                          <button
                            type="button"
                            className="ghost"
                            onClick={() =>
                              setTransferBatchItems((prev) =>
                                prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)
                              )
                            }
                            disabled={transferBatchItems.length <= 1}
                          >
                            Quitar
                          </button>
                        </div>
                      ))}
                    </div>
                    <input
                      placeholder="Nota (opcional)"
                      value={transferBatchForm.note}
                      onChange={(e) =>
                        setTransferBatchForm({ ...transferBatchForm, note: e.target.value })
                      }
                    />
                    <div className="inline-actions">
                      <button
                        type="button"
                        onClick={() =>
                          setTransferBatchItems((prev) => [
                            ...prev,
                            { itemId: "", quantity: "1" }
                          ])
                        }
                      >
                        Agregar producto
                      </button>
                      <button type="submit">Generar envio</button>
                    </div>
                  </fieldset>
                </form>

                <h4>Recibir envio</h4>
                <form className="form" onSubmit={handleReceiveTransferBatch}>
                  <fieldset disabled={!canManageTransfers}>
                    <input
                      placeholder="Codigo de envio"
                      value={receiveBatchForm.batchCode}
                      onChange={(e) =>
                        setReceiveBatchForm({ ...receiveBatchForm, batchCode: e.target.value })
                      }
                      required
                    />
                    <div className="table-note">
                      Usa el codigo de envio de 8 digitos para recibir el lote completo.
                    </div>
                    <input
                      placeholder="Nota (opcional)"
                      value={receiveBatchForm.note}
                      onChange={(e) =>
                        setReceiveBatchForm({ ...receiveBatchForm, note: e.target.value })
                      }
                    />
                    <button type="submit">Recibir</button>
                  </fieldset>
                </form>
                {receiveBatchPreview?.mode === "batch" && (
                  <div className="receive-preview">
                    <div className="table-note">
                      Productos del envio: {receiveBatchPreview.totalCount} · Pendientes:{" "}
                      {receiveBatchPreview.pendingCount}
                    </div>
                    <Table
                      renderCell={renderTableValue}
                      columns={[
                        { key: "sku", label: "Codigo" },
                        { key: "item", label: "Producto" },
                        { key: "quantity", label: "Cantidad" },
                        { key: "status", label: "Estado" }
                      ]}
                      rows={receiveBatchPreview.rows}
                      emptyFallback={[]}
                      emptyLabel=""
                    />
                  </div>
                )}
                {receiveBatchPreview?.mode === "transfer-code" &&
                  Boolean(receiveBatchPreview.suggestedBatch) && (
                    <div className="section-banner warn-banner">
                      Ese codigo pertenece a una transferencia interna. Usa el codigo de envio{" "}
                      <strong>{receiveBatchPreview.suggestedBatch}</strong>.
                    </div>
                  )}
                {receiveBatchPreview?.mode === "not-found" && (
                  <div className="table-note">
                    No se encontro un envio con ese codigo en la lista actual.
                  </div>
                )}
                {!canManageTransfers && (
                  <div className="table-note">
                    Solo lectura: no puedes enviar ni recibir.
                  </div>
                )}
              </div>
              </section>
            </Accordion>
          )}
        </div>
      )}

      {section === "clients" && (
        <div className="accordion-stack">
          <Accordion title="Registro y busqueda" defaultOpen>
            <section className="panel">
              <div>
                <h3>Registrar cliente</h3>
                <form className="form" onSubmit={handleCreateClient}>
                  <fieldset>
                    <label>
                      Documento (DNI/RUC)
                      <input
                        value={clientForm.documentId}
                        maxLength={11}
                        placeholder="DNI (8) o RUC (11)"
                        onChange={(e) =>
                          {
                            setClientLookupState({ loading: false, source: "", message: "" });
                            setClientForm({
                              ...clientForm,
                              documentId: normalizeDocumentId(e.target.value)
                            });
                          }
                        }
                      />
                    </label>
                    <div className="table-note">
                      {clientDocumentType
                        ? `Tipo detectado: ${clientDocumentType}`
                        : "Ingresa 8 digitos (DNI) o 11 digitos (RUC)."}
                    </div>
                    <div className="inline-actions">
                      <button
                        type="button"
                        onClick={handleLookupClientByDocument}
                        disabled={clientLookupState.loading}
                      >
                        {clientLookupState.loading ? "Consultando..." : "Autocompletar"}
                      </button>
                    </div>
                    {clientLookupState.message && (
                      <div className="table-note">{clientLookupState.message}</div>
                    )}
                    <label>
                      Nombre / Razon social
                      <input
                        value={clientForm.fullName}
                        onChange={(e) =>
                          setClientForm({ ...clientForm, fullName: e.target.value })
                        }
                        required
                      />
                    </label>
                    <label>
                      Telefono
                      <input
                        value={clientForm.phone}
                        onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
                      />
                    </label>
                    <label>
                      Local
                      {renderLocalSelect({
                        value: isLocalFixed ? fixedLocalId : clientForm.localId,
                        onChange: (value) => setClientForm({ ...clientForm, localId: value }),
                        disabled: isLocalFixed,
                        required: !isAdmin && !isAuditor,
                        emptyLabel: "Selecciona local"
                      })}
                    </label>
                    <button type="submit">Guardar cliente</button>
                  </fieldset>
                </form>

                <h4>Buscar cliente</h4>
                <input
                  placeholder="Busca por nombre, DNI, RUC o telefono"
                  value={clientQuery}
                  onChange={(e) => setClientQuery(e.target.value)}
                />
                <Table
                  renderCell={(value, key, row) => {
                    if (key === "action") {
                      return (
                        <button
                          type="button"
                          onClick={() => {
                            setClientHistoryId(row.id);
                          }}
                        >
                          Seleccionar
                        </button>
                      );
                    }
                    return renderTableValue(value, key, row);
                  }}
                  columns={[
                    { key: "fullName", label: "Cliente" },
                    { key: "documentId", label: "Documento" },
                    { key: "phone", label: "Telefono" },
                    { key: "action", label: "Acciones" }
                  ]}
                  rows={clientsSearchQuery.data || []}
                  emptyFallback={[]}
                  emptyLabel=""
                />
              </div>
              <div className="panel-note">
                <h3>Cuenta y lineas</h3>
                <p>
                  Este apartado se oculto temporalmente mientras se confirma el flujo de lineas y
                  pagos/deudas con BiPay.
                </p>
              </div>
            </section>
          </Accordion>

          <Accordion title="Historial de ventas">
            <section className="panel">
              <div>
                <h3>Ventas del cliente</h3>
                <Table
                  renderCell={renderTableValue}
                  columns={[
                    { key: "id", label: "Venta" },
                    { key: "total", label: "Total" },
                    { key: "createdAt", label: "Fecha" }
                  ]}
                  rows={clientHistoryQuery.data || []}
                  emptyFallback={[]}
                  emptyLabel=""
                />
              </div>
              <div className="panel-note">
                <h3>Tip operativo</h3>
                <p>
                  Al completar DNI/RUC se autocompleta desde base local y, si configuras token, desde
                  RENIEC/SUNAT.
                </p>
              </div>
            </section>
          </Accordion>
        </div>
      )}

      {section === "reports" && (
        <div className="accordion-stack">
          <Accordion title="Filtros y busqueda" defaultOpen>
            <section className="panel">
              <div>
                <h3>Filtros</h3>
                <div className="filter-grid">
                  {renderLocalSelect({
                    value: isLocalFixed ? fixedLocalId : reportsFilters.localId,
                    onChange: (value) => setReportsFilters({ ...reportsFilters, localId: value }),
                    disabled: isLocalFixed,
                    emptyLabel: "Todos los locales"
                  })}
                  <input
                    type="date"
                    value={reportsFilters.from}
                    onChange={(e) => setReportsFilters({ ...reportsFilters, from: e.target.value })}
                  />
                  <input
                    type="date"
                    value={reportsFilters.to}
                    onChange={(e) => setReportsFilters({ ...reportsFilters, to: e.target.value })}
                  />
                </div>
                <div className="inline-actions">
                  <button
                    type="button"
                    onClick={() => {
                      queryClient.invalidateQueries({ queryKey: ["reportKpis"] });
                      queryClient.invalidateQueries({ queryKey: ["reportTopProducts"] });
                      queryClient.invalidateQueries({ queryKey: ["reportSalesByCategory"] });
                      queryClient.invalidateQueries({ queryKey: ["reportSalesByLocal"] });
                      queryClient.invalidateQueries({ queryKey: ["reportCashClosures"] });
                      queryClient.invalidateQueries({ queryKey: ["reportLowStock"] });
                      queryClient.invalidateQueries({ queryKey: ["reportMovements"] });
                      queryClient.invalidateQueries({ queryKey: ["reportKardexValued"] });
                      queryClient.invalidateQueries({ queryKey: ["globalSearch"] });
                    }}
                  >
                    Refrescar
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setReportsFilters({
                        localId: isLocalFixed ? fixedLocalId : "",
                        from: "",
                        to: ""
                      })
                    }
                  >
                    Limpiar filtros
                  </button>
                  {isAdmin && (
                    <button type="button" onClick={downloadBackup}>
                      Descargar backup
                    </button>
                  )}
                </div>
              </div>
              <div className="panel-note">
                <h3>Busqueda global</h3>
                <input
                  placeholder="Buscar inventario, clientes, ventas, cajas..."
                  value={globalSearchTerm}
                  onChange={(e) => setGlobalSearchTerm(e.target.value)}
                />
                {globalSearchQuery.isFetching && (
                  <div className="table-note">Buscando resultados...</div>
                )}
                {globalSearchQuery.isError && (
                  <div className="error">
                    {extractErrorMessage(
                      globalSearchQuery.error,
                      "No se pudo completar la busqueda global."
                    )}
                  </div>
                )}
                {globalSearchQuery.data && (
                  <>
                    <div className="table-note">
                      Resultados: Inventario {globalSearchQuery.data.inventory?.length ?? 0} ·
                      Clientes {globalSearchQuery.data.clients?.length ?? 0} · Ventas{" "}
                      {globalSearchQuery.data.sales?.length ?? 0} · Cajas{" "}
                      {globalSearchQuery.data.cash?.length ?? 0}
                    </div>
                    <Table
                      renderCell={renderTableValue}
                      columns={[
                        { key: "sku", label: "Codigo" },
                        { key: "name", label: "Producto" },
                        { key: "quantity", label: "Stock" }
                      ]}
                      rows={globalSearchQuery.data.inventory || []}
                      emptyFallback={[]}
                      emptyLabel=""
                    />
                    <Table
                      renderCell={renderTableValue}
                      columns={[
                        { key: "id", label: "ID" },
                        { key: "fullName", label: "Cliente" },
                        { key: "phone", label: "Telefono" }
                      ]}
                      rows={globalSearchQuery.data.clients || []}
                      emptyFallback={[]}
                      emptyLabel=""
                    />
                    <Table
                      renderCell={renderTableValue}
                      columns={[
                        { key: "id", label: "Venta" },
                        { key: "receiptNumber", label: "Comprobante" },
                        { key: "total", label: "Total" }
                      ]}
                      rows={globalSearchQuery.data.sales || []}
                      emptyFallback={[]}
                      emptyLabel=""
                    />
                    <Table
                      renderCell={renderTableValue}
                      columns={[
                        { key: "id", label: "Caja" },
                        { key: "status", label: "Estado" },
                        { key: "openingAmount", label: "Apertura" },
                        { key: "closingAmount", label: "Cierre" }
                      ]}
                      rows={globalSearchQuery.data.cash || []}
                      emptyFallback={[]}
                      emptyLabel=""
                    />
                  </>
                )}
              </div>
            </section>
          </Accordion>

          {canViewAudit && (
            <Accordion
              title="Auditoria (filtros)"
              defaultOpen={auditOpen}
              onToggle={setAuditOpen}
            >
              <section className="panel">
                <div>
                  <h3>Auditoria</h3>
                  <form className="form grid-form" onSubmit={(e) => e.preventDefault()}>
                    {renderLocalSelect({
                      value: isLocalFixed ? fixedLocalId : auditFilters.localId,
                      onChange: (value) => setAuditFilters({ ...auditFilters, localId: value }),
                      disabled: isLocalFixed,
                      emptyLabel: "Todos los locales"
                    })}
                    <input
                      placeholder="Usuario (nombre o ID)"
                      value={auditFilters.user}
                      onChange={(e) =>
                        setAuditFilters({ ...auditFilters, user: e.target.value })
                      }
                    />
                    <input
                      placeholder="Accion (opcional)"
                      value={auditFilters.action}
                      onChange={(e) =>
                        setAuditFilters({ ...auditFilters, action: e.target.value })
                      }
                    />
                    <input
                      placeholder="Entidad (opcional)"
                      value={auditFilters.entity || ""}
                      onChange={(e) =>
                        setAuditFilters({ ...auditFilters, entity: e.target.value })
                      }
                    />
                    <input
                      type="date"
                      value={auditFilters.from}
                      onChange={(e) =>
                        setAuditFilters({ ...auditFilters, from: e.target.value })
                      }
                    />
                    <input
                      type="date"
                      value={auditFilters.to}
                      onChange={(e) => setAuditFilters({ ...auditFilters, to: e.target.value })}
                    />
                    <div className="inline-actions">
                      <button
                        type="button"
                        onClick={() => queryClient.invalidateQueries({ queryKey: ["activity"] })}
                      >
                        Filtrar
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setAuditFilters({
                            localId: "",
                            user: "",
                            action: "",
                            entity: "",
                            from: "",
                            to: ""
                          })
                        }
                      >
                        Limpiar
                      </button>
                    </div>
                  </form>
                  <Table
                    renderCell={renderTableValue}
                    columns={[
                      { key: "id", label: "Codigo" },
                      { key: "action", label: "Accion" },
                      { key: "userId", label: "Usuario" },
                      { key: "localId", label: "Local" },
                      { key: "createdAt", label: "Fecha" }
                    ]}
                    rows={activityQuery.data || []}
                    emptyFallback={[]}
                    emptyLabel=""
                  />
                </div>
                <div className="panel-note">
                  <h3>Detalle</h3>
                  <p>Los registros incluyen before/after en el backend.</p>
                </div>
              </section>
            </Accordion>
          )}

          <Accordion title="KPIs y ranking">
            <section className="panel">
              <div>
                <h3>KPIs</h3>
                <p className="table-note">
                  KPIs son indicadores clave para medir rendimiento: ventas, ticket promedio,
                  cantidad de items y margen.
                </p>
                <Table
                  renderCell={renderTableValue}
                  columns={[
                    { key: "salesCount", label: "Ventas" },
                    { key: "totalSales", label: "Total" },
                    { key: "avgTicket", label: "Ticket prom." },
                    { key: "itemsCount", label: "Items" },
                    { key: "avgItems", label: "Items prom." },
                    { key: "margin", label: "Margen" },
                    { key: "avgMargin", label: "Margen prom." }
                  ]}
                  rows={reportsKpisQuery.data ? [reportsKpisQuery.data] : []}
                  emptyFallback={[]}
                  emptyLabel=""
                />
                {reportsKpisQuery.data?.totalsByMethod && (
                  <Table
                    renderCell={renderTableValue}
                    columns={[
                      { key: "method", label: "Metodo" },
                      { key: "total", label: "Total" }
                    ]}
                    rows={Object.entries(reportsKpisQuery.data.totalsByMethod).map(([k, v]) => ({
                      id: k,
                      method: k,
                      total: v
                    }))}
                    emptyFallback={[]}
                    emptyLabel=""
                  />
                )}
              </div>
              <div className="panel-note">
                <h3>Top productos</h3>
                <Table
                  renderCell={renderTableValue}
                  columns={[
                    { key: "sku", label: "Codigo" },
                    { key: "name", label: "Producto" },
                    { key: "quantity", label: "Cantidad" },
                    { key: "total", label: "Total" },
                    { key: "margin", label: "Margen" }
                  ]}
                  rows={reportsTopProductsQuery.data || []}
                  emptyFallback={[]}
                  emptyLabel=""
                />
                <h4>Por categoria</h4>
                <Table
                  renderCell={renderTableValue}
                  columns={[
                    { key: "category", label: "Categoria" },
                    { key: "quantity", label: "Cantidad" },
                    { key: "total", label: "Total" },
                    { key: "margin", label: "Margen" }
                  ]}
                  rows={reportsSalesByCategoryQuery.data || []}
                  emptyFallback={[]}
                  emptyLabel=""
                />
                <h4>Top locales por ventas</h4>
                {isAdmin ? (
                  <Table
                    renderCell={renderTableValue}
                    columns={[
                      { key: "localId", label: "Local" },
                      { key: "total", label: "Total" },
                      { key: "salesCount", label: "Ventas" }
                    ]}
                    rows={topLocalsBySales}
                    emptyFallback={[]}
                    emptyLabel=""
                  />
                ) : (
                  <div className="table-note">Disponible para administrador.</div>
                )}
              </div>
            </section>
          </Accordion>

          {canViewAudit && (
            <Accordion title="Historial de actividades">
              <section className="panel">
              <div>
                <h3>Actividad de locales</h3>
                <Table
                  renderCell={renderTableValue}
                  columns={[
                    { key: "action", label: "Accion" },
                    { key: "userId", label: "Usuario" },
                    { key: "localId", label: "Local" },
                    { key: "createdAt", label: "Fecha" }
                  ]}
                  rows={activityTimelineQuery.data || []}
                  emptyFallback={[]}
                  emptyLabel=""
                />
                <div className="inline-actions">
                  <button
                    type="button"
                    onClick={() => queryClient.invalidateQueries({ queryKey: ["activityTimeline"] })}
                  >
                    Refrescar
                  </button>
                </div>
              </div>
              <div className="panel-note">
                <h3>Resumen</h3>
                <p>
                  Incluye aperturas y cierres de caja, ventas y movimientos de inventario.
                </p>
              </div>
              </section>
            </Accordion>
          )}

          <Accordion title="Cierres de caja">
            <section className="panel">
            <div>
              <h3>Cierres de caja</h3>
              <Table
                renderCell={renderTableValue}
                columns={[
                  { key: "localId", label: "Local" },
                  { key: "count", label: "Cierres" },
                  { key: "total", label: "Total" },
                  { key: "difference", label: "Diferencia" }
                ]}
                rows={reportsCashClosures.data?.byLocal || []}
                emptyFallback={[]}
                emptyLabel=""
              />
            </div>
            <div className="panel-note">
              <h3>Resumen</h3>
              <p>Total cierres: {reportsCashClosures.data?.totals?.count ?? 0}</p>
              <p>
                Total cierre: S/ {Number(reportsCashClosures.data?.totals?.total ?? 0).toFixed(2)}
              </p>
              <p>
                Diferencia: S/ {Number(reportsCashClosures.data?.totals?.difference ?? 0).toFixed(2)}
              </p>
              {canExportReports && (
                <button
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams(cleanFilters(reportsFilters));
                    const qs = params.toString();
                    downloadWithAuth(
                      `/reports/cash/closures.xlsx${qs ? `?${qs}` : ""}`,
                      "cierres-caja.xlsx"
                    );
                  }}
                >
                  Exportar Excel
                </button>
              )}
            </div>
            </section>
          </Accordion>

          <Accordion title="Stock y movimientos">
            <section className="panel">
            <div>
              <h3>Stock bajo</h3>
              <Table
                renderCell={renderTableValue}
                columns={[
                  { key: "sku", label: "Codigo" },
                  { key: "name", label: "Producto" },
                  { key: "quantity", label: "Stock" },
                  { key: "localId", label: "Local" }
                ]}
                rows={reportsLowStock.data || []}
                emptyFallback={[]}
                emptyLabel=""
              />
            </div>
            <div className="panel-note">
              <h3>Movimientos</h3>
              <Table
                renderCell={renderTableValue}
                columns={[
                  { key: "type", label: "Tipo" },
                  { key: "itemId", label: "Producto" },
                  { key: "quantity", label: "Cantidad" },
                  { key: "createdAt", label: "Fecha" }
                ]}
                rows={reportsKardexValuedQuery.data || []}
                emptyFallback={[]}
                emptyLabel=""
              />
              <Table
                renderCell={renderTableValue}
                columns={[
                  { key: "id", label: "Codigo" },
                  { key: "type", label: "Tipo" },
                  { key: "itemId", label: "Producto" },
                  { key: "quantity", label: "Cantidad" },
                  { key: "reason", label: "Motivo" },
                  { key: "createdAt", label: "Fecha" }
                ]}
                rows={reportsMovements.data || []}
                emptyFallback={[]}
                emptyLabel=""
              />
              {canExportReports && (
                <div className="inline-actions">
                  <button
                    type="button"
                    onClick={() => {
                      const params = new URLSearchParams(
                        cleanFilters({ localId: reportsFilters.localId || undefined })
                      );
                      const qs = params.toString();
                      downloadWithAuth(
                        `/reports/inventory/low-stock.xlsx${qs ? `?${qs}` : ""}`,
                        "stock-bajo.xlsx"
                      );
                    }}
                  >
                    Stock bajo (Excel)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const params = new URLSearchParams(cleanFilters(reportsFilters));
                      const qs = params.toString();
                      downloadWithAuth(
                        `/reports/inventory/movements.xlsx${qs ? `?${qs}` : ""}`,
                        "movimientos.xlsx"
                      );
                    }}
                  >
                    Movimientos (Excel)
                  </button>
                </div>
              )}
            </div>
            </section>
          </Accordion>
        </div>
      )}

      {section === "admin" && (
        <section className="panel">
          <div>
            <h3>Administracion</h3>
            <p>Este modulo esta listo para gestion de usuarios y permisos finos.</p>
          </div>
          <div className="panel-note">
            <h3>Control total</h3>
            <p>Admin y auditor pueden forzar cierres; solo admin revisa auditoria completa.</p>
            {isAdmin && (
              <>
                <h4>Reiniciar demo</h4>
                <p>
                  Borra datos operativos (inventario, ventas, caja, transferencias, kardex y auditoria).
                  No toca usuarios ni locales.
                </p>
                <button type="button" onClick={handleResetDemo}>
                  Borrar datos de demo
                </button>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function Accordion({ title, children, defaultOpen = false, onToggle }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`accordion ${open ? "open" : ""}`}>
      <button
        type="button"
        className="accordion-trigger"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (onToggle) onToggle(next);
        }}
      >
        <span>{title}</span>
        <span className="accordion-icon">{">"}</span>
      </button>
      {open && <div className="accordion-body">{children}</div>}
    </div>
  );
}

function Table({ columns, rows, emptyFallback, emptyLabel, renderCell }) {
  const hasRows = Array.isArray(rows) && rows.length > 0;
  const fallbackRows = Array.isArray(emptyFallback) ? emptyFallback : [];
  const showingFallback = !hasRows && fallbackRows.length > 0;
  const displayRows = hasRows ? rows : fallbackRows;
  const normalizedColumns = columns.map((col) =>
    typeof col === "string" ? { key: col, label: col } : col
  );
  const columnCount = Math.max(normalizedColumns.length, 1);
  const minCellWidth = 132;
  const rowStyle = {
    gridTemplateColumns: `repeat(${columnCount}, minmax(${minCellWidth}px, 1fr))`,
    minWidth: `${columnCount * minCellWidth}px`
  };

  if (!displayRows || displayRows.length === 0) {
    return <div className="empty">Sin datos.</div>;
  }
  return (
    <div className="table-wrapper">
      {showingFallback && (
        <div className="table-note">{emptyLabel || "Ejemplos de referencia."}</div>
      )}
      <div className="table-scroll-x">
      <div className="table">
        <div className="table-row header" style={rowStyle}>
          {normalizedColumns.map((col) => (
            <div key={`header-${col.key}`} className="cell">
              {col.label}
            </div>
          ))}
        </div>
        {displayRows.map((row, index) => (
          <div key={row?.id ? `${row.id}-${index}` : index} className="table-row" style={rowStyle}>
            {normalizedColumns.map((col) => (
              <div key={col.key} className="cell">
                {renderCell ? renderCell(row[col.key], col.key, row) : renderValue(row[col.key])}
              </div>
            ))}
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}

function renderValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    return VALUE_LABELS[value] || value;
  }
  if (typeof value === "object") {
    if (Array.isArray(value)) return value.length;
    return JSON.stringify(value);
  }
  if (typeof value === "number") return value.toFixed ? value.toFixed(2) : value;
  return String(value);
}
