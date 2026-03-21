# 🌐 Network Toolbox

Herramienta web de análisis de red en tiempo real. Sin backend, sin API keys, sin costos — consulta directamente a Google DNS, Cloudflare DNS y APIs públicas de geolocalización.

![Status](https://img.shields.io/badge/status-active-00e5a0?style=flat-square) ![DNS](https://img.shields.io/badge/DNS-Real%20Time-00e5ff?style=flat-square) ![No Backend](https://img.shields.io/badge/backend-none-7fff00?style=flat-square)

🔗 **[mickzz.xyz/dns-toolbox](https://mickzz.xyz/dns-toolbox)**

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
| 🌐 **IP Lookup** | Geolocalización, ISP, zona horaria, moneda, mapa interactivo |
| 📋 **IP WHOIS** | Bloque de red, organización registrante, contacto de abuso |
| ↩ **Reverse DNS** | Hostname asociado a una IP (registro PTR) |

---

## 🏗️ Arquitectura

```
Navegador
    │
    ├── DNS queries  → dns.google / cloudflare-dns.com (DoH)
    │
    └── IP queries   → freeipapi.com / rdap.arin.net
```

Sin servidor intermedio. Todo directo desde el navegador.

---

## 📁 Estructura

```
dns-toolbox/
├── index.html    # Estructura HTML
├── styles.css    # Estilos (tema oscuro navy)
├── app.js        # Lógica DNS + IP
├── favicon.svg   # Ícono
└── README.md
```

---

## 🚀 Deploy

### GitHub Pages

Activa en **Settings → Pages → Branch: `main` / `/ (root)`**

Disponible en: `https://not-mickzz.github.io/dns-toolbox/`

### Local

```bash
# Python (recomendado — evita problemas de CORS)
python3 -m http.server 8080
```

Abre `http://localhost:8080`

> ⚠️ No abras `index.html` directo como archivo (`file://`) — el navegador bloqueará las llamadas externas por CORS.

---

## 🔍 APIs utilizadas

| API | Uso | Límite gratuito |
|---|---|---|
| `dns.google` | Consultas DNS | Sin límite |
| `cloudflare-dns.com` | Consultas DNS | Sin límite |
| `freeipapi.com` | Geolocalización IP | 60 req/min |
| `rdap.arin.net` | IP WHOIS | Sin límite |

---

## 🗺️ Próximas herramientas

- [ ] HTTP Headers
- [ ] SSL/TLS Checker  
- [ ] WHOIS de dominios
- [ ] Ping / Traceroute

---

## 📄 Licencia

MIT — úsalo, modifícalo y compártelo libremente.
