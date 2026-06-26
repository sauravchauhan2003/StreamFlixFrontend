/* ── Streamflix API Client ─────────────────────────────────────────────────── */
const API_BASE = 'http://localhost:9010';

// ── Auth State ────────────────────────────────────────────────────────────────
const Auth = {
  getToken:    () => localStorage.getItem('sf_token'),
  getUsername: () => localStorage.getItem('sf_username'),
  getEmail:    () => localStorage.getItem('sf_email'),
  getRole:     () => localStorage.getItem('sf_role'),
  isLoggedIn:  () => !!localStorage.getItem('sf_token'),

  set(token, username, email, role) {
    localStorage.setItem('sf_token',    token);
    localStorage.setItem('sf_username', username);
    localStorage.setItem('sf_email',    email    || '');
    localStorage.setItem('sf_role',     role     || 'USER');
  },

  clear() {
    ['sf_token','sf_username','sf_email','sf_role'].forEach(k => localStorage.removeItem(k));
  },

  logout() {
    this.clear();
    window.location.href = 'auth.html';
  }
};

// ── Request Helpers ───────────────────────────────────────────────────────────
function authHeaders(extra = {}) {
  const h = { ...extra };
  if (Auth.isLoggedIn()) h['Authorization'] = `Bearer ${Auth.getToken()}`;
  return h;
}

async function req(method, url, headers = {}, body = null) {
  const opts = { method, headers: authHeaders(headers) };
  if (body instanceof FormData) {
    opts.body = body; // Don't set Content-Type — browser sets multipart boundary
  } else if (body !== null) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  try {
    const res = await fetch(url, opts);
    if (res.status === 401) { Auth.logout(); return null; }
    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After') || '60';
      showRateLimitToast(parseInt(retryAfter, 10));
      return res;
    }
    return res;
  } catch (e) {
    console.error('Network error:', e);
    return null;
  }
}

// ── Streamflix API ────────────────────────────────────────────────────────────
const API = {

  /* ── Auth ─────────────────────────── */
  async login(username, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST', headers: { username, password }
    });
    return { status: res.status, data: await res.json().catch(() => null) };
  },

  async register(username, email, password) {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST', headers: { username, email, password }
    });
    return { status: res.status, data: await res.text() };
  },

  async verifyOtp(email, otp) {
    const res = await fetch(`${API_BASE}/auth/verifyotp`, {
      method: 'POST', headers: { email, otp }
    });
    return { status: res.status, data: await res.text() };
  },

  async forgotPassword(email) {
    const res = await fetch(`${API_BASE}/auth/forgotpassword`, {
      method: 'POST', headers: { email }
    });
    return { status: res.status, data: await res.text() };
  },

  async getMe() {
    const res = await req('GET', `${API_BASE}/auth/me`);
    if (!res || !res.ok) return null;
    return res.json();
  },

  /* ── Videos ───────────────────────── */
  async getVideos(page = 0, size = 20, category = 'all') {
    try {
      const res = await fetch(`${API_BASE}/video/videos?page=${page}&size=${size}&category=${category}`);
      if (!res || !res.ok) return [];
      return await res.json();
    } catch (e) {
      console.error('getVideos error:', e);
      return [];
    }
  },

  async getVideo(id) {
    try {
      const res = await fetch(`${API_BASE}/video/videos/${id}`);
      if (!res || !res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  async searchVideos(q) {
    try {
      const res = await fetch(`${API_BASE}/video/videos/search?q=${encodeURIComponent(q)}`);
      if (!res || !res.ok) return [];
      return await res.json();
    } catch (e) {
      return [];
    }
  },

  async getMyVideos() {
    const res = await req('GET', `${API_BASE}/video/my-videos`);
    if (!res || !res.ok) return [];
    return res.json();
  },

  // Upload via XHR for progress tracking
  uploadVideo(formData, meta, onProgress) {
    return new Promise(resolve => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/video/upload`);
      if (Auth.isLoggedIn()) xhr.setRequestHeader('Authorization', `Bearer ${Auth.getToken()}`);
      xhr.setRequestHeader('title', meta.title);
      xhr.setRequestHeader('desc', meta.desc);
      if (meta.category) xhr.setRequestHeader('category', meta.category);

      if (onProgress) {
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100));
        };
      }
      xhr.onload  = () => resolve({ status: xhr.status, data: xhr.responseText });
      xhr.onerror = () => resolve({ status: 0,          data: 'Network error'  });
      xhr.send(formData);
    });
  },

  /* ── Interactions ─────────────────── */
  async toggleLike(videoId) {
    const res = await req('POST', `${API_BASE}/video/videos/${videoId}/like`);
    if (!res || !res.ok) return null;
    return res.json();
  },

  async toggleDislike(videoId) {
    const res = await req('POST', `${API_BASE}/video/videos/${videoId}/dislike`);
    if (!res || !res.ok) return null;
    return res.json();
  },

  async getMyInteraction(videoId) {
    const res = await req('GET', `${API_BASE}/video/videos/${videoId}/interaction`);
    if (!res || !res.ok) return { type: 'NONE' };
    return res.json();
  },

  /* ── Comments ─────────────────────── */
  async getComments(videoId) {
    const res = await req('GET', `${API_BASE}/video/videos/${videoId}/comments`);
    if (!res || !res.ok) return [];
    return res.json();
  },

  async addComment(videoId, text) {
    const res = await req('POST', `${API_BASE}/video/videos/${videoId}/comments`, {}, { text });
    if (!res || !res.ok) return null;
    return res.json();
  },

  async toggleCommentLike(commentId) {
    const res = await req('POST', `${API_BASE}/video/comments/${commentId}/like`);
    if (!res || !res.ok) return null;
    return res.json();
  },

  async toggleCommentDislike(commentId) {
    const res = await req('POST', `${API_BASE}/video/comments/${commentId}/dislike`);
    if (!res || !res.ok) return null;
    return res.json();
  },

  /* ── Analytics ────────────────────── */
  async getVideoAnalytics(videoId) {
    const res = await req('GET', `${API_BASE}/video/videos/${videoId}/analytics`);
    if (!res || !res.ok) return null;
    return res.json();
  },

  async getTopAnalytics(limit = 10) {
    const res = await fetch(`${API_BASE}/video/analytics/top?limit=${limit}`);
    if (!res || !res.ok) return [];
    return res.json();
  },

  async getAnalyticsSummary() {
    const res = await fetch(`${API_BASE}/video/analytics/summary`);
    if (!res || !res.ok) return null;
    return res.json();
  },

  /* ── URL Builders ─────────────────── */
  thumbnailUrl: id  => `${API_BASE}/video/thumbnails/${id}`,
  hlsUrl:       id  => `${API_BASE}/video/${id}/master.m3u8`,
  watchUrl:     id  => `watch.html?id=${id}`,
  searchUrl:    q   => `search.html?q=${encodeURIComponent(q)}`
};

// ── UI Utilities ──────────────────────────────────────────────────────────────
const UI = {
  fmtViews(n) {
    if (n == null) return '0';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1)     + 'K';
    return n.toString();
  },

  fmtDate(iso) {
    if (!iso || iso === 'N/A') return '';
    try {
      return new Date(iso).toLocaleDateString('en-IN', { year:'numeric', month:'short', day:'numeric' });
    } catch { return iso; }
  },

  /** Render shared navbar + wire up search / auth UI. Call on every page. */
  initNav() {
    const nav = document.getElementById('navbar');
    if (!nav) return;

    const u = Auth.getUsername();
    const loginBtn    = document.getElementById('nav-login-btn');
    const userSection = document.getElementById('nav-user');
    const userAvatar  = document.getElementById('nav-avatar');
    const ddMenu      = document.getElementById('nav-dd-menu');

    if (Auth.isLoggedIn()) {
      if (loginBtn)    loginBtn.style.display = 'none';
      if (userSection) userSection.style.display = 'flex';
      if (userAvatar)  userAvatar.textContent = (u || 'U')[0].toUpperCase();
    } else {
      if (loginBtn)    loginBtn.style.display = 'inline-flex';
      if (userSection) userSection.style.display = 'none';
    }

    // Search on Enter
    const si = document.getElementById('nav-search-input');
    if (si) {
      si.addEventListener('keydown', e => {
        if (e.key === 'Enter' && si.value.trim())
          window.location.href = API.searchUrl(si.value.trim());
      });
    }
    document.getElementById('nav-search-btn')?.addEventListener('click', () => {
      const v = document.getElementById('nav-search-input')?.value.trim();
      if (v) window.location.href = API.searchUrl(v);
    });

    // Dropdown
    userAvatar?.addEventListener('click', () => ddMenu?.classList.toggle('open'));
    document.addEventListener('click', e => {
      if (!e.target.closest('.dropdown')) ddMenu?.classList.remove('open');
    });
  },

  /** Build a video card element */
  videoCard(v) {
    const a = document.createElement('a');
    a.href      = API.watchUrl(v.id);
    a.className = 'vcard fade-up';
    a.innerHTML = `
      <div class="vcard-thumb">
        <img src="${API.thumbnailUrl(v.id)}" alt="${v.title}"
             onerror="this.parentElement.innerHTML='<div class=\\'vcard-thumb-ph\\'><span class=\\'material-icons\\'>play_circle</span></div>'">
      </div>
      <div class="vcard-info">
        <div class="vcard-title">${escHtml(v.title)}</div>
        <div class="vcard-meta">
          <span class="vcard-uploader">${escHtml(v.uploader)}</span>
          <span>·</span>
          <span><span class="material-icons" style="font-size:13px;vertical-align:-2px">visibility</span> ${UI.fmtViews(v.views)}</span>
          ${v.uploadedAt ? `<span>· ${UI.fmtDate(v.uploadedAt)}</span>` : ''}
        </div>
      </div>`;
    return a;
  },

  showAlert(el, type, msg) {
    const icons = { success:'check_circle', error:'error', info:'info', warn:'warning' };
    el.innerHTML = `<span class="material-icons">${icons[type]||'info'}</span>${escHtml(msg)}`;
    el.className = `alert alert-${type}`;
    el.style.display = 'flex';
  },

  hideAlert(el) { el.style.display = 'none'; }
};

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function doLogout() { Auth.logout(); }

// ── Rate Limit Toast ──────────────────────────────────────────────────────────
let _rlToastTimer = null;
function showRateLimitToast(retrySeconds = 60) {
  // Remove existing toast if present
  let toast = document.getElementById('rate-limit-toast');
  if (toast) toast.remove();
  if (_rlToastTimer) { clearInterval(_rlToastTimer); _rlToastTimer = null; }

  toast = document.createElement('div');
  toast.id = 'rate-limit-toast';
  toast.className = 'rl-toast';
  let remaining = retrySeconds;
  const update = () => {
    toast.innerHTML = `<span class="material-icons">speed</span>
      <span>Rate limit reached. Retry in <strong>${remaining}s</strong></span>
      <button onclick="this.parentElement.remove()" class="rl-toast-close">&times;</button>`;
  };
  update();
  document.body.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => toast.classList.add('show'));

  // Countdown
  _rlToastTimer = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(_rlToastTimer);
      _rlToastTimer = null;
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    } else {
      update();
    }
  }, 1000);
}
