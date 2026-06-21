/* ============================================================
   Wallet Tracker v2 — Frontend App Logic
   Calls backend API instead of Google Sheets directly.
   Key changes from v1:
   - API.Transactions.* replaces direct sheetsAPI() calls
   - OCR goes through API.OCR.scanReceipt() (server-side key)
   - User settings synced via API.Users.update()
   - Sheets OAuth token still obtained client-side, passed as header
   ============================================================ */

// ── Firebase init ─────────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyDWDCbThFKiTVO5w2Z8XnmHsRvAEmhhBFk',
  authDomain:        'wallet-tracker-v2-7e96c.firebaseapp.com',
  projectId:         'wallet-tracker-v2-7e96c',
  storageBucket:     'wallet-tracker-v2-7e96c.firebasestorage.app',
  messagingSenderId: '596324697631',
  appId:             '1:596324697631:web:3317a4667a3d338c02772a',
};

firebase.initializeApp(FIREBASE_CONFIG);
const firebaseAuth   = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();

firebaseAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});

// ── Categories ────────────────────────────────────────────────────
const CATEGORIES = [
  { name: 'Food & Dining',    emoji: '🍜', color: '#f97316' },
  { name: 'Groceries',        emoji: '🛒', color: '#22c55e' },
  { name: 'Transport',        emoji: '🚗', color: '#3b82f6' },
  { name: 'Health',           emoji: '💊', color: '#ef4444' },
  { name: 'Shopping',         emoji: '👕', color: '#a855f7' },
  { name: 'Entertainment',    emoji: '🎮', color: '#ec4899' },
  { name: 'Home & Utilities', emoji: '🏠', color: '#14b8a6' },
  { name: 'Tech',             emoji: '📱', color: '#6366f1' },
  { name: 'Education',        emoji: '📚', color: '#eab308' },
  { name: 'Others',           emoji: '💰', color: '#94a3b8' },
];

const MONTH_NAMES = [
  'Januari','Februari','Maret','April','Mei','Juni',
  'Juli','Agustus','September','Oktober','November','Desember'
];

const KEYWORD_MAP = {
  'Food & Dining': [
    'makan','mie','nasi','ayam','bakso','sate','soto','rendang','gado','pecel',
    'warteg','restoran','resto','cafe','kopi','coffee','starbucks','mcd','mcdonald',
    'kfc','burger','pizza','roti','es teh','es jeruk','jus','boba','chatime',
    'janji jiwa','kenangan','fore','tuku','latte','cappuccino','americano',
    'indomie','gorengan','martabak','siomay','batagor','pempek','geprek',
    'lalapan','padang','sushi','ramen','dim sum','shabu','hotpot',
    'makan siang','makan malam','sarapan','breakfast','lunch','dinner',
    'snack','jajan','cemilan','dessert','kue','donat','nasi goreng',
    'nasi padang','nasi uduk','bubur','sop','ikan','seafood','bebek',
    'tahu','tempe','mie ayam','mie goreng','ricebowl','rice bowl','food',
  ],
  'Groceries': [
    'indomaret','alfamart','alfamidi','supermarket','superindo','hypermart',
    'giant','lottemart','carrefour','ranch market','hero',
    'beras','telur','minyak goreng','gula','garam','sayur','buah','daging',
    'susu','roti tawar','sabun','sampo','shampoo','tissue','odol','pasta gigi',
    'detergen','deterjen','grocery','belanja bulanan','sembako','tepung',
  ],
  'Transport': [
    'grab','gojek','gocar','goride','grabcar','grabbike','uber','taxi','taksi',
    'bensin','pertamax','pertalite','solar','shell','pertamina',
    'tol','parkir','toll','angkot','bus','transjakarta','busway',
    'mrt','lrt','krl','commuter','kereta','train','ojek','ojol',
    'pesawat','flight','tiket pesawat','travel','shuttle','damri',
  ],
  'Health': [
    'obat','apotek','apotik','farmasi','pharmacy','dokter','doctor',
    'klinik','clinic','rumah sakit','rs','hospital','vitamin','supplement',
    'lab','laboratorium','check up','vaksin','vaccine','gigi','dentist',
    'optik','terapi','bpjs','asuransi kesehatan','paracetamol','ibuprofen',
  ],
  'Shopping': [
    'baju','celana','sepatu','sandal','tas','jaket','hoodie','kaos',
    'kemeja','dress','rok','jeans','sneakers','uniqlo','h&m','zara',
    'shopee','tokopedia','lazada','blibli','tiktok shop','fashion',
    'skincare','makeup','kosmetik','serum','toner','moisturizer','parfum',
    'dompet','wallet','kado','hadiah','mall','outlet',
  ],
  'Entertainment': [
    'netflix','spotify','disney','youtube premium','hbo','prime video',
    'bioskop','cinema','xxi','cgv','game','steam','playstation',
    'mobile legend','ml','pubg','free fire','genshin','valorant',
    'karaoke','bowling','arcade','nonton','film','movie','hotel','resort',
    'airbnb','traveloka','tiket.com','agoda','liburan','gym','fitness',
  ],
  'Home & Utilities': [
    'listrik','pln','token listrik','pdam','air','wifi','internet',
    'indihome','biznet','firstmedia','telkom','gas','lpg','elpiji',
    'sewa','kost','kos','kontrakan','apartment','apartemen','laundry',
    'renovasi','furniture','ikea','informa','kompor','kulkas','ac',
  ],
  'Tech': [
    'laptop','komputer','pc','macbook','handphone','hp','smartphone','iphone',
    'samsung','xiaomi','oppo','gadget','charger','earphone','headphone',
    'earbuds','airpods','speaker','mouse','keyboard','monitor','ssd',
    'power bank','tablet','ipad','smartwatch','router','kamera','pulsa','kuota',
  ],
  'Education': [
    'kursus','course','les','private','bimbel','buku','book','ebook',
    'udemy','coursera','ruangguru','seminar','webinar','workshop','training',
    'bootcamp','sertifikasi','ujian','sekolah','kuliah','spp','print',
  ],
};

function categorize(desc) {
  const input = desc.toLowerCase().trim();
  let best = null, bestLen = 0;
  for (const [cat, kws] of Object.entries(KEYWORD_MAP)) {
    for (const kw of kws) {
      if (input.includes(kw) && kw.length > bestLen) { best = cat; bestLen = kw.length; }
    }
  }
  return best || 'Others';
}

// ── Config ────────────────────────────────────────────────────────
const DEFAULT_CLIENT_ID = '28127353414-1blu9of4f3c5pqeo4ssv7ftbu8ag7li2.apps.googleusercontent.com';

const Config = {
  get(k)         { return localStorage.getItem('wt_' + k) || ''; },
  set(k, v)      { localStorage.setItem('wt_' + k, v); },
  get sheetId()  { return this.get('sheetId'); },
  get clientId() { return this.get('clientId') || DEFAULT_CLIENT_ID; },
};

// ── Budget ────────────────────────────────────────────────────────
const Budget = {
  getAll()     { try { return JSON.parse(localStorage.getItem('wt_budgets') || '{}'); } catch { return {}; } },
  get(cat)     { return parseInt(this.getAll()[cat] || '0', 10); },
  saveAll(obj) { localStorage.setItem('wt_budgets', JSON.stringify(obj)); },
};

// ── Offline Queue ─────────────────────────────────────────────────
const Queue = {
  getAll()   { try { return JSON.parse(localStorage.getItem('wt_queue') || '[]'); } catch { return []; } },
  add(item)  { const q = this.getAll(); q.push({ ...item, _qid: Date.now() }); localStorage.setItem('wt_queue', JSON.stringify(q)); updateQueueUI(); },
  remove(qid){ const q = this.getAll().filter(i => i._qid !== qid); localStorage.setItem('wt_queue', JSON.stringify(q)); updateQueueUI(); },
  count()    { return this.getAll().length; },
};

// ── Pattern / Suggestion Engine ───────────────────────────────────
const Patterns = {
  _key: 'wt_patterns',
  getAll() { try { return JSON.parse(localStorage.getItem(this._key) || '{}'); } catch { return {}; } },
  saveAll(p) { localStorage.setItem(this._key, JSON.stringify(p)); },
  normalize(desc) { return desc.toLowerCase().replace(/[0-9]/g, '').replace(/\s+/g, ' ').trim(); },
  record(desc, amount, category) {
    const key = this.normalize(desc);
    if (!key) return;
    const all = this.getAll();
    if (!all[key]) all[key] = { amounts: [], category };
    all[key].amounts.push(amount);
    if (all[key].amounts.length > 20) all[key].amounts = all[key].amounts.slice(-20);
    all[key].category = category;
    this.saveAll(all);
  },
  suggest(desc) {
    if (!desc || desc.length < 3) return null;
    const key = this.normalize(desc);
    const all = this.getAll();
    if (all[key] && all[key].amounts.length >= 3) return this._build(key, all[key]);
    const inputWords = key.split(' ').filter(w => w.length > 2);
    if (!inputWords.length) return null;
    let bestMatch = null, bestScore = 0;
    for (const [pk, pv] of Object.entries(all)) {
      if (pv.amounts.length < 3) continue;
      const pkWords = pk.split(' ').filter(w => w.length > 2);
      const overlap = inputWords.filter(w => pkWords.some(pw => pw.includes(w) || w.includes(pw))).length;
      const score   = overlap / Math.max(inputWords.length, pkWords.length);
      if (score >= 0.5 && score > bestScore) { bestScore = score; bestMatch = { key: pk, ...pv }; }
    }
    return bestMatch ? this._build(bestMatch.key, bestMatch) : null;
  },
  _build(key, data) {
    const freq = {};
    data.amounts.forEach(a => { freq[a] = (freq[a] || 0) + 1; });
    const modeAmount = parseInt(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0], 10);
    return { suggestedAmount: modeAmount, count: data.amounts.length, category: data.category };
  },
};

// ── Templates ─────────────────────────────────────────────────────
const Templates = {
  getAll()   { try { return JSON.parse(localStorage.getItem('wt_templates') || '[]'); } catch { return []; } },
  saveAll(t) { localStorage.setItem('wt_templates', JSON.stringify(t)); },
  add(t)     { const all = this.getAll(); all.unshift(t); if (all.length > 20) all.pop(); this.saveAll(all); },
  remove(i)  { const all = this.getAll(); all.splice(i, 1); this.saveAll(all); },
};

// ── State ─────────────────────────────────────────────────────────
let currentUser        = null;
let allTransactions    = [];
let recentItems        = [];
let dashboardMonth     = new Date();
let pieChart           = null;
let barChart           = null;
let editTarget         = null;
let deleteTarget       = null;
let useCustomDate      = false;
let activeFilterCat    = 'all';
let activeSort         = 'date-desc';
let isOnline           = navigator.onLine;
let currentSuggestion  = null;
let pendingReceiptB64  = null;
let pendingReceiptMime = 'image/jpeg';

// Sheets OAuth (client-side — same as v1)
let sheetsTokenClient  = null;
let sheetsTokenExpiry  = 0;
let sheetsTokenPending = false;
let sheetsTokenWaiters = [];

// ── Init ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const savedDark = Config.get('darkMode');
  applyDarkMode(savedDark !== 'false');
  updateQueueUI();
  renderTemplates();
  renderTemplateManageList();

  window.addEventListener('online',  () => { isOnline = true;  onOnline(); });
  window.addEventListener('offline', () => { isOnline = false; onOffline(); });
  if (!navigator.onLine) onOffline();

  document.addEventListener('click', e => {
    const menu   = document.getElementById('user-menu');
    const avatar = document.getElementById('user-avatar');
    if (menu && avatar && !menu.contains(e.target) && !avatar.contains(e.target)) {
      menu.classList.add('hidden');
    }
  });

  showLoadingScreen();

  firebaseAuth.onAuthStateChanged(user => {
    hideLoadingScreen();
    if (user) { currentUser = user; showApp(user); }
    else       { currentUser = null; showAuthScreen(); }
  });

  // Check API health
  checkApiHealth();
});

// ── API Health Check ──────────────────────────────────────────────
async function checkApiHealth() {
  const dot  = document.getElementById('api-status');
  const hdot = document.getElementById('api-health-dot');
  const htxt = document.getElementById('api-health-text');
  try {
    const base = window.WT_API_URL || 'http://localhost:3001';
    const res  = await fetch(`${base}/health`);
    const ok   = res.ok;
    if (dot)  { dot.className  = 'api-status-dot ' + (ok ? 'ok' : 'err'); dot.title = ok ? 'API connected' : 'API error'; }
    if (hdot) { hdot.className = 'health-dot ' + (ok ? 'ok' : 'err'); }
    if (htxt) { htxt.textContent = ok ? `✓ API connected (${base})` : '✗ API unreachable'; }
  } catch {
    if (dot)  { dot.className  = 'api-status-dot err'; dot.title = 'API unreachable'; }
    if (hdot) { hdot.className = 'health-dot err'; }
    if (htxt) { htxt.textContent = '✗ API unreachable — check URL in Settings'; }
  }
}

// ── Auth ──────────────────────────────────────────────────────────
function showLoadingScreen() { document.getElementById('loading-screen')?.classList.remove('hidden'); }
function hideLoadingScreen() { document.getElementById('loading-screen')?.classList.add('hidden'); }

function showAuthScreen() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app-screen').classList.add('hidden');
}

async function showApp(user) {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  initAppListeners();
  renderUserAvatar(user);
  document.getElementById('user-email-display').textContent = user.email || 'Signed in';

  // Reset Sheets state
  window._sheetsAccessToken = null;
  sheetsTokenExpiry  = 0;
  sheetsTokenClient  = null;
  sheetsTokenPending = false;
  sheetsTokenWaiters.forEach(w => w.reject(new Error('User changed')));
  sheetsTokenWaiters = [];

  // Init Sheets OAuth client
  if (Config.clientId) await initSheetsClient(user.email || '');

  // Load user profile from backend
  try {
    const profile = await API.Users.me();
    // Sync Sheet ID from server to localStorage
    if (profile.spreadsheetId && !Config.sheetId) {
      Config.set('sheetId', profile.spreadsheetId);
    }
    if (profile.budgets) Budget.saveAll(profile.budgets);
    if (profile.templates) Templates.saveAll(profile.templates);
  } catch (e) {
    console.warn('Could not load profile from API:', e.message);
  }

  // Auto-setup sheet if we have an access token
  if (Config.clientId) {
    try {
      const token = await ensureSheetsToken();
      window._sheetsAccessToken = token;
      const res = await API.Sheets.setup(Config.sheetId || undefined);
      if (res.spreadsheetId && !Config.sheetId) {
        Config.set('sheetId', res.spreadsheetId);
        await API.Users.update({ spreadsheetId: res.spreadsheetId });
      }
    } catch (e) {
      console.warn('Sheet auto-setup skipped:', e.message);
    }
  }

  renderTemplates();
  renderTemplateManageList();
  loadTodayRecent();

  // Update OCR server status
  const ocrEl = document.getElementById('ocr-server-status');
  if (ocrEl) ocrEl.textContent = '✓ Server-side OCR is active (no key needed here)';
}

function initAppListeners() {
  const amtInput = document.getElementById('input-amount');
  if (amtInput && !amtInput._listenerAttached) {
    amtInput._listenerAttached = true;
    amtInput.addEventListener('input', () => {
      let raw = amtInput.value.replace(/\D/g, '');
      if (raw) amtInput.value = Number(raw).toLocaleString('id-ID');
    });
    amtInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleSubmit(); });
  }
  const editAmt = document.getElementById('edit-amount');
  if (editAmt && !editAmt._listenerAttached) {
    editAmt._listenerAttached = true;
    editAmt.addEventListener('input', () => {
      let raw = editAmt.value.replace(/\D/g, '');
      if (raw) editAmt.value = Number(raw).toLocaleString('id-ID');
    });
  }
  const inputDate = document.getElementById('input-date');
  if (inputDate) inputDate.value = todayISO();
  loadSettingsUI();
  renderBudgetModalInputs();
}

function renderUserAvatar(user) {
  const el = document.getElementById('user-avatar');
  if (!el) return;
  if (user.photoURL) {
    el.innerHTML = `<img src="${user.photoURL}" style="width:32px;height:32px;border-radius:50%;object-fit:cover" referrerpolicy="no-referrer">`;
  } else {
    el.textContent = (user.email || 'U').charAt(0).toUpperCase();
  }
}

function showAuthTab(tab) {
  document.getElementById('auth-login').classList.toggle('hidden', tab !== 'login');
  document.getElementById('auth-signup').classList.toggle('hidden', tab !== 'signup');
  document.getElementById('tab-login-btn').classList.toggle('active', tab === 'login');
  document.getElementById('tab-signup-btn').classList.toggle('active', tab === 'signup');
  document.getElementById('auth-error-login').classList.add('hidden');
  document.getElementById('auth-error-signup').classList.add('hidden');
}

async function signInEmail() {
  const email  = document.getElementById('login-email').value.trim();
  const pass   = document.getElementById('login-password').value;
  const text   = document.getElementById('login-text');
  const loader = document.getElementById('login-loader');
  if (!email || !pass) { showAuthError('login', 'Please fill in all fields'); return; }
  text.classList.add('hidden'); loader.classList.remove('hidden');
  try {
    await firebaseAuth.signInWithEmailAndPassword(email, pass);
  } catch (e) {
    showAuthError('login', friendlyAuthError(e.code));
  } finally {
    text.classList.remove('hidden'); loader.classList.add('hidden');
  }
}

async function forgotPassword() {
  const email = document.getElementById('login-email').value.trim();
  if (!email) { showAuthError('login', 'Enter your email first.'); return; }
  const btn = document.getElementById('forgot-btn');
  if (btn) { btn.textContent = 'Sending...'; btn.disabled = true; }
  try {
    await firebaseAuth.sendPasswordResetEmail(email);
    showAuthError('login', '✓ Reset link sent to ' + email);
  } catch (e) {
    showAuthError('login', friendlyAuthError(e.code));
  } finally {
    if (btn) { btn.textContent = 'Forgot password?'; btn.disabled = false; }
  }
}

async function signUpEmail() {
  const email   = document.getElementById('signup-email').value.trim();
  const pass    = document.getElementById('signup-password').value;
  const confirm = document.getElementById('signup-confirm').value;
  const text    = document.getElementById('signup-text');
  const loader  = document.getElementById('signup-loader');
  if (!email || !pass)  { showAuthError('signup', 'Please fill in all fields'); return; }
  if (pass !== confirm) { showAuthError('signup', 'Passwords do not match'); return; }
  if (pass.length < 6)  { showAuthError('signup', 'Password must be at least 6 characters'); return; }
  text.classList.add('hidden'); loader.classList.remove('hidden');
  try {
    await firebaseAuth.createUserWithEmailAndPassword(email, pass);
  } catch (e) {
    showAuthError('signup', friendlyAuthError(e.code));
  } finally {
    text.classList.remove('hidden'); loader.classList.add('hidden');
  }
}

function signInGoogle() {
  clearAuthErrors();
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isMobile) { showAuthError('login', 'Use email/password on mobile. Google sign-in requires a desktop browser.'); return; }
  document.querySelectorAll('.auth-btn-google').forEach(b => { b.disabled = true; b.style.opacity = '.6'; });
  firebaseAuth.signInWithPopup(googleProvider)
    .then(() => {})
    .catch(e => {
      document.querySelectorAll('.auth-btn-google').forEach(b => { b.disabled = false; b.style.opacity = ''; });
      if (e.code !== 'auth/popup-closed-by-user') showAuthError('login', friendlyAuthError(e.code));
    });
}

function clearAuthErrors() {
  document.getElementById('auth-error-login')?.classList.add('hidden');
  document.getElementById('auth-error-signup')?.classList.add('hidden');
}

async function handleSignOut() {
  document.getElementById('user-menu').classList.add('hidden');
  window._sheetsAccessToken = null;
  sheetsTokenExpiry  = 0;
  sheetsTokenClient  = null;
  sheetsTokenPending = false;
  sheetsTokenWaiters.forEach(w => w.reject(new Error('Signed out')));
  sheetsTokenWaiters = [];
  Config.set('sheetsHint', '');
  await firebaseAuth.signOut();
  allTransactions = []; recentItems = [];
}

function toggleUserMenu() { document.getElementById('user-menu').classList.toggle('hidden'); }

function showAuthError(form, msg) {
  const el = document.getElementById('auth-error-' + form);
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}

function friendlyAuthError(code) {
  const map = {
    'auth/user-not-found':       'No account with this email.',
    'auth/wrong-password':       'Incorrect password.',
    'auth/invalid-credential':   'Email or password is incorrect.',
    'auth/email-already-in-use': 'Email already registered.',
    'auth/invalid-email':        'Invalid email address.',
    'auth/weak-password':        'Password too weak (min 6 chars).',
    'auth/network-request-failed':'Network error. Check connection.',
    'auth/too-many-requests':    'Too many attempts. Try later.',
  };
  return map[code] || 'Error: ' + (code || 'Unknown');
}

// ── Google Sheets OAuth (client-side) ─────────────────────────────
function initSheetsClient(emailHint) {
  return new Promise(resolve => {
    if (!Config.clientId) { resolve(); return; }
    Config.set('sheetsHint', emailHint || '');
    const tryInit = () => {
      if (typeof google === 'undefined' || !google.accounts) { setTimeout(tryInit, 300); return; }
      sheetsTokenClient = google.accounts.oauth2.initTokenClient({
        client_id:      Config.clientId,
        scope:          'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file',
        callback:       onSheetsToken,
        error_callback: onSheetsTokenError,
      });
      resolve();
    };
    tryInit();
  });
}

function ensureSheetsToken() {
  return new Promise((resolve, reject) => {
    if (window._sheetsAccessToken && Date.now() < sheetsTokenExpiry) { resolve(window._sheetsAccessToken); return; }
    if (!Config.clientId) { reject(new Error('Add Google Client ID in Settings first.')); return; }
    sheetsTokenWaiters.push({ resolve, reject });
    if (sheetsTokenPending) return;
    if (!sheetsTokenClient) {
      sheetsTokenPending = false;
      const waiters = sheetsTokenWaiters.splice(0);
      waiters.forEach(w => w.reject(new Error('Google Sheets not connected.')));
      return;
    }
    sheetsTokenPending = true;
    sheetsTokenClient.requestAccessToken({ prompt: '', login_hint: Config.get('sheetsHint') || '' });
  });
}

function onSheetsToken(resp) {
  sheetsTokenPending = false;
  if (resp.error) { onSheetsTokenError(resp); return; }
  window._sheetsAccessToken = resp.access_token;
  sheetsTokenExpiry = Date.now() + ((resp.expires_in || 3600) - 300) * 1000;
  const waiters = sheetsTokenWaiters.splice(0);
  waiters.forEach(w => w.resolve(window._sheetsAccessToken));
  if (Queue.count() > 0) syncQueue();
}

function onSheetsTokenError(err) {
  sheetsTokenPending = false;
  console.warn('Sheets token failed:', err);
  const waiters = sheetsTokenWaiters.splice(0);
  waiters.forEach(w => w.reject(new Error('Google Sheets auth failed. Check Client ID.')));
}

function connectGoogleSheets() {
  if (!Config.clientId) { showToast('Save Google Client ID first', 'error'); return; }
  if (!sheetsTokenClient) { showToast('Reload the page after saving Client ID', 'info'); return; }
  sheetsTokenClient.requestAccessToken({ prompt: 'consent', login_hint: Config.get('sheetsHint') || '' });
}

// ── Settings ──────────────────────────────────────────────────────
function loadSettingsUI() {
  const cid = document.getElementById('set-client-id');
  const sid = document.getElementById('set-sheet-id');
  const url = document.getElementById('set-api-url');
  if (cid) cid.value = Config.clientId;
  if (sid) sid.value = Config.sheetId;
  if (url) url.value = window.WT_API_URL || 'http://localhost:3001';
  const toggle = document.getElementById('dark-mode-toggle');
  if (toggle) toggle.checked = document.body.classList.contains('dark');
}

function saveGoogleSettings() {
  const cid = document.getElementById('set-client-id')?.value.trim();
  const sid = document.getElementById('set-sheet-id')?.value.trim();
  if (cid) Config.set('clientId', cid);
  if (sid) { Config.set('sheetId', sid); API.Users.update({ spreadsheetId: sid }).catch(() => {}); }
  showToast('Google settings saved ✓', 'success');
  if (cid && currentUser) initSheetsClient(currentUser.email || '');
}

async function saveApiUrl() {
  const val = document.getElementById('set-api-url')?.value.trim();
  if (!val) return;
  window.WT_API_URL = val;
  localStorage.setItem('wt_apiUrl', val);
  showToast('API URL saved, testing...', 'info');
  await checkApiHealth();
}

async function initSheetHeaders() {
  try {
    await API.Sheets.setup(Config.sheetId || undefined);
    showToast('Headers created ✓', 'success');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

// ── Dark Mode ─────────────────────────────────────────────────────
function toggleDark() {
  const isDark = !document.body.classList.contains('dark');
  applyDarkMode(isDark);
  Config.set('darkMode', isDark ? 'true' : 'false');
  API.Users.update({ preferences: { darkMode: isDark } }).catch(() => {});
}

function applyDarkMode(isDark) {
  document.body.classList.toggle('dark', isDark);
  const moon   = document.getElementById('icon-moon');
  const sun    = document.getElementById('icon-sun');
  if (moon) moon.style.display = isDark ? 'none' : '';
  if (sun)  sun.style.display  = isDark ? '' : 'none';
  const toggle = document.getElementById('dark-mode-toggle');
  if (toggle) toggle.checked = isDark;
}

// ── Online/Offline ────────────────────────────────────────────────
function onOffline() { document.getElementById('offline-banner')?.classList.remove('hidden'); }
function onOnline()  {
  document.getElementById('offline-banner')?.classList.add('hidden');
  if (Queue.count() > 0 && window._sheetsAccessToken) syncQueue();
}

function updateQueueUI() {
  const count    = Queue.count();
  const indicator= document.getElementById('sync-indicator');
  const notice   = document.getElementById('queue-notice');
  const noteText = document.getElementById('queue-notice-text');
  const syncCnt  = document.getElementById('sync-count');
  if (count > 0) {
    indicator?.classList.remove('hidden');
    if (syncCnt) syncCnt.textContent = count;
    notice?.classList.remove('hidden');
    if (noteText) noteText.textContent = count + ' transaction' + (count > 1 ? 's' : '') + ' pending sync';
  } else {
    indicator?.classList.add('hidden');
    notice?.classList.add('hidden');
  }
}

async function syncQueue() {
  const queue = Queue.getAll();
  if (!queue.length) { showToast('Nothing to sync', 'info'); return; }
  let synced = 0;
  for (const item of queue) {
    try {
      await API.Transactions.create(item);
      Queue.remove(item._qid); synced++;
    } catch (e) { console.error('Sync fail:', e); }
  }
  if (synced) { showToast('✓ ' + synced + ' transaction' + (synced > 1 ? 's' : '') + ' synced', 'success'); loadTodayRecent(); }
}

// ── Suggestions ───────────────────────────────────────────────────
function onDescInput() {
  const desc = document.getElementById('input-desc').value.trim();
  if (!desc || desc.length < 3) { dismissSuggestion(); return; }
  const suggestion = Patterns.suggest(desc);
  if (!suggestion) { dismissSuggestion(); return; }
  const amtField = document.getElementById('input-amount').value;
  if (amtField && amtField !== '0') return;
  currentSuggestion = suggestion;
  document.getElementById('suggestion-text').textContent =
    '💡 Usually Rp ' + suggestion.suggestedAmount.toLocaleString('id-ID') + ' · ' + suggestion.category + ' (' + suggestion.count + '× before)';
  document.getElementById('suggestion-banner').classList.remove('hidden');
}

function applySuggestion() {
  if (!currentSuggestion) return;
  document.getElementById('input-amount').value = currentSuggestion.suggestedAmount.toLocaleString('id-ID');
  dismissSuggestion();
}

function dismissSuggestion() {
  currentSuggestion = null;
  document.getElementById('suggestion-banner')?.classList.add('hidden');
}

// ── Date ──────────────────────────────────────────────────────────
function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function setDateToday() {
  useCustomDate = false;
  document.getElementById('btn-today').classList.add('active');
  document.getElementById('input-date').classList.remove('active-pick');
  document.getElementById('input-date').value = todayISO();
}
function setDateCustom() {
  useCustomDate = true;
  document.getElementById('btn-today').classList.remove('active');
  document.getElementById('input-date').classList.add('active-pick');
}
function getSelectedDate() {
  if (!useCustomDate) return new Date();
  const val = document.getElementById('input-date').value;
  if (!val) return new Date();
  const parts = val.split('-').map(Number);
  const now   = new Date();
  return new Date(parts[0], parts[1]-1, parts[2], now.getHours(), now.getMinutes(), now.getSeconds());
}
function getWeekNumber(date) {
  const d   = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - year) / 86400000) + 1) / 7);
}

// ── Receipt / OCR ─────────────────────────────────────────────────
function openReceiptCamera() { document.getElementById('receipt-camera-input').click(); }

async function onReceiptSelected(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const dataUrl = e.target.result;
    pendingReceiptB64  = dataUrl.split(',')[1];
    pendingReceiptMime = file.type || 'image/jpeg';
    document.getElementById('receipt-preview-img').src = dataUrl;
    document.getElementById('receipt-preview-container').classList.remove('hidden');

    // Call server OCR
    const btn = document.getElementById('btn-camera');
    if (btn) { btn.textContent = '⏳ Scanning...'; btn.disabled = true; }
    try {
      const result = await API.OCR.scanReceipt(pendingReceiptB64, pendingReceiptMime);
      if (result.description) {
        document.getElementById('input-desc').value   = result.description;
        document.getElementById('input-amount').value = result.amount > 0 ? result.amount.toLocaleString('id-ID') : '';
        showToast('Receipt scanned ✓ (confidence: ' + Math.round(result.confidence * 100) + '%)', 'success');
      } else {
        showToast('Could not read receipt — fill manually', 'info');
      }
    } catch (e) {
      showToast('OCR error: ' + e.message, 'error');
    } finally {
      if (btn) { btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> Scan Receipt'; btn.disabled = false; }
    }
  };
  reader.readAsDataURL(file);
}

function clearReceiptPreview() {
  pendingReceiptB64 = null;
  document.getElementById('receipt-preview-container').classList.add('hidden');
  document.getElementById('receipt-preview-img').src = '';
  document.getElementById('receipt-camera-input').value = '';
}

// ── Submit ────────────────────────────────────────────────────────
async function handleSubmit() {
  const descEl    = document.getElementById('input-desc');
  const amtEl     = document.getElementById('input-amount');
  const btn       = document.getElementById('btn-submit');
  const btnText   = document.getElementById('btn-submit-text');
  const btnLoader = document.getElementById('btn-submit-loader');

  const description = descEl.value.trim();
  const amount      = parseInt(amtEl.value.replace(/\D/g, ''), 10);

  if (!description) { showToast('Fill in description', 'error'); descEl.focus(); return; }
  if (!amount || amount <= 0) { showToast('Enter a valid amount', 'error'); amtEl.focus(); return; }

  const category    = categorize(description);
  const selectedDate = getSelectedDate();
  const txData = {
    description,
    amount,
    category,
    date:  selectedDate.toISOString(),
    notes: '',
  };

  btn.disabled = true; btnText.textContent = 'Saving...'; btnLoader.classList.remove('hidden');
  Patterns.record(description, amount, category);
  dismissSuggestion();

  if (!isOnline) {
    Queue.add(txData);
    showToast('Saved offline · will sync when connected', 'info');
    recentItems.unshift({ ...txData, timestamp: selectedDate.toISOString(), sheetRow: null, month: '', week: '' });
    renderRecent(); updateTodayTotal();
    descEl.value = ''; amtEl.value = ''; setDateToday(); descEl.focus();
    btn.disabled = false; btnText.textContent = 'Add Spending'; btnLoader.classList.add('hidden');
    return;
  }

  try {
    await API.Transactions.create(txData);
    const cat = CATEGORIES.find(c => c.name === category) || CATEGORIES[9];
    showToast(cat.emoji + ' ' + category + ' · Rp ' + amount.toLocaleString('id-ID') + ' ✓', 'success');
    clearReceiptPreview();
    descEl.value = ''; amtEl.value = ''; setDateToday(); descEl.focus();
    loadTodayRecent();
  } catch (e) {
    if (!navigator.onLine || e.message.includes('fetch')) {
      Queue.add(txData);
      showToast('Offline — queued for sync', 'info');
    } else {
      showToast('Save failed: ' + e.message, 'error');
    }
  } finally {
    btn.disabled = false; btnText.textContent = 'Add Spending'; btnLoader.classList.add('hidden');
  }
}

// ── Load Today's Recent ───────────────────────────────────────────
async function loadTodayRecent() {
  try {
    const res = await API.Transactions.list();
    const rows = res.transactions || [];

    allTransactions = rows.map(r => ({
      timestamp:   r.timestamp,
      description: r.description,
      amount:      r.amount,
      category:    r.category,
      month:       r.month,
      week:        r.week,
      notes:       r.notes,
      sheetRow:    r.rowIndex,
    })).reverse();

    const now    = new Date();
    const todayY = now.getFullYear(), todayM = now.getMonth(), todayD = now.getDate();

    recentItems = allTransactions.filter(tx => {
      const d = new Date(tx.timestamp);
      return !isNaN(d) && d.getFullYear() === todayY && d.getMonth() === todayM && d.getDate() === todayD;
    }).slice(0, 20);

    renderRecent(); updateTodayTotal();
    updateExportCounts();
  } catch (e) { console.warn('loadTodayRecent:', e.message); }
}

function updateTodayTotal() {
  const total = recentItems.reduce((s, tx) => s + tx.amount, 0);
  const badge = document.getElementById('today-total');
  if (badge) {
    badge.classList.toggle('hidden', total === 0);
    const amtEl = document.getElementById('today-total-amount');
    if (amtEl) amtEl.textContent = 'Rp ' + total.toLocaleString('id-ID');
  }
  const titleEl = document.getElementById('added-today-title');
  if (titleEl) {
    titleEl.innerHTML = recentItems.length > 0
      ? 'Added Today <span class="today-count-badge">' + recentItems.length + ' · Rp ' + total.toLocaleString('id-ID') + '</span>'
      : 'Added Today';
  }
}

// ── Transaction Item ──────────────────────────────────────────────
function buildTransactionItem(tx, index, source) {
  const cat     = CATEGORIES.find(c => c.name === tx.category) || CATEGORIES[9];
  const wrapper = document.createElement('div'); wrapper.className = 'swipe-wrapper';
  const bg      = document.createElement('div'); bg.className = 'swipe-delete-bg'; bg.textContent = '🗑️';
  const item    = document.createElement('div'); item.className = 'transaction-item';
  item.style.borderLeftColor = cat.color;
  const pending = !tx.sheetRow ? ' <span style="font-size:10px;color:#f59e0b">⏳</span>' : '';
  item.innerHTML =
    '<span class="tx-emoji">' + cat.emoji + '</span>' +
    '<div class="tx-details">' +
      '<div class="tx-desc">' + escHtml(tx.description) + pending + '</div>' +
      '<div class="tx-cat">' + tx.category + '</div>' +
    '</div>' +
    '<div class="tx-right"><div class="tx-amount">Rp ' + tx.amount.toLocaleString('id-ID') + '</div></div>' +
    '<span class="tx-edit-hint">✎</span>';
  item.addEventListener('click', () => openEdit(source, index));
  addSwipeToDelete(item, bg, wrapper, () => openDelete(source, index));
  wrapper.appendChild(bg); wrapper.appendChild(item);
  return wrapper;
}

function addSwipeToDelete(item, bg, wrapper, onDelete) {
  let startX = 0, currentX = 0, isSwiping = false;
  const THRESHOLD = 80;
  const onStart = x => { startX = x; isSwiping = true; item.classList.add('swiping'); };
  const onMove  = x => { if (!isSwiping) return; currentX = Math.min(0, x - startX); item.style.transform = 'translateX(' + currentX + 'px)'; bg.style.width = Math.max(0, -currentX) + 'px'; };
  const onEnd   = () => {
    if (!isSwiping) return; isSwiping = false; item.classList.remove('swiping');
    if (currentX < -THRESHOLD) { item.style.transform = 'translateX(-' + wrapper.offsetWidth + 'px)'; setTimeout(onDelete, 150); }
    else { item.style.transform = ''; bg.style.width = '0'; }
    currentX = 0;
  };
  item.addEventListener('touchstart', e => onStart(e.touches[0].clientX), { passive: true });
  item.addEventListener('touchmove',  e => onMove(e.touches[0].clientX),  { passive: true });
  item.addEventListener('touchend',   onEnd);
  item.addEventListener('mousedown',  e => { if (e.button === 0) onStart(e.clientX); });
  window.addEventListener('mousemove', e => { if (isSwiping) { e.preventDefault(); onMove(e.clientX); } });
  window.addEventListener('mouseup',   () => { if (isSwiping) onEnd(); });
}

function renderRecent() {
  const el = document.getElementById('recent-list');
  if (!recentItems.length) { el.innerHTML = '<p class="empty-state">No spending today yet</p>'; return; }
  el.innerHTML = '';
  recentItems.forEach((tx, i) => el.appendChild(buildTransactionItem(tx, i, 'recent')));
}

// ── Delete ────────────────────────────────────────────────────────
function openDelete(source, index) {
  const tx = source === 'recent' ? recentItems[index] : allTransactions[index];
  if (!tx) return;
  deleteTarget = { source, index, tx };
  document.getElementById('delete-preview').innerHTML =
    '<strong>' + escHtml(tx.description) + '</strong><br>Rp ' + tx.amount.toLocaleString('id-ID') + ' · ' + tx.category;
  document.getElementById('delete-modal').classList.remove('hidden');
}

async function confirmDelete() {
  if (!deleteTarget) return;
  const { source, index, tx } = deleteTarget;
  if (source === 'recent') { recentItems.splice(index, 1); renderRecent(); updateTodayTotal(); }
  else { allTransactions.splice(index, 1); applyHistoryFilter(); }
  closeDelete();
  if (tx.sheetRow) {
    try {
      await API.Transactions.delete(tx.sheetRow);
      allTransactions.forEach(t => { if (t.sheetRow > tx.sheetRow) t.sheetRow--; });
      recentItems.forEach(t => { if (t.sheetRow > tx.sheetRow) t.sheetRow--; });
      showToast('Deleted ✓', 'success');
    } catch (e) { showToast('Delete failed: ' + e.message, 'error'); }
  } else { showToast('Deleted ✓', 'success'); }
}

function closeDelete() {
  document.getElementById('delete-modal').classList.add('hidden'); deleteTarget = null;
  document.querySelectorAll('.transaction-item').forEach(el => { el.style.transform = ''; });
  document.querySelectorAll('.swipe-delete-bg').forEach(el => { el.style.width = '0'; });
}
function closeDeleteIfOverlay(e) { if (e.target === document.getElementById('delete-modal')) closeDelete(); }

// ── Edit ──────────────────────────────────────────────────────────
function openEdit(source, index) {
  const tx = source === 'recent' ? recentItems[index] : allTransactions[index];
  if (!tx) return;
  editTarget = { source, index, sheetRow: tx.sheetRow };
  document.getElementById('edit-desc').value   = tx.description;
  document.getElementById('edit-amount').value = tx.amount.toLocaleString('id-ID');
  const editNotesEl = document.getElementById('edit-notes');
  if (editNotesEl) editNotesEl.value = tx.notes || '';
  const d = new Date(tx.timestamp);
  if (!isNaN(d)) {
    document.getElementById('edit-date').value =
      d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  document.getElementById('edit-category-chips').innerHTML = CATEGORIES.map(cat => {
    const sel = cat.name === tx.category;
    return '<button class="cat-chip' + (sel ? ' selected' : '') + '" style="' +
      (sel ? 'background:' + cat.color + ';color:#fff;border-color:' + cat.color : 'background:transparent') +
      '" data-cat="' + cat.name + '" onclick="selectEditCategory(this,\'' + cat.name.replace(/'/g, "\\'") + '\')">' +
      cat.emoji + ' ' + cat.name + '</button>';
  }).join('');
  document.getElementById('edit-modal').classList.remove('hidden');
}

function selectEditCategory(el, name) {
  document.querySelectorAll('#edit-category-chips .cat-chip').forEach(chip => {
    const cat = CATEGORIES.find(c => c.name === chip.dataset.cat);
    if (cat?.name === name) { chip.classList.add('selected'); chip.style.background = cat.color; chip.style.color = '#fff'; chip.style.borderColor = cat.color; }
    else { chip.classList.remove('selected'); chip.style.background = 'transparent'; chip.style.color = ''; chip.style.borderColor = ''; }
  });
}

async function saveEdit() {
  if (!editTarget) return;
  const newDesc   = document.getElementById('edit-desc').value.trim();
  const newAmount = parseInt(document.getElementById('edit-amount').value.replace(/\D/g, ''), 10);
  const newCat    = document.querySelector('#edit-category-chips .cat-chip.selected')?.dataset.cat || 'Others';
  const newDateV  = document.getElementById('edit-date').value;
  const newNotes  = document.getElementById('edit-notes')?.value.trim() || '';
  if (!newDesc)               { showToast('Description required', 'error'); return; }
  if (!newAmount || newAmount <= 0) { showToast('Invalid amount', 'error'); return; }

  const dateObj = newDateV ? new Date(newDateV + 'T12:00:00') : new Date();
  const txData  = { description: newDesc, amount: newAmount, category: newCat, date: dateObj.toISOString(), notes: newNotes };

  if (editTarget.sheetRow) {
    try {
      await API.Transactions.update(editTarget.sheetRow, txData);
      showToast('Updated ✓', 'success');
    } catch (e) { showToast('Update failed: ' + e.message, 'error'); return; }
  }

  const tx = editTarget.source === 'recent' ? recentItems[editTarget.index] : allTransactions[editTarget.index];
  Object.assign(tx, { description: newDesc, amount: newAmount, category: newCat, timestamp: dateObj.toISOString(), notes: newNotes });
  if (editTarget.source === 'recent') { renderRecent(); updateTodayTotal(); }
  else { applyHistoryFilter(); }
  closeEdit();
}

function closeEdit() { document.getElementById('edit-modal').classList.add('hidden'); editTarget = null; }
function closeEditIfOverlay(e) { if (e.target === document.getElementById('edit-modal')) closeEdit(); }

// ── History Tab ───────────────────────────────────────────────────
async function loadHistory() {
  const icon = document.getElementById('history-refresh-icon');
  if (icon) icon.style.animation = 'spin 1s linear infinite';
  try {
    const res = await API.Transactions.list();
    allTransactions = (res.transactions || []).map(r => ({
      timestamp:   r.timestamp,
      description: r.description,
      amount:      r.amount,
      category:    r.category,
      month:       r.month,
      week:        r.week,
      notes:       r.notes,
      sheetRow:    r.rowIndex,
    })).reverse();
    applyHistoryFilter();
    updateExportCounts();
  } catch (e) {
    showToast('Refresh failed: ' + e.message, 'error');
  } finally {
    if (icon) icon.style.animation = '';
  }
}

let activeHistorySort = 'date-desc';
let activeHistoryCat  = 'all';

function setSort(s) {
  activeHistorySort = s;
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.toggle('active', b.dataset.sort === s));
  applyHistoryFilter();
}
function setFilterCat(cat) {
  activeHistoryCat = cat;
  document.querySelectorAll('.filter-chip').forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
  applyHistoryFilter();
}

function applyHistoryFilter() {
  const search = (document.getElementById('history-search')?.value || '').toLowerCase();
  let filtered = allTransactions.filter(tx => {
    const catOk  = activeHistoryCat === 'all' || tx.category === activeHistoryCat;
    const searchOk = !search || tx.description.toLowerCase().includes(search) || tx.category.toLowerCase().includes(search);
    return catOk && searchOk;
  });

  filtered.sort((a, b) => {
    if (activeHistorySort === 'date-desc')   return new Date(b.timestamp) - new Date(a.timestamp);
    if (activeHistorySort === 'date-asc')    return new Date(a.timestamp) - new Date(b.timestamp);
    if (activeHistorySort === 'amount-desc') return b.amount - a.amount;
    if (activeHistorySort === 'amount-asc')  return a.amount - b.amount;
    return 0;
  });

  const list = document.getElementById('history-list');
  if (!filtered.length) {
    list.innerHTML = '<p class="empty-state">No transactions found</p>';
    return;
  }
  list.innerHTML = '';
  // Group by date
  const groups = {};
  filtered.forEach((tx, i) => {
    const d     = new Date(tx.timestamp);
    const label = isNaN(d) ? 'Unknown' : d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (!groups[label]) groups[label] = [];
    groups[label].push({ tx, i: allTransactions.indexOf(tx) });
  });
  for (const [label, items] of Object.entries(groups)) {
    const header = document.createElement('div'); header.className = 'history-date-header'; header.textContent = label;
    list.appendChild(header);
    items.forEach(({ tx, i }) => list.appendChild(buildTransactionItem(tx, i, 'history')));
  }
}

// ── Dashboard ─────────────────────────────────────────────────────
async function loadDashboard() {
  if (!allTransactions.length) {
    try { const r = await API.Transactions.list(); allTransactions = (r.transactions || []).map(row => ({ ...row, sheetRow: row.rowIndex })).reverse(); } catch { return; }
  }
  const now   = dashboardMonth;
  const month = MONTH_NAMES[now.getMonth()] + ' ' + now.getFullYear();
  document.getElementById('dashboard-month').textContent = month;

  const monthTxs = allTransactions.filter(tx => {
    const d = new Date(tx.timestamp);
    return !isNaN(d) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });

  const total = monthTxs.reduce((s, tx) => s + tx.amount, 0);
  const days  = new Set(monthTxs.map(tx => new Date(tx.timestamp).toDateString())).size;
  const catTotals = {};
  monthTxs.forEach(tx => { catTotals[tx.category] = (catTotals[tx.category] || 0) + tx.amount; });
  const topCat = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
  const topCatObj = topCat ? CATEGORIES.find(c => c.name === topCat[0]) : null;

  document.getElementById('sum-total').textContent = 'Rp ' + total.toLocaleString('id-ID');
  document.getElementById('sum-avg').textContent   = days ? 'Rp ' + Math.round(total / days).toLocaleString('id-ID') : 'Rp 0';
  document.getElementById('sum-top').textContent   = topCatObj ? topCatObj.emoji + ' ' + topCat[0] : '—';

  renderBudgetBars(catTotals);
  renderWoWCard(allTransactions);
  renderPieChart(catTotals);
  renderBarChart(monthTxs, now);
}

function changeMonth(delta) {
  dashboardMonth = new Date(dashboardMonth.getFullYear(), dashboardMonth.getMonth() + delta, 1);
  loadDashboard();
}

function renderPieChart(catTotals) {
  const cats   = Object.keys(catTotals);
  const vals   = cats.map(c => catTotals[c]);
  const colors = cats.map(c => CATEGORIES.find(x => x.name === c)?.color || '#94a3b8');
  const ctx    = document.getElementById('chart-pie');
  if (!ctx) return;
  if (pieChart) pieChart.destroy();
  pieChart = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: cats.map(c => { const cat = CATEGORIES.find(x => x.name === c); return (cat?.emoji || '') + ' ' + c; }), datasets: [{ data: vals, backgroundColor: colors, borderWidth: 2, borderColor: 'transparent' }] },
    options: { plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 } } } }, cutout: '60%' },
  });
}

function renderBarChart(monthTxs, now) {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const labels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
  const data   = Array(daysInMonth).fill(0);
  monthTxs.forEach(tx => { const d = new Date(tx.timestamp); if (!isNaN(d)) data[d.getDate() - 1] += tx.amount; });
  const ctx = document.getElementById('chart-bar');
  if (!ctx) return;
  if (barChart) barChart.destroy();
  barChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: '#1d9bf0', borderRadius: 4, borderSkipped: false }] },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        y: { ticks: { color: '#536471', callback: v => 'Rp ' + (v / 1000).toFixed(0) + 'k' }, grid: { color: '#2f3336' } },
        x: { ticks: { color: '#536471', maxTicksLimit: 10 }, grid: { display: false } },
      },
    },
  });
}

function renderWoWCard(transactions) {
  const card = document.getElementById('wow-card');
  if (!card) return;
  const now        = new Date();
  const getMonday  = d => { const date = new Date(d); date.setDate(date.getDate() - ((date.getDay() + 6) % 7)); date.setHours(0,0,0,0); return date; };
  const thisMonday = getMonday(now);
  const lastMonday = new Date(thisMonday); lastMonday.setDate(lastMonday.getDate() - 7);
  const lastSunday = new Date(thisMonday); lastSunday.setDate(lastSunday.getDate() - 1); lastSunday.setHours(23,59,59,999);
  const thisWeekTxs = transactions.filter(tx => { const d = new Date(tx.timestamp); return !isNaN(d) && d >= thisMonday && d <= now; });
  const lastWeekTxs = transactions.filter(tx => { const d = new Date(tx.timestamp); return !isNaN(d) && d >= lastMonday && d <= lastSunday; });
  const thisTotal   = thisWeekTxs.reduce((s, tx) => s + tx.amount, 0);
  const lastTotal   = lastWeekTxs.reduce((s, tx) => s + tx.amount, 0);
  if (thisTotal === 0 && lastTotal === 0) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  const delta = thisTotal - lastTotal;
  const pct   = lastTotal > 0 ? Math.round(Math.abs(delta / lastTotal) * 100) : null;
  const badge = document.getElementById('wow-badge');
  badge.className  = 'wow-badge ' + (delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat');
  badge.textContent = pct !== null ? (delta > 0 ? '▲ ' : delta < 0 ? '▼ ' : '') + pct + '%' : (delta > 0 ? '▲ New' : '—');
  document.getElementById('wow-this').textContent = 'Rp ' + thisTotal.toLocaleString('id-ID');
  document.getElementById('wow-last').textContent = 'Rp ' + lastTotal.toLocaleString('id-ID');
}

// ── Budget ────────────────────────────────────────────────────────
function renderBudgetBars(catTotals) {
  const budgets      = Budget.getAll();
  const container    = document.getElementById('budget-bars');
  const emptyBtn     = document.getElementById('btn-set-budget-empty');
  if (!container) return;
  const budgetedCats = CATEGORIES.filter(cat => budgets[cat.name]);
  if (!budgetedCats.length) { container.innerHTML = ''; if (emptyBtn) emptyBtn.style.display = ''; return; }
  if (emptyBtn) emptyBtn.style.display = 'none';
  container.innerHTML = budgetedCats.map(cat => {
    const spent  = catTotals[cat.name] || 0;
    const limit  = budgets[cat.name];
    const pct    = Math.min(100, Math.round((spent / limit) * 100));
    const status = pct >= 100 ? 'over' : pct >= 80 ? 'warning' : 'ok';
    const left   = (limit - spent).toLocaleString('id-ID');
    return '<div class="budget-bar-row">' +
      '<div class="budget-bar-header"><span class="budget-bar-label">' + cat.emoji + ' ' + cat.name + '</span>' +
      '<span class="budget-bar-amounts">Rp ' + spent.toLocaleString('id-ID') + ' / Rp ' + limit.toLocaleString('id-ID') + '</span></div>' +
      '<div class="budget-bar-track"><div class="budget-bar-fill ' + status + '" style="width:' + pct + '%"></div></div>' +
      '<div class="budget-bar-pct ' + status + '">' + pct + '% ' + (status === 'over' ? '🚨 Over budget!' : status === 'warning' ? '⚠️ Almost there' : '· Rp ' + left + ' left') + '</div></div>';
  }).join('');
}

function openBudgetModal() {
  renderBudgetModalInputs();
  document.getElementById('budget-modal').classList.remove('hidden');
}
function closeBudgetModal() { document.getElementById('budget-modal').classList.add('hidden'); }
function closeBudgetModalIfOverlay(e) { if (e.target === document.getElementById('budget-modal')) closeBudgetModal(); }

function renderBudgetModalInputs() {
  const container = document.getElementById('budget-modal-inputs');
  if (!container) return;
  const budgets = Budget.getAll();
  container.innerHTML = CATEGORIES.map(cat => {
    const id  = 'budgetm-' + cat.name.replace(/[^a-z]/gi, '_');
    const val = budgets[cat.name] ? Number(budgets[cat.name]).toLocaleString('id-ID') : '';
    return '<div class="budget-input-card" style="border-top-color:' + cat.color + '">' +
      '<div class="budget-cat-header"><span class="budget-cat-emoji">' + cat.emoji + '</span><span class="budget-cat-name">' + cat.name + '</span></div>' +
      '<span class="budget-input-prefix">Rp</span>' +
      '<input type="text" class="budget-input-field" id="' + id + '" inputmode="numeric" placeholder="No limit" value="' + val + '">' +
      '</div>';
  }).join('');
  container.querySelectorAll('.budget-input-field').forEach(inp => {
    inp.addEventListener('input', () => { let raw = inp.value.replace(/\D/g, ''); inp.value = raw ? Number(raw).toLocaleString('id-ID') : ''; });
  });
}

async function saveBudgetsFromModal() {
  const budgets = {};
  CATEGORIES.forEach(cat => {
    const el = document.getElementById('budgetm-' + cat.name.replace(/[^a-z]/gi, '_'));
    if (el) { const raw = parseInt(el.value.replace(/\D/g, ''), 10); if (raw > 0) budgets[cat.name] = raw; }
  });
  Budget.saveAll(budgets);
  API.Users.update({ budgets }).catch(() => {});
  showToast('Budget saved ✓', 'success');
  closeBudgetModal();
  loadDashboard();
}

// ── Templates ─────────────────────────────────────────────────────
function saveAsTemplate() {
  const desc = document.getElementById('input-desc').value.trim();
  const amt  = parseInt(document.getElementById('input-amount').value.replace(/\D/g, ''), 10);
  if (!desc || !amt) { showToast('Fill description and amount first', 'error'); return; }
  const cat  = categorize(desc);
  Templates.add({ description: desc, amount: amt, category: cat });
  API.Users.update({ templates: Templates.getAll() }).catch(() => {});
  renderTemplates(); renderTemplateManageList();
  showToast('Template saved ✓', 'success');
}

function renderTemplates() {
  const list = document.getElementById('templates-list');
  if (!list) return;
  const templates = Templates.getAll();
  if (!templates.length) { list.innerHTML = '<p class="empty-state-small">No templates yet</p>'; return; }
  list.innerHTML = '';
  templates.forEach((t, i) => {
    const cat = CATEGORIES.find(c => c.name === t.category) || CATEGORIES[9];
    const btn = document.createElement('button'); btn.className = 'template-chip';
    btn.style.borderColor = cat.color + '40';
    btn.innerHTML = cat.emoji + ' ' + escHtml(t.description) + '<br><span style="font-size:11px;opacity:.6">Rp ' + t.amount.toLocaleString('id-ID') + '</span>';
    btn.addEventListener('click', () => {
      document.getElementById('input-desc').value   = t.description;
      document.getElementById('input-amount').value = t.amount.toLocaleString('id-ID');
      switchTab('input');
    });
    list.appendChild(btn);
  });
}

function renderTemplateManageList() {
  const list = document.getElementById('template-manage-list');
  const emptyMsg = document.getElementById('template-empty-msg');
  if (!list) return;
  const templates = Templates.getAll();
  if (emptyMsg) emptyMsg.style.display = templates.length ? 'none' : '';
  list.innerHTML = '';
  templates.forEach((t, i) => {
    const row = document.createElement('div'); row.className = 'template-manage-row';
    const cat = CATEGORIES.find(c => c.name === t.category) || CATEGORIES[9];
    row.innerHTML =
      '<span class="template-manage-label">' + cat.emoji + ' ' + escHtml(t.description) + ' · Rp ' + t.amount.toLocaleString('id-ID') + '</span>' +
      '<button class="template-manage-delete" onclick="removeTemplate(' + i + ')">✕</button>';
    list.appendChild(row);
  });
}

function removeTemplate(i) {
  Templates.remove(i);
  API.Users.update({ templates: Templates.getAll() }).catch(() => {});
  renderTemplates(); renderTemplateManageList();
  showToast('Template removed', 'info');
}

// ── Export CSV ────────────────────────────────────────────────────
function updateExportCounts() {
  const el = document.getElementById('export-count');
  if (el) el.textContent = allTransactions.length + ' transactions';
}

function exportCSV(scope) {
  let rows = allTransactions;
  if (scope === 'month') {
    const now = new Date();
    rows = rows.filter(tx => { const d = new Date(tx.timestamp); return !isNaN(d) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); });
  }
  const header = 'Timestamp,Description,Amount,Category,Month,Week,Notes';
  const csv    = [header, ...rows.map(r => [r.timestamp, '"' + (r.description || '').replace(/"/g, '""') + '"', r.amount, r.category, r.month, r.week, '"' + (r.notes || '') + '"'].join(','))].join('\n');
  const blob   = new Blob([csv], { type: 'text/csv' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a'); a.href = url; a.download = 'wallet-tracker-' + new Date().toISOString().slice(0,10) + '.csv';
  a.click(); URL.revokeObjectURL(url);
}

// ── Monthly Report ────────────────────────────────────────────────
function generateMonthlyReport() {
  const now   = dashboardMonth;
  const month = MONTH_NAMES[now.getMonth()] + ' ' + now.getFullYear();
  const txs   = allTransactions.filter(tx => { const d = new Date(tx.timestamp); return !isNaN(d) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); });
  const total = txs.reduce((s, tx) => s + tx.amount, 0);
  const byCat = {};
  txs.forEach(tx => { byCat[tx.category] = (byCat[tx.category] || 0) + tx.amount; });
  const catLines = Object.entries(byCat).sort((a, b) => b[1] - a[1])
    .map(([cat, amt]) => { const c = CATEGORIES.find(x => x.name === cat); return (c?.emoji || '') + ' ' + cat + ': Rp ' + amt.toLocaleString('id-ID'); }).join('\n');
  const report = '=== Wallet Tracker Report ===\nPeriode: ' + month + '\n\nTotal Spending: Rp ' + total.toLocaleString('id-ID') + '\nJumlah Transaksi: ' + txs.length + '\n\nPer Kategori:\n' + catLines;
  const blob = new Blob([report], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a'); a.href = url; a.download = 'report-' + month.replace(' ', '-') + '.txt';
  a.click(); URL.revokeObjectURL(url);
}

// ── Tab Navigation ────────────────────────────────────────────────
function switchTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  const section = document.getElementById('tab-' + tabName);
  if (section) section.classList.add('active');
  if (tabName === 'history')   loadHistory();
  if (tabName === 'dashboard') loadDashboard();
  if (tabName === 'settings')  loadSettingsUI();
}

// ── Toast ─────────────────────────────────────────────────────────
let _toastTimer;
function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'toast show ' + type;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ── Utility ───────────────────────────────────────────────────────
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
