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
  // Category tabs
  const tabsEl = document.getElementById('categoryTabs');
  tabsEl.innerHTML = Object.entries(CATEGORIES).map(([key, cat]) => `
    <button class="cat-tab ${key === currentCategory ? 'active' : ''}"
            onclick="selectCategory('${key}')">
      <span>${cat.icon}</span> ${cat.label}
    </button>
  `).join('');

  // Tool buttons for current category
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
  // Pick first tool of that category
  const first = Object.entries(TOOLS).find(([,t]) => t.category === cat);
  if (first) {
    currentTool = first[0];
    document.getElementById('toolDesc').textContent = first[1].desc;
  }
  resetOutput();
  renderNav();
  // Show/hide resolver row (only for DNS)
  document.getElementById('resolverRow').style.display = cat === 'dns' ? 'flex' : 'none';
  document.getElementById('domainInput').placeholder = cat === 'dns'
    ? 'ej: google.com, mickzz.xyz'
    : 'ej: 8.8.8.8, 1.1.1.1, 2606:4700:4700::1111';
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
        ${data.AD ? '<span class="tag tag-ok">DNSSEC ✓</span>' : ''}
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
  if (!total) html = `<div class="empty-state"><div class="big-icon">◌</div><p>SIN REGISTROS PARA ${domain}</p></div>`;
  return html;
}

function renderPropagation(gRes, cRes) {
  let html = `<div class="propagation-grid">`;
  for (const type of TOOLS['propagation'].types) {
    const gR = gRes.find(r => r.type === type)?.data?.Answer || [];
    const cR = cRes.find(r => r.type === type)?.data?.Answer || [];
    const match = gR.map(r=>r.data).sort().join('|') === cR.map(r=>r.data).sort().join('|');
    html += `<div class="prop-row">
      <div class="prop-type">
        <span class="rec-type-badge type-${type}">${type}</span>
        <span class="tag ${match ? 'tag-ok' : 'tag-warn'}">${match ? '✓ IGUAL' : '⚠ DIFIERE'}</span>
      </div>
      <div class="prop-cols">
        <div class="prop-col">
          <div class="prop-resolver">🌐 GOOGLE DNS (8.8.8.8)</div>
          ${gR.length ? gR.map(r=>`<div class="prop-val">${r.data}</div>`).join('') : '<div class="prop-empty">Sin registros</div>'}
        </div>
        <div class="prop-col">
          <div class="prop-resolver">🟠 CLOUDFLARE (1.1.1.1)</div>
          ${cR.length ? cR.map(r=>`<div class="prop-val">${r.data}</div>`).join('') : '<div class="prop-empty">Sin registros</div>'}
        </div>
      </div>
    </div>`;
  }
  return html + `</div>`;
}

// ── IP QUERIES ────────────────────────────────────────────────────────────────
async function fetchIPInfo(ip) {
  // Usa el Worker como proxy para evitar CORS
  const res = await fetch(`https://toolbox.mickzz.workers.dev/ip/${ip}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

async function fetchIPWHOIS(ip) {
  const res = await fetch(`https://rdap.arin.net/registry/ip/${ip}`);
  if (!res.ok) {
    // fallback to RIPE
    const res2 = await fetch(`https://rdap.db.ripe.net/ip/${ip}`);
    if (!res2.ok) throw new Error('No se encontró información WHOIS');
    return await res2.json();
  }
  return await res.json();
}

function renderIPLookup(data) {
  if (data.message) throw new Error(data.message);

  // freeipapi.com field names
  const ip      = data.ipAddress   || '—';
  const city    = data.cityName    || '—';
  const region  = data.regionName  || '—';
  const country = data.countryName || '—';
  const cc      = data.countryCode || '';
  const lat     = data.latitude    || 0;
  const lon     = data.longitude   || 0;
  const tz      = data.timeZone    || '—';
  const isp     = data.isp         || '—';
  const zip     = data.zipCode     || '—';
  const ver     = data.ipVersion === 6 ? 'IPv6' : 'IPv4';
  const langs   = Array.isArray(data.language) ? data.language.map(l => l.name).join(', ') : '—';
  const curr    = Array.isArray(data.currency) ? data.currency.map(c => `${c.name} (${c.code})`).join(', ') : '—';

  const flag = cc
    ? String.fromCodePoint(...[...cc.toUpperCase()].map(c => 0x1F1E0 - 65 + c.charCodeAt(0)))
    : '🌐';

  const ispLower = isp.toLowerCase();
  const isDatacenter = ['hosting','cloud','amazon','google','digital ocean','linode','vultr','ovh','hetzner','cloudflare'].some(k => ispLower.includes(k));
  const typeTag = isDatacenter
    ? '<span class="tag tag-warn">DATACENTER</span>'
    : '<span class="tag tag-ok">RESIDENCIAL</span>';

  return `
    <div class="ip-card">
      <div class="ip-hero">
        <div class="ip-flag">${flag}</div>
        <div>
          <div class="ip-address">${ip}</div>
          <div class="ip-location">${city}, ${region}, ${country}</div>
        </div>
        <div style="margin-left:auto">${typeTag}</div>
      </div>
      <div class="ip-grid">
        <div class="ip-row"><span class="ip-key">IP</span><span class="ip-val">${ip}</span></div>
        <div class="ip-row"><span class="ip-key">VERSIÓN</span><span class="ip-val">${ver}</span></div>
        <div class="ip-row"><span class="ip-key">PAÍS</span><span class="ip-val">${flag} ${country} (${cc})</span></div>
        <div class="ip-row"><span class="ip-key">REGIÓN</span><span class="ip-val">${region}</span></div>
        <div class="ip-row"><span class="ip-key">CIUDAD</span><span class="ip-val">${city}</span></div>
        <div class="ip-row"><span class="ip-key">CÓDIGO POSTAL</span><span class="ip-val">${zip}</span></div>
        <div class="ip-row"><span class="ip-key">COORDENADAS</span><span class="ip-val">${lat}, ${lon}</span></div>
        <div class="ip-row"><span class="ip-key">ZONA HORARIA</span><span class="ip-val">${tz}</span></div>
        <div class="ip-row"><span class="ip-key">ISP</span><span class="ip-val">${isp}</span></div>
        <div class="ip-row"><span class="ip-key">IDIOMAS</span><span class="ip-val">${langs}</span></div>
        <div class="ip-row"><span class="ip-key">MONEDA</span><span class="ip-val">${curr}</span></div>
      </div>
      <div class="map-container">
        <iframe
          src="https://www.openstreetmap.org/export/embed.html?bbox=${lon-1}%2C${lat-1}%2C${lon+1}%2C${lat+1}&layer=mapnik&marker=${lat}%2C${lon}"
          style="width:100%;height:220px;border:none;filter:invert(0.85) hue-rotate(180deg);"
          loading="lazy">
        </iframe>
      </div>
    </div>`;
}

function renderIPWHOIS(data) {
  const name   = data.name || data.handle || '—';
  const desc   = Array.isArray(data.remarks) ? data.remarks.map(r => r.description?.join(' ')).join(' | ') : '—';
  const start  = data.startAddress || '—';
  const end    = data.endAddress   || '—';
  const org    = data.entities?.find(e => e.roles?.includes('registrant'))?.vcardArray?.[1]?.find(v=>v[0]==='fn')?.[3] || '—';
  const abuse  = data.entities?.flatMap(e => e.entities || []).find(e => e.roles?.includes('abuse'))?.vcardArray?.[1]?.find(v=>v[0]==='email')?.[3] || '—';
  const reg    = data.entities?.find(e => e.roles?.includes('registrant'))?.vcardArray?.[1]?.find(v=>v[0]==='adr')?.[3]?.join(', ') || '—';
  const events = data.events || [];
  const registered = events.find(e=>e.eventAction==='registration')?.eventDate?.slice(0,10) || '—';
  const updated    = events.find(e=>e.eventAction==='last changed')?.eventDate?.slice(0,10) || '—';

  return `
    <div class="result-block">
      <div class="result-block-header">
        <span class="rec-type-badge type-NS">WHOIS</span>
        <span class="rec-count">${name}</span>
      </div>
      <table class="rec-table"><tbody>
        <tr><td class="rec-name">NOMBRE</td><td class="rec-data">${name}</td></tr>
        <tr><td class="rec-name">ORGANIZACIÓN</td><td class="rec-data">${org}</td></tr>
        <tr><td class="rec-name">RANGO IP</td><td class="rec-data">${start} — ${end}</td></tr>
        <tr><td class="rec-name">DESCRIPCIÓN</td><td class="rec-data">${desc}</td></tr>
        <tr><td class="rec-name">ABUSO</td><td class="rec-data">${abuse}</td></tr>
        <tr><td class="rec-name">REGISTRADO</td><td class="rec-data">${registered}</td></tr>
        <tr><td class="rec-name">ACTUALIZADO</td><td class="rec-data">${updated}</td></tr>
      </tbody></table>
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
  document.getElementById('outputBody').innerHTML =
    `<div class="loading-text"><div class="spinner"></div>Consultando ${input}...</div>`;

  addToHistory(input);

  try {
    let html = '';

    if (currentCategory === 'dns') {
      if (currentTool === 'propagation') {
        const [g, c] = await Promise.all([
          Promise.all(tool.types.map(async t => ({ type:t, data: await queryDNS(input, t, 'google') }))),
          Promise.all(tool.types.map(async t => ({ type:t, data: await queryDNS(input, t, 'cloudflare') })))
        ]);
        html = renderPropagation(g, c);
      } else {
        const results = await Promise.all(
          tool.types.map(async type => ({ type, data: await queryDNS(input, type) }))
        );
        html = renderDNSResults(results, input);
      }

    } else if (currentCategory === 'ip') {
      if (currentTool === 'ip-lookup') {
        const data = await fetchIPInfo(input);
        html = renderIPLookup(data);
      } else if (currentTool === 'ip-whois') {
        const data = await fetchIPWHOIS(input);
        html = renderIPWHOIS(data);
      } else if (currentTool === 'reverse-dns') {
        // Reverse the IP for PTR lookup
        const reversed = input.split('.').reverse().join('.') + '.in-addr.arpa';
        const results = [{ type: 'PTR', data: await queryDNS(reversed, 'PTR') }];
        html = renderDNSResults(results, input);
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
  document.getElementById('historyRow').innerHTML = history.map(d =>
    `<span class="hist-tag" onclick="useDomain('${d}')">↺ ${d}</span>`
  ).join('');
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
  document.getElementById('outputBody').innerHTML =
    `<div style="color:var(--error);padding:20px;white-space:pre-wrap">${msg}</div>`;
}

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderNav();
  document.getElementById('toolDesc').textContent = TOOLS['dns-lookup'].desc;
  document.getElementById('domainInput')
    .addEventListener('keydown', e => { if (e.key === 'Enter') runTool(); });
});