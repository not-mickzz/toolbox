// ── DNS RESOLVERS ─────────────────────────────────────────────────────────────
const RESOLVERS = {
  google:     (name, type) => `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`,
  cloudflare: (name, type) => `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
};

const TYPE_NAMES = {
  1:'A', 2:'NS', 5:'CNAME', 6:'SOA', 12:'PTR', 15:'MX',
  16:'TXT', 28:'AAAA', 33:'SRV', 257:'CAA'
};

// ── STATE ─────────────────────────────────────────────────────────────────────
let currentCategory = 'dns';
let currentTool     = 'dns-lookup';
let activeResolver  = 'google';
let history         = [];

// ── TOOL CONFIGS ──────────────────────────────────────────────────────────────
const TOOLS = {
  // ── DNS ──
  'dns-lookup': {
    category: 'dns', label: 'DNS Lookup', icon: '🔍',
    desc: 'Consulta todos los registros DNS: A, AAAA, MX, NS, TXT, CNAME, SOA, CAA.',
    types: ['A','AAAA','MX','NS','TXT','CNAME','SOA','CAA']
  },
  'a-record': {
    category: 'dns', label: 'A / AAAA', icon: '📍',
    desc: 'Registros de dirección IPv4 (A) e IPv6 (AAAA).',
    types: ['A','AAAA']
  },
  'mx-check': {
    category: 'dns', label: 'MX Records', icon: '📧',
    desc: 'Servidores de correo y sus prioridades.',
    types: ['MX']
  },
  'ns-check': {
    category: 'dns', label: 'NS Records', icon: '🖧',
    desc: 'Nameservers autoritativos del dominio.',
    types: ['NS']
  },
  'txt-check': {
    category: 'dns', label: 'TXT Records', icon: '📄',
    desc: 'Registros TXT: SPF, DKIM, DMARC, verificaciones.',
    types: ['TXT']
  },
  'cname-check': {
    category: 'dns', label: 'CNAME', icon: '↪',
    desc: 'Alias y redirecciones de dominio.',
    types: ['CNAME']
  },
  'soa-check': {
    category: 'dns', label: 'SOA', icon: '⚙',
    desc: 'Start of Authority: servidor primario, serial, TTL.',
    types: ['SOA']
  },
  'propagation': {
    category: 'dns', label: 'Propagation', icon: '🌍',
    desc: 'Compara resultados entre Google DNS y Cloudflare DNS.',
    types: ['A','MX','NS'], multi: true
  },

  // ── IP ──
  'ip-lookup': {
    category: 'ip', label: 'IP Lookup', icon: '🌐',
    desc: 'Geolocalización, ASN, ISP y tipo de IP (residencial, datacenter, VPN).',
  },
  'ip-whois': {
    category: 'ip', label: 'IP WHOIS', icon: '📋',
    desc: 'Información del bloque de red, organización registrante y contactos abuse.',
  },
  'reverse-dns': {
    category: 'ip', label: 'Reverse DNS', icon: '↩',
    desc: 'Resolución inversa PTR: obtiene el hostname asociado a una IP.',
    types: ['PTR']
  },
};

const CATEGORIES = {
  dns: { label: 'DNS',        icon: '⬡' },
  ip:  { label: 'IP Tools',   icon: '◎' },
};

// ── RENDER CATEGORIES & TOOLS ─────────────────────────────────────────────────
function renderNav() {
  const tabsEl = document.getElementById('categoryTabs');
  tabsEl.innerHTML = Object.entries(CATEGORIES).map(([key, cat]) => `
    <button class="cat-tab ${key === currentCategory ? 'active' : ''}"
            onclick="selectCategory('${key}')">
      <span>${cat.icon}</span> ${cat.label}
    </button>
  `).join('');

  const toolsEl = document.getElementById('toolGrid');
  const catTools = Object.entries(TOOLS).filter(([,t]) => t.category === currentCategory);
  toolsEl.innerHTML = catTools.map(([key, tool]) => `
    <button class="tool-btn ${key === currentTool ? 'active' : ''}"
            data-tool="${key}" onclick="selectTool(this)">
      <span class="icon">${tool.icon}</span> ${tool.label}
    </button>
  `).join('');
}

function selectCategory(cat) {
  currentCategory = cat;
  const first = Object.entries(TOOLS).find(([,t]) => t.category === cat);
  if (first) {
    currentTool = first[0];
    document.getElementById('toolDesc').textContent = first[1].desc;
  }
  resetOutput();
  renderNav();
  document.getElementById('resolverRow').style.display = cat === 'dns' ? 'flex' : 'none';
  document.getElementById('domainInput').placeholder = cat === 'dns'
    ? 'ej: google.com, mickzz.xyz'
    : 'ej: 8.8.8.8, 1.1.1.1';
}

function selectTool(btn) {
  currentTool = btn.dataset.tool;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('toolDesc').textContent = TOOLS[currentTool].desc;
  resetOutput();
}

function resetOutput() {
  setStatus('');
  document.getElementById('outputTitle').textContent = 'RESULTADO';
  document.getElementById('outputBody').innerHTML = `
    <div class="empty-state">
      <div class="big-icon">⬡</div>
      <p>INGRESA UN TARGET Y EJECUTA</p>
    </div>`;
}

// ── DNS QUERIES ───────────────────────────────────────────────────────────────
async function queryDNS(name, type, resolver = activeResolver) {
  const url = RESOLVERS[resolver](name, type);
  const res = await fetch(url, { headers: { 'Accept': 'application/dns-json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

function formatRecord(rec, type) {
  if (!rec) return '—';
  switch (type) {
    case 'MX':  return `<span class="rec-priority">${rec.data.split(' ')[0]}</span> ${rec.data.split(' ').slice(1).join(' ')}`;
    case 'TXT': return `<span class="rec-txt">${rec.data}</span>`;
    case 'SOA': {
      const p = rec.data.split(' ');
      return `<span class="rec-key">mname</span> ${p[0]} &nbsp;<span class="rec-key">rname</span> ${p[1]} &nbsp;<span class="rec-key">serial</span> ${p[2]}`;
    }
    default: return rec.data;
  }
}

function statusCode(code) {
  const codes = { 0:'NOERROR', 1:'FORMERR', 2:'SERVFAIL', 3:'NXDOMAIN', 5:'REFUSED' };
  return `<span class="tag ${code === 0 ? 'tag-ok' : 'tag-err'}">${codes[code] || 'CODE '+code}</span>`;
}

function renderDNSResults(results, domain) {
  let html = ''; let total = 0;
  for (const { type, data } of results) {
    const records = data.Answer || data.Authority || [];
    total += records.length;
    html += `<div class="result-block">
      <div class="result-block-header">
        <span class="rec-type-badge type-${type}">${type}</span>
        ${statusCode(data.Status)}
        <span class="rec-count">${records.length} registro${records.length !== 1 ? 's' : ''}</span>
      </div>`;
    if (!records.length) {
      html += `<div class="no-records">Sin registros ${type}</div>`;
    } else {
      html += `<table class="rec-table"><thead><tr><th>NOMBRE</th><th>TTL</th><th>DATO</th></tr></thead><tbody>`;
      for (const rec of records) {
        const t = TYPE_NAMES[rec.type] || type;
        html += `<tr>
          <td class="rec-name">${rec.name}</td>
          <td class="rec-ttl">${rec.TTL}s</td>
          <td class="rec-data">${formatRecord(rec, t)}</td>
        </tr>`;
      }
      html += `</tbody></table>`;
    }
    html += `</div>`;
  }
  return html || `<div class="empty-state"><p>SIN REGISTROS PARA ${domain}</p></div>`;
}

// ── IP QUERIES (CORREGIDO PARA IPINFO.IO) ─────────────────────────────────────
async function fetchIPInfo(ip) {
  const res = await fetch(`https://toolbox.mickzz.workers.dev/ip/${ip}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

function renderIPLookup(data) {
  if (data.readme === "https://ipinfo.io/missingauth") {
    throw new Error("Error de autenticación: Verifica el token en el Worker.");
  }

  const ip      = data.ip       || '—';
  const city    = data.city     || '—';
  const region  = data.region   || '—';
  const country = data.country  || '—';
  const loc     = data.loc      || '0,0';
  const [lat, lon] = loc.split(',').map(Number);
  const isp     = data.org      || '—';
  const zip     = data.postal   || '—';
  const tz      = data.timezone || '—';

  const flag = country !== '—'
    ? String.fromCodePoint(...[...country.toUpperCase()].map(c => 0x1F1E0 - 65 + c.charCodeAt(0)))
    : '🌐';

  const isDatacenter = ['hosting','cloud','amazon','google','server'].some(k => isp.toLowerCase().includes(k));

  return `
    <div class="ip-card">
      <div class="ip-hero">
        <div class="ip-flag">${flag}</div>
        <div>
          <div class="ip-address">${ip}</div>
          <div class="ip-location">${city}, ${region}, ${country}</div>
        </div>
        <div style="margin-left:auto">
            <span class="tag ${isDatacenter ? 'tag-warn' : 'tag-ok'}">${isDatacenter ? 'DATACENTER' : 'RESIDENCIAL'}</span>
        </div>
      </div>
      <div class="ip-grid">
        <div class="ip-row"><span class="ip-key">IP</span><span class="ip-val">${ip}</span></div>
        <div class="ip-row"><span class="ip-key">VERSIÓN</span><span class="ip-val">${ip.includes(':') ? 'IPv6' : 'IPv4'}</span></div>
        <div class="ip-row"><span class="ip-key">PAÍS</span><span class="ip-val">${flag} ${country}</span></div>
        <div class="ip-row"><span class="ip-key">REGIÓN</span><span class="ip-val">${region}</span></div>
        <div class="ip-row"><span class="ip-key">CIUDAD</span><span class="ip-val">${city}</span></div>
        <div class="ip-row"><span class="ip-key">CÓDIGO POSTAL</span><span class="ip-val">${zip}</span></div>
        <div class="ip-row"><span class="ip-key">COORDENADAS</span><span class="ip-val">${lat}, ${lon}</span></div>
        <div class="ip-row"><span class="ip-key">ZONA HORARIA</span><span class="ip-val">${tz}</span></div>
        <div class="ip-row"><span class="ip-key">ISP</span><span class="ip-val">${isp}</span></div>
      </div>
      <div class="map-container">
        <iframe
          src="https://www.openstreetmap.org/export/embed.html?bbox=${lon-0.5}%2C${lat-0.5}%2C${lon+0.5}%2C${lat+0.5}&layer=mapnik&marker=${lat}%2C${lon}"
          style="width:100%;height:220px;border:none;filter:invert(0.85) hue-rotate(180deg);"
          loading="lazy">
        </iframe>
      </div>
    </div>`;
}

// ── RUN TOOL ──────────────────────────────────────────────────────────────────
async function runTool() {
  const input = document.getElementById('domainInput').value.trim().toLowerCase();
  if (!input) { showError('⚠ Ingresa un dominio o IP.'); return; }

  const tool = TOOLS[currentTool];
  const btn  = document.getElementById('runBtn');
  btn.disabled = true;
  setStatus('loading');
  document.getElementById('outputTitle').textContent = tool.label.toUpperCase() + ' — ' + input.toUpperCase();
  document.getElementById('outputBody').innerHTML = `<div class="loading-text"><div class="spinner"></div>Consultando ${input}...</div>`;

  addToHistory(input);

  try {
    let html = '';
    if (currentCategory === 'dns') {
        const results = await Promise.all(tool.types.map(async type => ({ type, data: await queryDNS(input, type) })));
        html = renderDNSResults(results, input);
    } else if (currentCategory === 'ip') {
      if (currentTool === 'ip-lookup') {
        const data = await fetchIPInfo(input);
        html = renderIPLookup(data);
      }
    }
    document.getElementById('outputBody').innerHTML = html;
    setStatus('active');
  } catch (err) {
    setStatus('error');
    showError('❌ ERROR\n\n' + err.message);
  }
  btn.disabled = false;
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function setResolver(btn) {
  document.querySelectorAll('.resolver-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeResolver = btn.dataset.resolver;
}

function addToHistory(val) {
  if (!history.includes(val)) { history.unshift(val); if (history.length > 8) history.pop(); }
  document.getElementById('historyRow').innerHTML = history.map(d => `<span class="hist-tag" onclick="useDomain('${d}')">↺ ${d}</span>`).join('');
}

function useDomain(d) {
  document.getElementById('domainInput').value = d;
  runTool();
}

function copyResult() {
  const text = document.getElementById('outputBody').innerText;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector('.copy-btn');
    btn.textContent = '[ COPIADO ✓ ]';
    setTimeout(() => btn.textContent = '[ COPIAR ]', 2000);
  });
}

function setStatus(state) {
  document.getElementById('statusDot').className = 'status-dot ' + (state || '');
}

function showError(msg) {
  document.getElementById('outputBody').innerHTML = `<div style="color:var(--error);padding:20px;white-space:pre-wrap">${msg}</div>`;
}

document.addEventListener('DOMContentLoaded', () => {
  renderNav();
  document.getElementById('toolDesc').textContent = TOOLS['dns-lookup'].desc;
  document.getElementById('domainInput').addEventListener('keydown', e => { if (e.key === 'Enter') runTool(); });
});
