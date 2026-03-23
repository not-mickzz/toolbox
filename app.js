// ── CONFIG ────────────────────────────────────────────────────────────────────
const WORKER_URL = 'https://toolbox.mickzz.workers.dev';

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
const sslCache      = {}; // { domain: sslLabsData } — persiste hasta F5

// ── TOOL CONFIGS ──────────────────────────────────────────────────────────────
const TOOLS = {
  // DNS
  'dns-lookup':  { category:'dns', label:'DNS Lookup',  icon:'🔍', desc:'Todos los registros DNS: A, AAAA, MX, NS, TXT, CNAME, SOA, CAA.', types:['A','AAAA','MX','NS','TXT','CNAME','SOA','CAA'] },
  'a-record':    { category:'dns', label:'A / AAAA',    icon:'📍', desc:'Direcciones IPv4 (A) e IPv6 (AAAA).', types:['A','AAAA'] },
  'mx-check':    { category:'dns', label:'MX Records',  icon:'📧', desc:'Servidores de correo y prioridades.', types:['MX'] },
  'ns-check':    { category:'dns', label:'NS Records',  icon:'🖧', desc:'Nameservers autoritativos del dominio.', types:['NS'] },
  'txt-check':   { category:'dns', label:'TXT Records', icon:'📄', desc:'Registros TXT: SPF, DKIM, DMARC, verificaciones.', types:['TXT'] },
  'cname-check': { category:'dns', label:'CNAME',       icon:'↪', desc:'Alias y redirecciones de dominio.', types:['CNAME'] },
  'soa-check':   { category:'dns', label:'SOA',         icon:'⚙', desc:'Start of Authority: servidor primario, serial, TTL.', types:['SOA'] },
  'propagation': { category:'dns', label:'Propagation', icon:'🌍', desc:'Compara Google DNS vs Cloudflare DNS lado a lado.', types:['A','MX','NS'], multi:true },
  'whois':       { category:'dns', label:'WHOIS',       icon:'🏷️', desc:'Información de registro del dominio: registrador, fechas, nameservers y estado.' },
  // IP
  'ip-lookup':   { category:'ip', label:'IP Lookup',   icon:'🌐', desc:'Geolocalización, ASN, ISP, zona horaria y mapa interactivo.' },
  'ip-whois':    { category:'ip', label:'IP WHOIS',    icon:'📋', desc:'Bloque de red, organización registrante y contacto de abuso.' },
  'reverse-dns': { category:'ip', label:'Reverse DNS', icon:'↩', desc:'Resolución inversa PTR: hostname asociado a una IP.', types:['PTR'] },
  // SSL
  'ssl-check':   { category:'ssl', label:'SSL Check',   icon:'🔒', desc:'Análisis completo SSL/TLS con puntuación A+/A/B/C/D/F (via SSL Labs).' },
  'ssl-cert':    { category:'ssl', label:'Certificado', icon:'📜', desc:'Detalles del certificado: CA, expiración, SANs, cadena de confianza.' },
  // Web
  'web-headers': { category:'web', label:'HTTP Headers',    icon:'🛡️', desc:'Analiza headers de seguridad: HSTS, CSP, X-Frame-Options y más.' },
  'web-timing':  { category:'web', label:'Response Time',   icon:'⚡', desc:'Tiempo de respuesta del servidor, TTFB y estado HTTP.' },
  'web-tech':    { category:'web', label:'Technologies',    icon:'🔬', desc:'Detecta CMS, frameworks, servidores web y librerías.' },
  // Security
  'blacklist':   { category:'security', label:'Blacklist Check', icon:'🚫', desc:'Verifica si una IP está en listas negras de spam, malware y botnets (DNSBL).' },
  // Email
  'email-security': { category:'email', label:'Email Security', icon:'🛡️', desc:'Análisis completo de seguridad del correo: SPF, DKIM, DMARC con puntuación.' },
  'spf-analyzer':   { category:'email', label:'SPF Analyzer',   icon:'📋', desc:'Analiza el registro SPF: mecanismos, directivas y posibles problemas.' },
  'dkim-checker':   { category:'email', label:'DKIM Checker',   icon:'🔑', desc:'Busca y verifica selectores DKIM comunes del dominio.' },
  'dmarc-analyzer': { category:'email', label:'DMARC Analyzer', icon:'📊', desc:'Analiza la política DMARC: modo, reportes y configuración.' },
};

const CATEGORIES = {
  dns:      { label:'DNS',       icon:'⬡' },
  ip:       { label:'IP Tools',  icon:'◎' },
  ssl:      { label:'SSL / TLS', icon:'🔒' },
  web:      { label:'Web',       icon:'🌍' },
  security: { label:'Security',  icon:'🚫' },
  email:    { label:'Email',     icon:'📧' },
};

// ── NAV ───────────────────────────────────────────────────────────────────────
function renderNav() {
  document.getElementById('categoryTabs').innerHTML = Object.entries(CATEGORIES).map(([key, cat]) =>
    `<button class="cat-tab ${key === currentCategory ? 'active' : ''}" onclick="selectCategory('${key}')">
      <span>${cat.icon}</span> ${cat.label}
    </button>`
  ).join('');

  document.getElementById('toolGrid').innerHTML = Object.entries(TOOLS)
    .filter(([,t]) => t.category === currentCategory)
    .map(([key, tool]) =>
      `<button class="tool-btn ${key === currentTool ? 'active' : ''}" data-tool="${key}" onclick="selectTool(this)">
        <span class="icon">${tool.icon}</span> ${tool.label}
      </button>`
    ).join('');
}

function selectCategory(cat) {
  currentCategory = cat;
  const first = Object.entries(TOOLS).find(([,t]) => t.category === cat);
  if (first) { currentTool = first[0]; document.getElementById('toolDesc').textContent = first[1].desc; }
  resetOutput();
  renderNav();
  document.getElementById('resolverRow').style.display = cat === 'dns' ? 'flex' : 'none';
  document.getElementById('domainInput').placeholder = cat === 'dns'
    ? 'ej: google.com, mickzz.xyz'
    : cat === 'ssl' || cat === 'web' || cat === 'email'
    ? 'ej: mickzz.xyz, google.com'
    : cat === 'security'
    ? 'ej: 8.8.8.8, 1.2.3.4'
    : 'ej: 8.8.8.8, 1.1.1.1, 2606:4700::1111';
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
  document.getElementById('outputBody').innerHTML =
    `<div class="empty-state"><div class="big-icon">⬡</div><p>INGRESA UN TARGET Y EJECUTA</p></div>`;
}

// ── DNS ───────────────────────────────────────────────────────────────────────
async function queryDNS(name, type, resolver = activeResolver) {
  const res = await fetch(RESOLVERS[resolver](name, type), { headers: { 'Accept': 'application/dns-json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

function formatRecord(rec, type) {
  switch (type) {
    case 'MX':  return `<span class="rec-priority">${rec.data.split(' ')[0]}</span> ${rec.data.split(' ').slice(1).join(' ')}`;
    case 'TXT': return `<span class="rec-txt">${rec.data}</span>`;
    case 'SOA': { const p = rec.data.split(' '); return `<span class="rec-key">mname</span> ${p[0]} &nbsp;<span class="rec-key">rname</span> ${p[1]} &nbsp;<span class="rec-key">serial</span> ${p[2]}`; }
    default: return rec.data;
  }
}

function statusBadge(code) {
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
        ${statusBadge(data.Status)}
        <span class="rec-count">${records.length} registro${records.length !== 1 ? 's' : ''}</span>
        ${data.AD ? '<span class="tag tag-ok">DNSSEC ✓</span>' : ''}
      </div>`;
    if (!records.length) {
      html += `<div class="no-records">Sin registros ${type}</div>`;
    } else {
      html += `<table class="rec-table"><thead><tr><th>NOMBRE</th><th>TTL</th><th>DATO</th></tr></thead><tbody>`;
      for (const rec of records) {
        html += `<tr><td class="rec-name">${rec.name}</td><td class="rec-ttl">${rec.TTL}s</td><td class="rec-data">${formatRecord(rec, TYPE_NAMES[rec.type] || type)}</td></tr>`;
      }
      html += `</tbody></table>`;
    }
    html += `</div>`;
  }
  if (!total) html = `<div class="empty-state"><div class="big-icon">◌</div><p>SIN REGISTROS PARA ${domain}</p></div>`;
  return html;
}

function renderPropagation(gRes, cRes) {
  return `<div class="propagation-grid">` +
    TOOLS['propagation'].types.map(type => {
      const gR = gRes.find(r => r.type === type)?.data?.Answer || [];
      const cR = cRes.find(r => r.type === type)?.data?.Answer || [];
      const match = gR.map(r=>r.data).sort().join('|') === cR.map(r=>r.data).sort().join('|');
      return `<div class="prop-row">
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
    }).join('') + `</div>`;
}

// ── IP ────────────────────────────────────────────────────────────────────────
async function fetchIPInfo(ip) {
  const res = await fetch(`${WORKER_URL}/ip/${ip}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

async function fetchIPWHOIS(ip) {
  const res = await fetch(`https://rdap.arin.net/registry/ip/${ip}`);
  if (!res.ok) {
    const res2 = await fetch(`https://rdap.db.ripe.net/ip/${ip}`);
    if (!res2.ok) throw new Error('No se encontró información WHOIS');
    return await res2.json();
  }
  return await res.json();
}

function renderIPLookup(data) {
  if (data.error) throw new Error(data.error);

  // ipinfo.io fields
  const ip      = data.ip       || '—';
  const city    = data.city     || '—';
  const region  = data.region   || '—';
  const country = data.country  || '—';
  const org     = data.org      || '—';
  const tz      = data.timezone || '—';
  const postal  = data.postal   || '—';
  const hostname= data.hostname || '—';
  const coords  = data.loc      || '0,0';
  const [lat, lon] = coords.split(',').map(Number);

  // Country flag using flagcdn.com
  const flag = country && country.length === 2
    ? `<img src="https://flagcdn.com/24x18/${country.toLowerCase()}.png" alt="${country}" style="vertical-align:middle;margin-right:4px;">`
    : '🌐';

  const orgLower = org.toLowerCase();
  const isDatacenter = ['hosting','cloud','amazon','google','digitalocean','linode','vultr','ovh','hetzner','cloudflare','as13335','as15169','as16509'].some(k => orgLower.includes(k));
  const typeTag = isDatacenter
    ? '<span class="tag tag-warn">DATACENTER</span>'
    : '<span class="tag tag-ok">RESIDENCIAL</span>';

  return `
    <div class="ip-card">
      <div class="ip-hero">
        <div class="ip-flag">${country && country.length === 2 ? `<img src="https://flagcdn.com/48x36/${country.toLowerCase()}.png" alt="${country}" style="width:48px;">` : '🌐'}</div>
        <div>
          <div class="ip-address">${ip}</div>
          <div class="ip-location">${city}, ${region}, ${country}</div>
        </div>
        <div style="margin-left:auto">${typeTag}</div>
      </div>
      <div class="ip-grid">
        <div class="ip-row"><span class="ip-key">IP</span><span class="ip-val">${ip}</span></div>
        <div class="ip-row"><span class="ip-key">HOSTNAME</span><span class="ip-val">${hostname}</span></div>
        <div class="ip-row"><span class="ip-key">PAÍS</span><span class="ip-val">${flag} ${country}</span></div>
        <div class="ip-row"><span class="ip-key">REGIÓN</span><span class="ip-val">${region}</span></div>
        <div class="ip-row"><span class="ip-key">CIUDAD</span><span class="ip-val">${city}</span></div>
        <div class="ip-row"><span class="ip-key">CÓDIGO POSTAL</span><span class="ip-val">${postal}</span></div>
        <div class="ip-row"><span class="ip-key">COORDENADAS</span><span class="ip-val">${coords}</span></div>
        <div class="ip-row"><span class="ip-key">ZONA HORARIA</span><span class="ip-val">${tz}</span></div>
        <div class="ip-row"><span class="ip-key">ISP / ORG</span><span class="ip-val">${org}</span></div>
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
  const name  = data.name || data.handle || '—';
  const start = data.startAddress || '—';
  const end   = data.endAddress   || '—';
  const org   = data.entities?.find(e => e.roles?.includes('registrant'))?.vcardArray?.[1]?.find(v=>v[0]==='fn')?.[3] || '—';
  const abuse = data.entities?.flatMap(e => e.entities||[]).find(e => e.roles?.includes('abuse'))?.vcardArray?.[1]?.find(v=>v[0]==='email')?.[3] || '—';
  const registered = data.events?.find(e=>e.eventAction==='registration')?.eventDate?.slice(0,10) || '—';
  const updated    = data.events?.find(e=>e.eventAction==='last changed')?.eventDate?.slice(0,10) || '—';

  return `<div class="result-block">
    <div class="result-block-header">
      <span class="rec-type-badge type-NS">WHOIS</span>
      <span class="rec-count">${name}</span>
    </div>
    <table class="rec-table"><tbody>
      <tr><td class="rec-name">NOMBRE</td><td class="rec-data">${name}</td></tr>
      <tr><td class="rec-name">ORGANIZACIÓN</td><td class="rec-data">${org}</td></tr>
      <tr><td class="rec-name">RANGO IP</td><td class="rec-data">${start} — ${end}</td></tr>
      <tr><td class="rec-name">ABUSO</td><td class="rec-data">${abuse}</td></tr>
      <tr><td class="rec-name">REGISTRADO</td><td class="rec-data">${registered}</td></tr>
      <tr><td class="rec-name">ACTUALIZADO</td><td class="rec-data">${updated}</td></tr>
    </tbody></table>
  </div>`;
}

// ── SSL ───────────────────────────────────────────────────────────────────────
async function fetchSSLLabsData(domain) {
  // Return cached result if available
  if (sslCache[domain]) return sslCache[domain];

  // Start new analysis
  await fetch(`${WORKER_URL}/ssl/${encodeURIComponent(domain)}?startNew=on`);

  // Poll until READY
  let data;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const res = await fetch(`${WORKER_URL}/ssl/${encodeURIComponent(domain)}`);
    data = await res.json();
    if (data.status === 'ERROR') break;
    if (data.status === 'READY') break;
  }

  // SSL Labs sometimes returns READY without certs[] on first fetch.
  // Do up to 3 extra fetches until certs arrive.
  if (data?.status === 'READY') {
    for (let i = 0; i < 3 && !data.certs?.length; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const res = await fetch(`${WORKER_URL}/ssl/${encodeURIComponent(domain)}`);
      const fresh = await res.json();
      if (fresh.certs?.length) data = fresh;
    }
    sslCache[domain] = data;
  }

  return data;
}

function gradeColor(grade) {
  if (!grade) return 'var(--text-dim)';
  if (grade.startsWith('A')) return 'var(--success)';
  if (grade.startsWith('B')) return 'var(--accent)';
  if (grade.startsWith('C')) return 'var(--warn)';
  return 'var(--error)';
}

async function fetchAndRenderSSL(domain, mode) {
  const data = await fetchSSLLabsData(domain);

  if (data.status === 'ERROR' || !data.endpoints?.length) {
    return `<div style="color:var(--error);padding:20px">❌ No se pudo analizar ${domain}.<br><span style="font-size:11px;color:var(--text-dim)">${data.statusMessage || 'Verifica que el dominio tenga HTTPS.'}</span></div>`;
  }

  const ep   = data.endpoints[0];
  const det  = ep.details || {};

  // certChains[0].certIds[0] is the leaf cert ID — find it in data.certs[]
  const leafCertId = det.certChains?.[0]?.certIds?.[0];
  const cert = leafCertId
    ? (data.certs || []).find(c => c.id === leafCertId) || (data.certs || [])[0] || {}
    : (data.certs || [])[0] || {};

  const grade = ep.grade || '?';

  // Dates — SSL Labs uses milliseconds
  const notBefore = cert.notBefore ? new Date(cert.notBefore).toLocaleDateString('es-CL') : '—';
  const notAfter  = cert.notAfter  ? new Date(cert.notAfter).toLocaleDateString('es-CL')  : '—';
  const daysLeft  = cert.notAfter  ? Math.ceil((cert.notAfter - Date.now()) / 86400000)    : null;
  const daysTag   = daysLeft !== null
    ? `<span class="tag ${daysLeft > 30 ? 'tag-ok' : daysLeft > 7 ? 'tag-warn' : 'tag-err'}">${daysLeft} días</span>`
    : '';

  // Protocols
  const protos = (det.protocols || []).map(p =>
    `<span class="tag ${p.name === 'TLS' && parseFloat(p.version) >= 1.2 ? 'tag-ok' : 'tag-err'}">${p.name} ${p.version}</span>`
  ).join(' ');

  // SANs
  const sans = (cert.altNames || cert.commonNames || []).slice(0, 8).join(', ') || '—';

  // Issuer — SSL Labs uses issuerSubject
  const issuer = cert.issuerSubject?.match(/CN=([^,]+)/)?.[1] || cert.issuerSubject || '—';

  // Key info
  const keyInfo = [cert.keyAlg, cert.keySize ? cert.keySize + 'bit' : ''].filter(Boolean).join(' ') || '—';

  // Vulnerabilities
  const vulns = [
    det.heartbleed     ? '❌ Heartbleed'    : '✅ Heartbleed OK',
    det.poodle         ? '❌ POODLE'        : '✅ POODLE OK',
    det.freak          ? '❌ FREAK'         : '✅ FREAK OK',
    det.logjam         ? '❌ LogJam'        : '✅ LogJam OK',
    det.drownVulnerable? '❌ DROWN'         : '✅ DROWN OK',
    det.ticketbleed    ? '❌ Ticketbleed'   : '✅ Ticketbleed OK',
  ];

  // HSTS
  const hsts = det.hstsPolicy?.status === 'present'
    ? `<span class="tag tag-ok">HSTS ✓</span>`
    : `<span class="tag tag-err">HSTS ✗</span>`;

  if (mode === 'cert') {
    return `
      <div class="result-block">
        <div class="result-block-header">
          <span class="rec-type-badge type-A">CERTIFICADO</span>
          ${daysTag}
          <span class="tag ${cert.issues ? 'tag-err' : 'tag-ok'}">${cert.issues ? '⚠ ISSUES' : '✓ VÁLIDO'}</span>
        </div>
        <table class="rec-table"><tbody>
          <tr><td class="rec-name">SUJETO</td><td class="rec-data">${cert.subject || '—'}</td></tr>
          <tr><td class="rec-name">EMISOR</td><td class="rec-data">${issuer}</td></tr>
          <tr><td class="rec-name">VÁLIDO DESDE</td><td class="rec-data">${notBefore}</td></tr>
          <tr><td class="rec-name">VÁLIDO HASTA</td><td class="rec-data">${notAfter} ${daysTag}</td></tr>
          <tr><td class="rec-name">TIPO</td><td class="rec-data">${keyInfo}</td></tr>
          <tr><td class="rec-name">FIRMA</td><td class="rec-data">${cert.sigAlg || '—'}</td></tr>
          <tr><td class="rec-name">DOMINIOS (SAN)</td><td class="rec-data">${sans}</td></tr>
          <tr><td class="rec-name">SERIAL</td><td class="rec-data" style="font-size:11px">${cert.serialNumber || '—'}</td></tr>
        </tbody></table>
      </div>`;
  }

  // Full mode
  return `
    <div class="ssl-hero">
      <div class="ssl-grade" style="color:${gradeColor(grade)}">${grade}</div>
      <div>
        <div style="font-size:16px;color:var(--text-bright);font-family:'Space Mono',monospace">${data.host}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:4px">${ep.ipAddress || ''}</div>
      </div>
      <div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">${hsts} ${protos}</div>
    </div>

    <div class="result-block" style="margin-top:16px">
      <div class="result-block-header"><span class="rec-type-badge type-A">CERTIFICADO</span>${daysTag}</div>
      <table class="rec-table"><tbody>
        <tr><td class="rec-name">EMISOR</td><td class="rec-data">${issuer}</td></tr>
        <tr><td class="rec-name">VÁLIDO HASTA</td><td class="rec-data">${notAfter} ${daysTag}</td></tr>
        <tr><td class="rec-name">TIPO</td><td class="rec-data">${keyInfo}</td></tr>
        <tr><td class="rec-name">DOMINIOS</td><td class="rec-data">${sans}</td></tr>
      </tbody></table>
    </div>

    <div class="result-block">
      <div class="result-block-header"><span class="rec-type-badge type-TXT">VULNERABILIDADES</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;padding:8px 0">
        ${vulns.map(v => `<span class="tag ${v.startsWith('✅') ? 'tag-ok' : 'tag-err'}">${v}</span>`).join('')}
      </div>
    </div>`;
}

async function fetchSSLHeaders(domain) {
  // Use a CORS proxy to check headers
  const res = await fetch(`${WORKER_URL}/headers/${encodeURIComponent(domain)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const headers = await res.json();

  const checks = [
    { key: 'strict-transport-security', label: 'HSTS',              good: v => !!v },
    { key: 'content-security-policy',   label: 'CSP',               good: v => !!v },
    { key: 'x-frame-options',           label: 'X-Frame-Options',   good: v => !!v },
    { key: 'x-content-type-options',    label: 'X-Content-Type',    good: v => v?.includes('nosniff') },
    { key: 'referrer-policy',           label: 'Referrer-Policy',   good: v => !!v },
    { key: 'permissions-policy',        label: 'Permissions-Policy',good: v => !!v },
    { key: 'x-xss-protection',         label: 'X-XSS-Protection',  good: v => !!v },
  ];

  const score = checks.filter(c => c.good(headers[c.key])).length;
  const total = checks.length;
  const pct   = Math.round(score / total * 100);

  return `
    <div class="result-block">
      <div class="result-block-header">
        <span class="rec-type-badge type-NS">SECURITY HEADERS</span>
        <span class="tag ${pct >= 80 ? 'tag-ok' : pct >= 50 ? 'tag-warn' : 'tag-err'}">${score}/${total} — ${pct}%</span>
      </div>
      <table class="rec-table"><tbody>
        ${checks.map(c => {
          const val = headers[c.key];
          const ok  = c.good(val);
          return `<tr>
            <td class="rec-name"><span class="tag ${ok ? 'tag-ok' : 'tag-err'}">${ok ? '✓' : '✗'}</span> ${c.label}</td>
            <td class="rec-data" style="font-size:11px">${val || '<span style="color:var(--text-dim)">No presente</span>'}</td>
          </tr>`;
        }).join('')}
      </tbody></table>
    </div>`;
}

async function fetchCertInfo(domain) {
  // Use SSL Labs data (same as SSL Check, uses cache if available)
  const data = await fetchSSLLabsData(domain);

  if (data.status === 'ERROR' || !data.endpoints?.length) {
    return `<div style="color:var(--error);padding:20px">❌ No se pudo analizar ${domain}.</div>`;
  }

  return await fetchAndRenderSSL(domain, 'cert');
}

// ── WEB ───────────────────────────────────────────────────────────────────────
async function fetchWebTiming(domain) {
  const start = performance.now();
  const res = await fetch(`${WORKER_URL}/headers/${encodeURIComponent(domain)}`);
  const elapsed = Math.round(performance.now() - start);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const headers = await res.json();

  const status = headers['x-worker-status'] || '200';
  const server = headers['server'] || headers['x-powered-by'] || '—';
  const contentType = headers['content-type'] || '—';
  const cacheControl = headers['cache-control'] || '—';
  const via = headers['via'] || '—';
  const cf = headers['cf-ray'] ? '✅ Cloudflare' : '—';

  const speedTag = elapsed < 300
    ? `<span class="tag tag-ok">⚡ RÁPIDO</span>`
    : elapsed < 1000
    ? `<span class="tag tag-warn">⏱ NORMAL</span>`
    : `<span class="tag tag-err">🐌 LENTO</span>`;

  return `
    <div class="result-block">
      <div class="result-block-header">
        <span class="rec-type-badge type-A">RESPONSE TIME</span>
        <span class="tag tag-ok">${elapsed}ms</span>
        ${speedTag}
      </div>
      <table class="rec-table"><tbody>
        <tr><td class="rec-name">TIEMPO TOTAL</td><td class="rec-data" style="font-size:18px;color:var(--accent);font-family:'Space Mono',monospace">${elapsed}ms</td></tr>
        <tr><td class="rec-name">SERVIDOR</td><td class="rec-data">${server}</td></tr>
        <tr><td class="rec-name">CDN</td><td class="rec-data">${cf}</td></tr>
        <tr><td class="rec-name">VIA</td><td class="rec-data">${via}</td></tr>
        <tr><td class="rec-name">CONTENT-TYPE</td><td class="rec-data">${contentType}</td></tr>
        <tr><td class="rec-name">CACHE-CONTROL</td><td class="rec-data">${cacheControl}</td></tr>
      </tbody></table>
    </div>`;
}

async function fetchWebTech(domain) {
  const res = await fetch(`${WORKER_URL}/headers/${encodeURIComponent(domain)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const headers = await res.json();

  // Detect technologies from headers
  const techs = [];

  // Server
  const server = headers['server'] || '';
  if (server.toLowerCase().includes('nginx'))      techs.push({ cat:'Servidor',  name:'Nginx',           tag:'tag-ok' });
  if (server.toLowerCase().includes('apache'))     techs.push({ cat:'Servidor',  name:'Apache',          tag:'tag-ok' });
  if (server.toLowerCase().includes('caddy'))      techs.push({ cat:'Servidor',  name:'Caddy',           tag:'tag-ok' });
  if (server.toLowerCase().includes('iis'))        techs.push({ cat:'Servidor',  name:'IIS (Microsoft)', tag:'tag-info' });
  if (server.toLowerCase().includes('openresty'))  techs.push({ cat:'Servidor',  name:'OpenResty',       tag:'tag-ok' });
  // Cloudflare — detected once via cf-ray or server header (not both)
  const isCloudflare = headers['cf-ray'] || server.toLowerCase().includes('cloudflare');
  if (isCloudflare) techs.push({ cat:'CDN', name:'Cloudflare', tag:'tag-ok' });
  if (headers['x-amz-cf-id'])                   techs.push({ cat:'CDN',       name:'AWS CloudFront',  tag:'tag-ok' });
  if (headers['x-azure-ref'])                   techs.push({ cat:'CDN',       name:'Azure CDN',       tag:'tag-ok' });
  if (headers['x-fastly-request-id'])           techs.push({ cat:'CDN',       name:'Fastly',          tag:'tag-ok' });
  if (headers['x-vercel-id'])                   techs.push({ cat:'Hosting',   name:'Vercel',          tag:'tag-ok' });
  if (headers['x-netlify'] || headers['netlify']) techs.push({ cat:'Hosting', name:'Netlify',         tag:'tag-ok' });
  if (headers['x-github-request-id'])           techs.push({ cat:'Hosting',   name:'GitHub Pages',    tag:'tag-ok' });

  // Frameworks / CMS
  const powered = headers['x-powered-by'] || '';
  if (powered.toLowerCase().includes('php'))    techs.push({ cat:'Lenguaje',  name:`PHP ${powered.match(/\d[\d.]*/)?.[0]||''}`, tag:'tag-info' });
  if (powered.toLowerCase().includes('asp.net')) techs.push({ cat:'Framework',name:'ASP.NET',         tag:'tag-info' });
  if (powered.toLowerCase().includes('express')) techs.push({ cat:'Framework',name:'Express.js',      tag:'tag-info' });
  if (powered.toLowerCase().includes('next'))   techs.push({ cat:'Framework', name:'Next.js',         tag:'tag-info' });

  if (headers['x-drupal-cache'])                techs.push({ cat:'CMS',       name:'Drupal',          tag:'tag-info' });
  if (headers['x-wp-total'])                    techs.push({ cat:'CMS',       name:'WordPress',       tag:'tag-info' });
  if (headers['x-shopify-stage'])               techs.push({ cat:'E-commerce',name:'Shopify',         tag:'tag-info' });

  // Security
  if (headers['strict-transport-security'])     techs.push({ cat:'Seguridad', name:'HSTS',            tag:'tag-ok' });
  if (headers['content-security-policy'])       techs.push({ cat:'Seguridad', name:'CSP',             tag:'tag-ok' });

  // Group by category
  const grouped = techs.reduce((acc, t) => {
    if (!acc[t.cat]) acc[t.cat] = [];
    acc[t.cat].push(t);
    return acc;
  }, {});

  if (!techs.length) {
    return `<div class="result-block">
      <div class="result-block-header"><span class="rec-type-badge type-NS">TECHNOLOGIES</span></div>
      <div class="no-records">No se detectaron tecnologías conocidas en los headers de respuesta.</div>
    </div>`;
  }

  let html = `<div class="result-block">
    <div class="result-block-header">
      <span class="rec-type-badge type-NS">TECHNOLOGIES</span>
      <span class="rec-count">${techs.length} detectada${techs.length !== 1 ? 's' : ''}</span>
    </div>
    <table class="rec-table"><tbody>`;

  for (const [cat, items] of Object.entries(grouped)) {
    html += `<tr>
      <td class="rec-name">${cat.toUpperCase()}</td>
      <td class="rec-data">${items.map(i => `<span class="tag ${i.tag}">${i.name}</span>`).join(' ')}</td>
    </tr>`;
  }

  html += `</tbody></table></div>
    <div style="font-size:11px;color:var(--text-dim);padding:8px 0">
      ℹ️ Detección basada en HTTP response headers. Algunas tecnologías pueden no ser detectables.
    </div>`;

  return html;
}

// ── WHOIS ─────────────────────────────────────────────────────────────────────
async function fetchWhois(domain) {
  const res  = await fetch(`${WORKER_URL}/whois/${encodeURIComponent(domain)}`);
  const data = await res.json();
  if (data.error) {
    // Check if error contains a NIC Chile URL
    const nicMatch = data.error.match(/https:\/\/www\.nic\.cl[^\s]+/);
    if (nicMatch) {
      throw new Error(`${data.error.replace(nicMatch[0], '')} <a href="${nicMatch[0]}" target="_blank" style="color:var(--accent)">Ver en NIC Chile →</a>`);
    }
    throw new Error(data.error);
  }

  // RDAP format
  const nameservers = (data.nameservers || []).map(n => n.ldhName?.toLowerCase()).filter(Boolean);
  const events      = data.events || [];
  const registered  = events.find(e => e.eventAction === 'registration')?.eventDate?.slice(0,10) || '—';
  const updated     = events.find(e => e.eventAction === 'last changed')?.eventDate?.slice(0,10)  || '—';
  const expiration  = events.find(e => e.eventAction === 'expiration')?.eventDate?.slice(0,10)    || '—';
  const registrar   = data.entities?.find(e => e.roles?.includes('registrar'))?.vcardArray?.[1]?.find(v => v[0]==='fn')?.[3] || '—';
  const registrant  = data.entities?.find(e => e.roles?.includes('registrant'))?.vcardArray?.[1]?.find(v => v[0]==='fn')?.[3] || 'Protegido / No disponible';

  const expDate  = events.find(e => e.eventAction === 'expiration')?.eventDate;
  const daysLeft = expDate ? Math.ceil((new Date(expDate) - Date.now()) / 86400000) : null;
  const expTag   = daysLeft !== null
    ? `<span class="tag ${daysLeft > 60 ? 'tag-ok' : daysLeft > 14 ? 'tag-warn' : 'tag-err'}">${daysLeft} días</span>`
    : '';

  const statusTags = (data.status || []).map(s =>
    `<span class="tag ${s.includes('active') ? 'tag-ok' : 'tag-info'}">${s}</span>`
  ).join(' ') || '<span class="tag tag-warn">desconocido</span>';

  return `
    <div class="result-block">
      <div class="result-block-header">
        <span class="rec-type-badge type-NS">WHOIS</span>
        <span class="rec-count">${domain}</span>
        ${expTag}
      </div>
      <table class="rec-table"><tbody>
        <tr><td class="rec-name">DOMINIO</td><td class="rec-data">${domain}</td></tr>
        <tr><td class="rec-name">REGISTRADOR</td><td class="rec-data">${registrar}</td></tr>
        <tr><td class="rec-name">REGISTRANTE</td><td class="rec-data">${registrant}</td></tr>
        <tr><td class="rec-name">REGISTRADO</td><td class="rec-data">${registered}</td></tr>
        <tr><td class="rec-name">ACTUALIZADO</td><td class="rec-data">${updated}</td></tr>
        <tr><td class="rec-name">EXPIRA</td><td class="rec-data">${expiration} ${expTag}</td></tr>
        <tr><td class="rec-name">ESTADO</td><td class="rec-data">${statusTags}</td></tr>
        <tr><td class="rec-name">NAMESERVERS</td><td class="rec-data">${nameservers.join('<br>') || '—'}</td></tr>
      </tbody></table>
    </div>`;
}

// ── BLACKLIST CHECK ───────────────────────────────────────────────────────────
const DNSBL_LISTS = [
  { name: 'Spamhaus ZEN',          host: 'zen.spamhaus.org',          type: 'spam+exploits' },
  { name: 'SpamCop',               host: 'bl.spamcop.net',            type: 'spam' },
  { name: 'SORBS SPAM',            host: 'spam.dnsbl.sorbs.net',      type: 'spam' },
  { name: 'SORBS HTTP',            host: 'http.dnsbl.sorbs.net',      type: 'proxy' },
  { name: 'Barracuda',             host: 'b.barracudacentral.org',    type: 'spam' },
  { name: 'UCEprotect L1',         host: 'dnsbl-1.uceprotect.net',    type: 'spam' },
  { name: 'UCEprotect L2',         host: 'dnsbl-2.uceprotect.net',    type: 'spam' },
  { name: 'NordSpam',              host: 'bl.nordspam.com',           type: 'spam' },
  { name: 'PSBL',                  host: 'psbl.surriel.com',          type: 'spam' },
  { name: 'Truncate',              host: 'truncate.gbudb.net',        type: 'spam' },
];

async function checkDNSBL(reversedIP, list) {
  const query = `${reversedIP}.${list.host}`;
  try {
    const res = await fetch(RESOLVERS.google(query, 'A'), { headers: { 'Accept': 'application/dns-json' } });
    const data = await res.json();
    const listed = data.Status === 0 && (data.Answer?.length > 0);
    return { ...list, listed, answer: data.Answer?.[0]?.data || null };
  } catch {
    return { ...list, listed: false, answer: null };
  }
}

async function fetchBlacklist(ip) {
  // Validate it's an IPv4
  const ipv4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) throw new Error('Ingresa una dirección IPv4 válida (ej: 8.8.8.8)');

  const reversed = ip.split('.').reverse().join('.');

  // Check all lists in parallel
  const results = await Promise.all(DNSBL_LISTS.map(list => checkDNSBL(reversed, list)));

  const listed   = results.filter(r => r.listed);
  const clean    = results.filter(r => !r.listed);
  const score    = listed.length;

  const verdict = score === 0
    ? `<span class="tag tag-ok" style="font-size:14px;padding:6px 14px">🟢 LIMPIO</span>`
    : score <= 2
    ? `<span class="tag tag-warn" style="font-size:14px;padding:6px 14px">🟡 SOSPECHOSO</span>`
    : `<span class="tag tag-err" style="font-size:14px;padding:6px 14px">🔴 EN LISTA NEGRA</span>`;

  return `
    <div class="result-block">
      <div class="result-block-header">
        <span class="rec-type-badge type-${score === 0 ? 'NS' : score <= 2 ? 'SOA' : 'MX'}">BLACKLIST CHECK</span>
        <span class="rec-count">${ip}</span>
        ${verdict}
        <span style="margin-left:auto;font-size:11px;color:var(--text-dim)">${listed.length} / ${results.length} listas</span>
      </div>

      ${listed.length > 0 ? `
      <div style="margin-bottom:12px">
        <div style="font-size:10px;color:var(--error);letter-spacing:2px;margin-bottom:8px">EN LISTA NEGRA</div>
        <table class="rec-table"><tbody>
          ${listed.map(r => `<tr>
            <td class="rec-data"><span class="tag tag-err">❌</span> ${r.name}</td>
            <td class="rec-name">${r.type}</td>
            <td class="rec-ttl">${r.host}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}

      <div>
        <div style="font-size:10px;color:var(--success);letter-spacing:2px;margin-bottom:8px">LIMPIO EN</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${clean.map(r => `<span class="tag tag-ok">✅ ${r.name}</span>`).join('')}
        </div>
      </div>
    </div>

    ${listed.length > 0 ? `
    <div style="font-size:11px;color:var(--text-dim);padding:8px 0;line-height:1.8">
      ℹ️ Para solicitar la eliminación de estas listas, visita directamente el sitio de cada proveedor.
    </div>` : ''}`;
}

// ── EMAIL SECURITY ────────────────────────────────────────────────────────────

// Helper: query TXT records and find matching ones
async function getTXT(domain) {
  const res = await fetch(RESOLVERS.google(domain, 'TXT'), { headers: { 'Accept': 'application/dns-json' } });
  const data = await res.json();
  return (data.Answer || []).map(r => r.data?.replace(/^"|"$/g, '').replace(/"\s*"/g, '') || '');
}

async function getMX(domain) {
  const res = await fetch(RESOLVERS.google(domain, 'MX'), { headers: { 'Accept': 'application/dns-json' } });
  const data = await res.json();
  return data.Answer || [];
}

// ── SPF ───────────────────────────────────────────────────────────────────────
function analyzeSPF(spf) {
  if (!spf) return { score: 0, issues: ['Sin registro SPF'], recommendations: ['Agrega un registro SPF a tu dominio'] };

  const issues = [];
  const recommendations = [];
  let score = 40; // base por tener SPF

  // Check all directive
  if (spf.includes('-all'))      score += 30;
  else if (spf.includes('~all')) { score += 15; issues.push('Usa ~all (softfail) en vez de -all (fail)'); recommendations.push('Cambia ~all por -all para mayor seguridad'); }
  else if (spf.includes('?all')) { issues.push('Usa ?all (neutral) — no protege'); recommendations.push('Cambia ?all por -all'); }
  else if (spf.includes('+all')) { score -= 20; issues.push('⚠ +all permite CUALQUIER servidor enviar en tu nombre'); recommendations.push('Elimina +all inmediatamente y agrega -all'); }

  // Check includes count (max 10 DNS lookups)
  const includes = (spf.match(/include:/g) || []).length;
  if (includes > 8) { issues.push(`Demasiados includes (${includes}) — puede superar el límite de 10 lookups DNS`); score -= 10; }
  else score += 10;

  // Check for ip4/ip6 (good practice)
  if (spf.includes('ip4:') || spf.includes('ip6:')) score += 10;

  // Check for ptr (deprecated)
  if (spf.includes('ptr')) { issues.push('Usa ptr: (mecanismo obsoleto y lento)'); recommendations.push('Elimina ptr: del registro SPF'); score -= 5; }

  return { score: Math.min(100, Math.max(0, score)), issues, recommendations };
}

async function fetchSPF(domain) {
  const txts = await getTXT(domain);
  const spf = txts.find(t => t.startsWith('v=spf1')) || null;
  const analysis = analyzeSPF(spf);

  const scoreTag = `<span class="tag ${analysis.score >= 80 ? 'tag-ok' : analysis.score >= 50 ? 'tag-warn' : 'tag-err'}" style="font-size:13px;padding:4px 12px">${analysis.score}/100</span>`;

  // Parse mechanisms
  const mechanisms = spf ? spf.split(' ').slice(1).map(m => {
    const qualifier = ['+','-','~','?'].includes(m[0]) ? m[0] : '+';
    const mech = qualifier === '+' ? m : m.slice(1);
    const color = qualifier === '-' ? 'tag-ok' : qualifier === '~' ? 'tag-warn' : qualifier === '+' && mech !== 'all' ? 'tag-info' : qualifier === '+' && mech === 'all' ? 'tag-err' : 'tag-info';
    return { qualifier, mech, color };
  }) : [];

  return `
    <div class="result-block">
      <div class="result-block-header">
        <span class="rec-type-badge type-TXT">SPF</span>
        ${spf ? '<span class="tag tag-ok">✓ EXISTE</span>' : '<span class="tag tag-err">✗ NO EXISTE</span>'}
        ${scoreTag}
      </div>
      ${spf ? `
        <div style="background:var(--bg);border:1px solid var(--border);padding:10px 14px;margin-bottom:12px;font-size:12px;color:var(--accent3);word-break:break-all">${spf}</div>
        <table class="rec-table"><thead><tr><th>CALIFICADOR</th><th>MECANISMO</th></tr></thead><tbody>
          ${mechanisms.map(m => `<tr>
            <td><span class="tag ${m.color}">${m.qualifier === '+' ? 'PASS' : m.qualifier === '-' ? 'FAIL' : m.qualifier === '~' ? 'SOFTFAIL' : 'NEUTRAL'}</span></td>
            <td class="rec-data">${m.mech}</td>
          </tr>`).join('')}
        </tbody></table>` : '<div class="no-records">Sin registro SPF en este dominio</div>'}
      ${analysis.issues.length ? `
        <div style="margin-top:12px">
          ${analysis.issues.map(i => `<div style="margin:4px 0"><span class="tag tag-warn">⚠</span> ${i}</div>`).join('')}
        </div>` : ''}
      ${analysis.recommendations.length ? `
        <div style="margin-top:10px;font-size:11px;color:var(--text-dim)">
          ${analysis.recommendations.map(r => `<div style="margin:3px 0">→ ${r}</div>`).join('')}
        </div>` : ''}
    </div>`;
}

// ── DKIM ──────────────────────────────────────────────────────────────────────
const DKIM_SELECTORS = ['default','google','mail','k1','k2','selector1','selector2','smtp','dkim','email','s1','s2','key1','key2','mimecast','pm','mandrill','sendgrid'];

async function checkDKIMSelector(domain, selector) {
  try {
    const res = await fetch(RESOLVERS.google(`${selector}._domainkey.${domain}`, 'TXT'), { headers: { 'Accept': 'application/dns-json' } });
    const data = await res.json();
    const record = (data.Answer || []).find(r => r.data?.includes('v=DKIM1'));
    return record ? { selector, record: record.data.replace(/^"|"$/g, '').replace(/"\s*"/g, '') } : null;
  } catch { return null; }
}

async function fetchDKIM(domain) {
  // Check all selectors in parallel
  const results = await Promise.all(DKIM_SELECTORS.map(s => checkDKIMSelector(domain, s)));
  const found = results.filter(Boolean);

  return `
    <div class="result-block">
      <div class="result-block-header">
        <span class="rec-type-badge type-A">DKIM</span>
        ${found.length ? `<span class="tag tag-ok">✓ ${found.length} selector${found.length > 1 ? 'es' : ''} encontrado${found.length > 1 ? 's' : ''}</span>` : '<span class="tag tag-err">✗ SIN SELECTORES</span>'}
        <span class="rec-count">${DKIM_SELECTORS.length} selectores verificados</span>
      </div>
      ${found.length ? found.map(f => `
        <div style="margin-bottom:12px">
          <div style="font-size:11px;color:var(--accent);letter-spacing:1px;margin-bottom:6px">SELECTOR: ${f.selector}._domainkey.${domain}</div>
          <div style="background:var(--bg);border:1px solid var(--border);padding:10px 14px;font-size:11px;color:var(--text-dim);word-break:break-all">${f.record}</div>
          ${(() => {
            const keyType = f.record.match(/k=([^;]+)/)?.[1] || 'rsa';
            const valid = f.record.includes('v=DKIM1') && f.record.includes('p=');
            const hasKey = f.record.match(/p=([^;]+)/)?.[1]?.length > 10;
            return `<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
              ${valid ? '<span class="tag tag-ok">✓ VÁLIDO</span>' : '<span class="tag tag-err">✗ INVÁLIDO</span>'}
              <span class="tag tag-info">Tipo: ${keyType.toUpperCase()}</span>
              ${hasKey ? '<span class="tag tag-ok">✓ Clave pública presente</span>' : '<span class="tag tag-err">✗ Clave revocada</span>'}
            </div>`;
          })()}
        </div>`).join('') : `
        <div class="no-records">No se encontraron selectores DKIM conocidos.</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:8px;line-height:1.8">
          Selectores verificados: ${DKIM_SELECTORS.join(', ')}<br>
          Si tu proveedor usa un selector diferente, consúltalo en su documentación.
        </div>`}
    </div>`;
}

// ── DMARC ─────────────────────────────────────────────────────────────────────
async function fetchDMARC(domain) {
  const txts = await getTXT(`_dmarc.${domain}`);
  const dmarc = txts.find(t => t.startsWith('v=DMARC1')) || null;

  if (!dmarc) return `
    <div class="result-block">
      <div class="result-block-header">
        <span class="rec-type-badge type-MX">DMARC</span>
        <span class="tag tag-err">✗ NO EXISTE</span>
      </div>
      <div class="no-records">Sin registro DMARC en _dmarc.${domain}</div>
      <div style="font-size:11px;color:var(--text-dim);margin-top:8px;line-height:1.8">
        → Agrega un registro TXT en <strong>_dmarc.${domain}</strong><br>
        → Ejemplo mínimo: <code style="color:var(--accent3)">v=DMARC1; p=none; rua=mailto:dmarc@${domain}</code>
      </div>
    </div>`;

  // Parse tags
  const tags = Object.fromEntries(dmarc.split(';').map(t => t.trim().split('=').map(s => s.trim())).filter(p => p.length === 2));
  const policy    = tags['p']   || 'none';
  const subPolicy = tags['sp']  || policy;
  const pct       = tags['pct'] || '100';
  const rua       = tags['rua'] || '—';
  const ruf       = tags['ruf'] || '—';
  const adkim     = tags['adkim'] || 'r';
  const aspf      = tags['aspf']  || 'r';

  const policyColor = policy === 'reject' ? 'tag-ok' : policy === 'quarantine' ? 'tag-warn' : 'tag-err';
  const policyLabel = policy === 'reject' ? '🔴 REJECT' : policy === 'quarantine' ? '🟡 QUARANTINE' : '⚪ NONE';

  let score = 20;
  if (policy === 'reject')      score = 100;
  else if (policy === 'quarantine') score = 70;
  if (rua !== '—') score = Math.min(score + 10, 100);
  if (adkim === 's') score = Math.min(score + 5, 100);
  if (aspf === 's')  score = Math.min(score + 5, 100);

  const scoreTag = `<span class="tag ${score >= 80 ? 'tag-ok' : score >= 50 ? 'tag-warn' : 'tag-err'}" style="font-size:13px;padding:4px 12px">${score}/100</span>`;

  return `
    <div class="result-block">
      <div class="result-block-header">
        <span class="rec-type-badge type-MX">DMARC</span>
        <span class="tag tag-ok">✓ EXISTE</span>
        <span class="tag ${policyColor}">${policyLabel}</span>
        ${scoreTag}
      </div>
      <div style="background:var(--bg);border:1px solid var(--border);padding:10px 14px;margin-bottom:12px;font-size:12px;color:var(--accent3);word-break:break-all">${dmarc}</div>
      <table class="rec-table"><tbody>
        <tr><td class="rec-name">POLÍTICA (p=)</td><td class="rec-data"><span class="tag ${policyColor}">${policy}</span> — ${policy === 'reject' ? 'Rechaza emails no autenticados' : policy === 'quarantine' ? 'Envía a spam emails no autenticados' : 'Solo monitoreo, sin acción'}</td></tr>
        <tr><td class="rec-name">SUBDOMINIO (sp=)</td><td class="rec-data">${subPolicy}</td></tr>
        <tr><td class="rec-name">PORCENTAJE (pct=)</td><td class="rec-data">${pct}% de los emails aplican esta política</td></tr>
        <tr><td class="rec-name">REPORTES (rua=)</td><td class="rec-data">${rua}</td></tr>
        <tr><td class="rec-name">REPORTES FORENSE (ruf=)</td><td class="rec-data">${ruf}</td></tr>
        <tr><td class="rec-name">ALINEACIÓN DKIM (adkim=)</td><td class="rec-data">${adkim === 's' ? '<span class="tag tag-ok">strict</span>' : '<span class="tag tag-warn">relaxed</span>'}</td></tr>
        <tr><td class="rec-name">ALINEACIÓN SPF (aspf=)</td><td class="rec-data">${aspf === 's' ? '<span class="tag tag-ok">strict</span>' : '<span class="tag tag-warn">relaxed</span>'}</td></tr>
      </tbody></table>
      ${policy === 'none' ? '<div style="margin-top:10px;font-size:11px;color:var(--text-dim)">→ Considera cambiar a <strong>p=quarantine</strong> o <strong>p=reject</strong> para mayor protección</div>' : ''}
    </div>`;
}

// ── EMAIL SECURITY (análisis completo) ────────────────────────────────────────
async function fetchEmailSecurity(domain) {
  // Run all checks in parallel
  const [txts, mxRecords, dmarcTxts, dkimResults] = await Promise.all([
    getTXT(domain),
    getMX(domain),
    getTXT(`_dmarc.${domain}`),
    Promise.all(DKIM_SELECTORS.slice(0, 8).map(s => checkDKIMSelector(domain, s)))
  ]);

  const spf   = txts.find(t => t.startsWith('v=spf1')) || null;
  const dmarc = dmarcTxts.find(t => t.startsWith('v=DMARC1')) || null;
  const dkim  = dkimResults.filter(Boolean);

  // Scores
  const spfAnalysis   = analyzeSPF(spf);
  const dmarcPolicy   = dmarc ? (dmarc.match(/p=(\w+)/)?.[1] || 'none') : null;
  const dmarcScore    = !dmarc ? 0 : dmarcPolicy === 'reject' ? 100 : dmarcPolicy === 'quarantine' ? 70 : 20;
  const dkimScore     = dkim.length > 0 ? 100 : 0;
  const totalScore    = Math.round((spfAnalysis.score + dmarcScore + dkimScore) / 3);

  const scoreColor = totalScore >= 80 ? 'tag-ok' : totalScore >= 50 ? 'tag-warn' : 'tag-err';
  const grade = totalScore >= 90 ? 'A+' : totalScore >= 80 ? 'A' : totalScore >= 70 ? 'B' : totalScore >= 50 ? 'C' : totalScore >= 30 ? 'D' : 'F';

  // Detect email provider from MX
  const mxNames = mxRecords.map(r => r.data?.toLowerCase() || '');
  const provider = mxNames.some(m => m.includes('google') || m.includes('gmail'))    ? 'Google Workspace'
    : mxNames.some(m => m.includes('outlook') || m.includes('microsoft'))            ? 'Microsoft 365'
    : mxNames.some(m => m.includes('zoho'))                                           ? 'Zoho Mail'
    : mxNames.some(m => m.includes('proton'))                                         ? 'Proton Mail'
    : mxNames.some(m => m.includes('mimecast'))                                       ? 'Mimecast'
    : mxNames.length > 0                                                              ? 'Servidor propio'
    : 'Sin MX configurado';

  return `
    <div class="ssl-hero" style="margin-bottom:16px">
      <div class="ssl-grade" style="color:${totalScore >= 80 ? 'var(--success)' : totalScore >= 50 ? 'var(--warn)' : 'var(--error)'}">${grade}</div>
      <div>
        <div style="font-size:16px;color:var(--text-bright);font-family:'Space Mono',monospace">${domain}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:4px">📧 ${provider}</div>
      </div>
      <div style="margin-left:auto;text-align:right">
        <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">PUNTUACIÓN GENERAL</div>
        <span class="tag ${scoreColor}" style="font-size:15px;padding:5px 14px">${totalScore}/100</span>
      </div>
    </div>

    <div class="result-block">
      <div class="result-block-header"><span class="rec-type-badge type-MX">MX RECORDS</span></div>
      ${mxRecords.length ? `<table class="rec-table"><tbody>
        ${mxRecords.map(r => `<tr>
          <td class="rec-priority" style="min-width:50px">${r.data?.split(' ')[0]}</td>
          <td class="rec-data">${r.data?.split(' ').slice(1).join(' ')}</td>
        </tr>`).join('')}
      </tbody></table>` : '<div class="no-records">Sin registros MX</div>'}
    </div>

    <div class="result-block">
      <div class="result-block-header">
        <span class="rec-type-badge type-TXT">SPF</span>
        ${spf ? '<span class="tag tag-ok">✓ EXISTE</span>' : '<span class="tag tag-err">✗ NO EXISTE</span>'}
        <span class="tag ${spfAnalysis.score >= 80 ? 'tag-ok' : spfAnalysis.score >= 50 ? 'tag-warn' : 'tag-err'}">${spfAnalysis.score}/100</span>
      </div>
      ${spf ? `<div style="font-size:11px;color:var(--text-dim);padding:6px 0;word-break:break-all">${spf}</div>` : '<div class="no-records">Sin registro SPF</div>'}
      ${spfAnalysis.issues.map(i => `<div style="margin:3px 0;font-size:11px"><span class="tag tag-warn">⚠</span> ${i}</div>`).join('')}
    </div>

    <div class="result-block">
      <div class="result-block-header">
        <span class="rec-type-badge type-A">DKIM</span>
        ${dkim.length ? `<span class="tag tag-ok">✓ ${dkim.length} selector${dkim.length > 1 ? 'es' : ''}</span>` : '<span class="tag tag-err">✗ NO ENCONTRADO</span>'}
        <span class="tag ${dkimScore === 100 ? 'tag-ok' : 'tag-err'}">${dkimScore}/100</span>
      </div>
      ${dkim.length ? dkim.map(d => `<div style="font-size:11px;color:var(--text-dim);padding:3px 0">✓ Selector: <span style="color:var(--accent)">${d.selector}</span></div>`).join('') : '<div class="no-records">No se encontraron selectores DKIM</div>'}
    </div>

    <div class="result-block">
      <div class="result-block-header">
        <span class="rec-type-badge type-MX">DMARC</span>
        ${dmarc ? '<span class="tag tag-ok">✓ EXISTE</span>' : '<span class="tag tag-err">✗ NO EXISTE</span>'}
        ${dmarc ? `<span class="tag ${dmarcPolicy === 'reject' ? 'tag-ok' : dmarcPolicy === 'quarantine' ? 'tag-warn' : 'tag-err'}">${dmarcPolicy?.toUpperCase()}</span>` : ''}
        <span class="tag ${dmarcScore >= 80 ? 'tag-ok' : dmarcScore >= 50 ? 'tag-warn' : 'tag-err'}">${dmarcScore}/100</span>
      </div>
      ${dmarc ? `<div style="font-size:11px;color:var(--text-dim);padding:6px 0;word-break:break-all">${dmarc}</div>` : '<div class="no-records">Sin registro DMARC</div>'}
    </div>

    ${totalScore < 80 ? `
    <div style="background:rgba(0,229,255,0.05);border:1px solid rgba(0,229,255,0.15);padding:14px;font-size:11px;line-height:1.9;color:var(--text-dim)">
      <div style="color:var(--accent);letter-spacing:1px;margin-bottom:8px">💡 RECOMENDACIONES</div>
      ${!spf ? '<div>→ Agrega un registro SPF: <code style="color:var(--accent3)">v=spf1 include:... -all</code></div>' : ''}
      ${spf && spf.includes('~all') ? '<div>→ Cambia ~all por -all en tu SPF para mayor seguridad</div>' : ''}
      ${!dkim.length ? '<div>→ Configura DKIM en tu proveedor de correo</div>' : ''}
      ${!dmarc ? '<div>→ Agrega DMARC: <code style="color:var(--accent3)">v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}</code></div>' : ''}
      ${dmarc && dmarcPolicy === 'none' ? '<div>→ Cambia DMARC de p=none a p=quarantine o p=reject</div>' : ''}
    </div>` : ''}`;
}

// ── RUN TOOL ──────────────────────────────────────────────────────────────────
async function runTool() {
  const input = document.getElementById('domainInput').value.trim().toLowerCase();
  if (!input) { showError('⚠ Ingresa un dominio o IP.'); return; }

  // Validación básica según categoría
  if (currentCategory === 'security') {
    // Debe ser IPv4 válida
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(input)) {
      showError('⚠ Ingresa una dirección IPv4 válida.\nEjemplo: 8.8.8.8');
      return;
    }
  } else if (currentCategory === 'ip' && currentTool !== 'reverse-dns') {
    // IP Lookup e IP WHOIS necesitan una IP
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(input) && !input.includes(':')) {
      showError('⚠ Ingresa una dirección IP válida.\nEjemplo: 8.8.8.8');
      return;
    }
  } else {
    // Para todo lo demás debe ser un dominio con al menos un punto
    if (!input.includes('.') || input.startsWith('.') || input.endsWith('.')) {
      showError('⚠ Ingresa un dominio válido.\nEjemplo: google.com, mickzz.xyz');
      return;
    }
  }

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
      } else if (currentTool === 'whois') {
        html = await fetchWhois(input);
      } else {
        const results = await Promise.all(tool.types.map(async type => ({ type, data: await queryDNS(input, type) })));
        html = renderDNSResults(results, input);
      }
    } else if (currentCategory === 'ip') {
      if (currentTool === 'ip-lookup') {
        html = renderIPLookup(await fetchIPInfo(input));
      } else if (currentTool === 'ip-whois') {
        html = renderIPWHOIS(await fetchIPWHOIS(input));
      } else if (currentTool === 'reverse-dns') {
        const reversed = input.split('.').reverse().join('.') + '.in-addr.arpa';
        html = renderDNSResults([{ type:'PTR', data: await queryDNS(reversed, 'PTR') }], input);
      }
    } else if (currentCategory === 'ssl') {
      // Show progress message — SSL Labs can take 60-90s
      const cached = sslCache[input];
      document.getElementById('outputBody').innerHTML = currentTool === 'ssl-cert' ? `
        <div class="loading-text" style="padding:24px">
          <div class="spinner"></div>
          Consultando certificado de ${input}...
        </div>` : cached ? `
        <div class="loading-text" style="padding:24px">
          <div class="spinner"></div>
          Cargando desde caché...
        </div>` : `
        <div class="loading-text" style="flex-direction:column;align-items:flex-start;gap:14px;padding:24px">
          <div style="display:flex;align-items:center;gap:10px"><div class="spinner"></div>Analizando SSL de ${input}...</div>
          <div style="font-size:11px;color:var(--text-dim);line-height:1.8">
            ⏳ SSL Labs puede tardar <strong style="color:var(--warn)">60-90 segundos</strong> la primera vez.<br>
            Esto es normal — está probando protocolos, cipher suites y vulnerabilidades.<br>
            <span style="color:var(--accent)">💡 El resultado se guardará en caché para consultas posteriores.</span>
          </div>
        </div>`;

      if (currentTool === 'ssl-check') {
        html = await fetchAndRenderSSL(input, 'full');
      } else if (currentTool === 'ssl-cert') {
        html = await fetchCertInfo(input);
      }
    } else if (currentCategory === 'web') {
      if (currentTool === 'web-headers') {
        html = await fetchSSLHeaders(input);
      } else if (currentTool === 'web-timing') {
        html = await fetchWebTiming(input);
      } else if (currentTool === 'web-tech') {
        html = await fetchWebTech(input);
      }
    } else if (currentCategory === 'security') {
      if (currentTool === 'blacklist') {
        html = await fetchBlacklist(input);
      }
    } else if (currentCategory === 'email') {
      if (currentTool === 'email-security') {
        html = await fetchEmailSecurity(input);
      } else if (currentTool === 'spf-analyzer') {
        html = await fetchSPF(input);
      } else if (currentTool === 'dkim-checker') {
        html = await fetchDKIM(input);
      } else if (currentTool === 'dmarc-analyzer') {
        html = await fetchDMARC(input);
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
  // Solo rellena el input, no ejecuta automáticamente
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

function setStatus(state) { document.getElementById('statusDot').className = 'status-dot ' + (state||''); }
function showError(msg) {
  document.getElementById('outputBody').innerHTML =
    `<div style="color:var(--error);padding:20px;white-space:pre-wrap;line-height:1.8">${msg}</div>`;
}

document.addEventListener('DOMContentLoaded', () => {
  renderNav();
  document.getElementById('toolDesc').textContent = TOOLS['dns-lookup'].desc;
  document.getElementById('domainInput').addEventListener('keydown', e => { if (e.key === 'Enter') runTool(); });
});