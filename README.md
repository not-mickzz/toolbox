# 🌐 Network Toolbox

Herramienta web de análisis de red en tiempo real. Sin dependencias, sin costos — consulta directamente a Google DNS, Cloudflare DNS, ipinfo.io y SSL Labs desde el navegador via Cloudflare Workers.

![Status](https://img.shields.io/badge/status-active-00e5a0?style=flat-square) ![DNS](https://img.shields.io/badge/DNS-Real%20Time-00e5ff?style=flat-square) ![SSL](https://img.shields.io/badge/SSL-SSL%20Labs-7fff00?style=flat-square)

🔗 **[mickzz.xyz/toolbox](https://mickzz.xyz/toolbox)**

---

## ✨ Herramientas

### ⬡ DNS
| Herramienta | Descripción |
|---|---|
| 🔍 **DNS Lookup** | Todos los registros: A, AAAA, MX, NS, TXT, CNAME, SOA, CAA |
| 📍 **A / AAAA** | Direcciones IPv4 e IPv6 |
| 📧 **MX Records** | Servidores de correo y prioridades |
| 🖧 **NS Records** | Nameservers autoritativos |
| 📄 **TXT Records** | SPF, DKIM, DMARC y verificaciones |
| ↪ **CNAME** | Alias y redirecciones |
| ⚙ **SOA** | Start of Authority: servidor primario, serial, TTL |
| 🌍 **Propagation** | Compara Google DNS vs Cloudflare DNS lado a lado |

### ◎ IP Tools
| Herramienta | Descripción |
|---|---|
| 🌐 **IP Lookup** | Geolocalización, ISP, ASN, zona horaria, mapa interactivo |
| 📋 **IP WHOIS** | Bloque de red, organización registrante, contacto de abuso |
| ↩ **Reverse DNS** | Hostname asociado a una IP (registro PTR) |

### 🔒 SSL / TLS
| Herramienta | Descripción |
|---|---|
| 🔒 **SSL Check** | Análisis completo con puntuación A+/A/B/C/D/F via SSL Labs |
| 📜 **Certificado** | CA emisora, fechas, días restantes, SANs, algoritmo |
| 🛡️ **HTTP Headers** | HSTS, CSP, X-Frame-Options, Referrer-Policy y más |

---

## 🏗️ Arquitectura

```
Navegador (mickzz.xyz/toolbox)
    │
    ├── DNS queries     →  dns.google / cloudflare-dns.com (DoH, directo)
    │
    └── Via Worker proxy (toolbox.mickzz.workers.dev)
            ├── /ip/:ip        →  ipinfo.io
            ├── /headers/:host →  fetch HEAD del dominio
            └── /ssl/:host     →  api.ssllabs.com
```

---

## 📁 Estructura

```
toolbox/
├── index.html    # Estructura HTML
├── styles.css    # Estilos (tema oscuro navy)
├── app.js        # Lógica DNS + IP + SSL
├── favicon.svg   # Ícono
└── README.md
```

> `worker.js` se despliega en Cloudflare Workers — no se incluye en el repo.

---

## 🚀 Deploy

### 1. Cloudflare Worker

1. Ve a [dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages → Create
2. Nómbralo `toolbox` y pega el contenido de `worker.js`
3. En **Settings → Variables and Secrets** agrega:

| Variable | Valor | Tipo |
|---|---|---|
| `IPINFO_TOKEN` | tu token de ipinfo.io | Secret |

4. Deploy → la URL será `https://toolbox.mickzz.workers.dev`

### 2. GitHub Pages

```bash
git add .
git commit -m "feat: Network Toolbox"
git push
```

Activa en **Settings → Pages → Branch: `main` / `/ (root)`**

---

## 🔍 APIs utilizadas

| API | Uso | Límite gratuito |
|---|---|---|
| `dns.google` | Consultas DNS | Sin límite |
| `cloudflare-dns.com` | Consultas DNS | Sin límite |
| `ipinfo.io` | Geolocalización IP | 50.000 req/mes |
| `rdap.arin.net` | IP WHOIS | Sin límite |
| `api.ssllabs.com` | Análisis SSL/TLS | Sin límite (uso justo) |

---

## ⚠️ Notas

- **SSL Check** usa SSL Labs API — puede tardar **60-90 segundos** la primera vez que analiza un dominio nuevo. Es normal.
- Las consultas DNS van directo al navegador sin pasar por el Worker.
- `worker.js` no está en el repo público por seguridad.

---

## 🗺️ Roadmap

- [x] DNS Lookup completo
- [x] IP Geolocalización con mapa
- [x] SSL/TLS Checker con puntuación
- [x] HTTP Security Headers
- [ ] WHOIS de dominios
- [ ] Ping / Latencia
- [ ] Blacklist Check

---

## 📄 Licencia

MIT — úsalo, modifícalo y compártelo libremente.
