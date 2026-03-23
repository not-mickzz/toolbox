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
};

const CATEGORIES = {
  dns:      { label:'DNS',       icon:'⬡' },
  ip:       { label:'IP Tools',  icon:'◎' },
  ssl:      { label:'SSL / TLS', icon:'🔒' },
  web:      { label:'Web',       icon:'🌍' },
  security: { label:'Security',  icon:'🚫' },
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
    : cat === 'ssl' || cat === 'web'
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

  return fetchAndRenderSSL(domain, 'cert');
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

function useDomain(d) { document.getElementById('domainInput').value = d; runTool(); }

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