/* ============================================================
   Wallet Tracker v2 — API Client
   Handles auth headers, token refresh, error handling.
   ============================================================ */

// Set this to your deployed Railway/Render URL in production
const API_BASE = window.WT_API_URL || 'http://localhost:3001';

// ── Request helper ────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const idToken      = await getFirebaseIdToken();
  const sheetsToken  = window._sheetsAccessToken || '';
  const sheetId      = getUserSheetId();

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${idToken}`,
    ...(sheetsToken ? { 'X-Sheets-Token': sheetsToken } : {}),
    ...(sheetId     ? { 'X-Sheet-Id':     sheetId }     : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error || `HTTP ${res.status}`, res.status);
  }

  return res.json();
}

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// ── Firebase ID token (auto-refreshed by SDK) ─────────────────────
async function getFirebaseIdToken() {
  const user = firebase.auth().currentUser;
  if (!user) throw new ApiError('Not signed in', 401);
  return user.getIdToken();
}

function getUserSheetId() {
  return localStorage.getItem('wt_sheetId') || '';
}

// ── Users ─────────────────────────────────────────────────────────
const Users = {
  me()              { return apiFetch('/api/users/me'); },
  update(data)      { return apiFetch('/api/users/me', { method: 'PATCH', body: JSON.stringify(data) }); },
};

// ── Transactions ──────────────────────────────────────────────────
const Transactions = {
  list()            { return apiFetch('/api/transactions'); },
  create(txn)       { return apiFetch('/api/transactions', { method: 'POST',   body: JSON.stringify(txn) }); },
  update(ri, txn)   { return apiFetch(`/api/transactions/${ri}`, { method: 'PUT',    body: JSON.stringify(txn) }); },
  delete(ri)        { return apiFetch(`/api/transactions/${ri}`, { method: 'DELETE' }); },
};

// ── Sheets ────────────────────────────────────────────────────────
const Sheets = {
  setup(spreadsheetId) {
    return apiFetch('/api/sheets/setup', { method: 'POST', body: JSON.stringify({ spreadsheetId }) });
  },
  getId()               { return apiFetch('/api/sheets/id'); },
  setId(spreadsheetId)  { return apiFetch('/api/sheets/id', { method: 'PATCH', body: JSON.stringify({ spreadsheetId }) }); },
};

// ── OCR ───────────────────────────────────────────────────────────
const OCR = {
  scanReceipt(base64Image, mediaType = 'image/jpeg') {
    return apiFetch('/api/ocr/receipt', {
      method: 'POST',
      body: JSON.stringify({ image: base64Image, mediaType }),
    });
  },
};

window.API = { Users, Transactions, Sheets, OCR, ApiError };
