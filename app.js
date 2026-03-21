const RESOLVERS = {
  google: (name, type) => `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`,
  cloudflare: (name, type) => `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
};

let currentCategory = 'dns';
let currentTool = 'dns-lookup';
let activeResolver = 'google';

const TOOLS = {
  'dns-lookup': { category: 'dns', label: 'DNS Lookup', icon: '🔍', types: ['A','AAAA','MX','NS','TXT'] },
  'ip-lookup': { category: 'ip', label: 'IP Lookup', icon: '🌐' }
};

const CATEGORIES = {
  dns: { label: 'DNS', icon: '⬡' },
  ip: { label: 'IP Tools', icon: '◎' }
};

function selectCategory(cat) {
  currentCategory = cat;
  currentTool = cat === 'dns' ? 'dns-lookup' : 'ip-lookup';
  renderNav();
}

function renderNav() {
  const tabsEl = document.getElementById('categoryTabs');
  tabsEl.innerHTML = Object.entries(CATEGORIES).map(([key, cat]) => `
    <button class="cat-tab ${key === currentCategory ? 'active' : ''}" onclick="selectCategory('${key}')">
      ${cat.icon} ${cat.label}
    </button>
  `).join('');

  const toolsEl = document.getElementById('toolGrid');
  toolsEl.innerHTML = Object.entries(TOOLS).filter(([,t]) => t.category === currentCategory).map(([key, tool]) => `
    <button class="tool-btn ${key === currentTool ? 'active' : ''}" onclick="currentTool='${key}'; renderNav();">
      ${tool.icon} ${tool.label}
    </button>
  `).join('');
}

async function runTool() {
  const input = document.getElementById('domainInput').value.trim();
  if (!input) return;

  const btn = document.getElementById('runBtn');
  btn.disabled = true;
  document.getElementById('statusDot').className = 'status-dot loading';
  
  try {
    let html = '';
    if (currentCategory === 'dns') {
      const res = await fetch(RESOLVERS[activeResolver](input, 'A'));
      const data = await res.json();
      html = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
    } else {
      const res = await fetch(`https://toolbox.mickzz.workers.dev/ip/${input}`);
      const data = await res.json();
      html = renderIPLookup(data);
    }
    document.getElementById('outputBody').innerHTML = html;
    document.getElementById('statusDot').className = 'status-dot active';
  } catch (err) {
    document.getElementById('outputBody').innerHTML = `<div class="tag-err">${err.message}</div>`;
  }
  btn.disabled = false;
}

function renderIPLookup(data) {
  const ip = data.ip || '—';
  const city = data.city || '—';
  const region = data.region || '—';
  const country = data.country || '—';
  const cc = data.country_code || '';
  const isp = data.as_name || '—';
  const asn = data.asn || '—';
  const lat = data.latitude || 0;
  const lon = data.longitude || 0;

  const flag = cc ? String.fromCodePoint(...[...cc.toUpperCase()].map(c => 0x1F1E0 - 65 + c.charCodeAt(0))) : '🌐';
  const isDatacenter = ['hosting', 'cloud', 'server'].some(k => isp.toLowerCase().includes(k));

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
        <div class="ip-row"><span class="ip-key">ASN</span><span class="ip-val">${asn}</span></div>
        <div class="ip-row"><span class="ip-key">CIUDAD</span><span class="ip-val">${city}</span></div>
        <div class="ip-row"><span class="ip-key">ORGANIZACIÓN</span><span class="ip-val">${isp}</span></div>
        <div class="ip-row"><span class="ip-key">COORDENADAS</span><span class="ip-val">${lat}, ${lon}</span></div>
      </div>
    </div>`;
}

document.addEventListener('DOMContentLoaded', renderNav);
