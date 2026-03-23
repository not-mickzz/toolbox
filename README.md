# 🌐 Network Toolbox

Herramienta web de análisis de red en tiempo real. Sin dependencias front-end, sin costos — consulta directamente a Google DNS, Cloudflare DNS y APIs públicas desde el navegador via Cloudflare Workers.

![Status](https://img.shields.io/badge/status-active-00e5a0?style=flat-square) ![DNS](https://img.shields.io/badge/DNS-Real%20Time-00e5ff?style=flat-square) ![SSL](https://img.shields.io/badge/SSL-SSL%20Labs-7fff00?style=flat-square) ![Web](https://img.shields.io/badge/Web-Analysis-ff6b35?style=flat-square) ![Security](https://img.shields.io/badge/Security-DNSBL-ff4455?style=flat-square) ![Email](https://img.shields.io/badge/Email-Analyzer-ff9f40?style=flat-square)

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
| 🏷️ **WHOIS** | Registrador, fechas, nameservers y estado del dominio |

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

### 🌍 Web
| Herramienta | Descripción |
|---|---|
| 🛡️ **HTTP Headers** | Verifica headers de seguridad: HSTS, CSP, X-Frame-Options y más |
| ⚡ **Response Time** | Tiempo de respuesta, servidor, CDN y cache-control |
| 🔬 **Technologies** | Detecta CDN, hosting, CMS, frameworks y librerías |

### 🚫 Security
| Herramienta | Descripción |
|---|---|
| 🚫 **Blacklist Check** | Verifica si una IP está en 10 listas negras de spam y malware (DNSBL) |

### 📧 Email
| Herramienta | Descripción |
|---|---|
| 🛡️ **Email Security** | Análisis completo SPF + DKIM + DMARC con nota A+/A/B/C/D/F |
| 📋 **SPF Analyzer** | Parsea mecanismos, calificadores y puntuación del registro SPF |
| 🔑 **DKIM Checker** | Busca y verifica 18 selectores DKIM comunes del dominio |
| 📊 **DMARC Analyzer** | Política, alineación, reportes y configuración DMARC |

---

## 🏗️ Arquitectura

```
Navegador (mickzz.xyz/toolbox)
    │
    ├── DNS queries      →  dns.google / cloudflare-dns.com (DoH, directo)
    ├── DNSBL queries    →  dns.google (DoH, directo — sin backend)
    ├── Email queries    →  dns.google (DoH, directo — sin backend)
    │
    └── Via Worker proxy (toolbox.mickzz.workers.dev)
            ├── /ip/:ip        →  ipinfo.io
            ├── /headers/:host →  fetch HEAD del dominio
            ├── /ssl/:host     →  api.ssllabs.com
            └── /whois/:domain →  RDAP oficial por TLD
```

---

## 📁 Estructura

```
toolbox/
├── index.html    # Estructura HTML
├── styles.css    # Estilos (tema oscuro navy)
├── app.js        # Lógica DNS + IP + SSL + Web + Security + Email
├── favicon.svg   # Ícono
└── README.md
```

> `worker.js` se despliega en Cloudflare Workers — no se incluye en el repo por seguridad.

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
| `dns.google` | DNS + DNSBL + Email analysis | Sin límite |
| `cloudflare-dns.com` | Consultas DNS | Sin límite |
| `ipinfo.io` | Geolocalización IP | 50.000 req/mes |
| `rdap.arin.net` | IP WHOIS | Sin límite |
| `api.ssllabs.com` | Análisis SSL/TLS | Sin límite (uso justo) |
| RDAP oficial por TLD | WHOIS de dominios | Sin límite |
| DNSBL (10 listas) | Blacklist Check | Sin límite |

---

## ⚠️ Notas

- **SSL Check** usa SSL Labs API — puede tardar **60-90 segundos** la primera vez. El resultado se guarda en caché hasta recargar la página. **Certificado** usa el mismo caché.
- **WHOIS** soporta: `.com` `.net` `.org` `.xyz` `.io` `.ai` `.dev` `.app` `.info` `.biz` `.co` `.me` `.us` `.uk` `.ca` `.eu` `.de` `.fr` `.br` `.ar` `.mx`
- **WHOIS .cl** — NIC Chile no tiene RDAP público. Al consultar un `.cl` se muestra un link directo a [nic.cl](https://www.nic.cl/registry/Whois.do).
- **Blacklist Check** solo acepta IPv4.
- **Email** — todas las herramientas funcionan via DNS directo, sin backend ni API key.
- `worker.js` no está en el repo público por seguridad.

---

## 🗺️ Roadmap

- [x] DNS Lookup completo (9 herramientas)
- [x] IP Geolocalización con mapa
- [x] IP WHOIS y Reverse DNS
- [x] SSL/TLS Checker con puntuación
- [x] HTTP Security Headers
- [x] Response Time
- [x] Technology Detection
- [x] WHOIS de dominios (20+ TLDs)
- [x] Blacklist Check (10 listas DNSBL)
- [x] Email Security Analyzer (SPF, DKIM, DMARC)
- [ ] Blacklist Check por dominio
- [ ] Subdomain Finder
- [ ] Password Breach Checker

---

## 📄 Licencia

MIT — úsalo, modifícalo y compártelo libremente.