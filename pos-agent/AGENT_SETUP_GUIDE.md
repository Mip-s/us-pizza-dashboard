# US Pizza Uptime Monitor — Device Agent Setup Guide

This guide explains how to connect an outlet's devices to the **POS Uptime Monitor**
(Operations hub → Uptime Monitor, `https://us-pizza-operations.fazdagroll.workers.dev/uptime`).

---

## 1. How it works

Every **POS, KDS and Self-Order Kiosk (SOK)** runs a small agent that tells the dashboard
"I'm alive" every 5 minutes, and whether its main app is running.
The **ODS TV** can't run an agent, so the **POS it is connected to pings it**.

```
 POS  (agent) ──┐
 KDS  (agent) ──┼──►  https://uptime-us-pizza-dashboard.fazdagroll.workers.dev/api/heartbeat
 SOK  (agent) ──┘            │
 ODS  ◄── ping from POS      ▼
                     Uptime Monitor (checks every minute) ──► dashboard + push alerts
```

| Device | Agent | Reports |
|---|---|---|
| Windows POS / KDS / SOK | **Telegraf** (Windows service) | alive + app running (+ ODS ping on the POS) |
| Android POS / KDS / SOK (Sunmi, iMin) | **Automate** (LlamaLab) | alive + app in foreground |
| ODS TV | none | pinged by its POS |

### What the dashboard shows

| Situation | When it's flagged | Outlet status |
|---|---|---|
| POS app closed / POS silent | ~2 min (app closed) / ~12 min (silent) | 🔴 **CRITICAL** |
| KDS or SOK app closed / silent | ~2 min / ~12 min | 🟠 **DEGRADED** |
| ODS not reachable from POS | ~2 min | 🟠 **DEGRADED** |
| Device comes back | next check (~1 min) | ✅ **RESOLVED** |

> ⚠️ **Opening hours:** outside an outlet's opening hours (e.g. before 10:30) nothing new is
> flagged — machines are expected to be off at night. **Test during opening hours**, or
> temporarily set the outlet's `opening_time` earlier in Supabase (it syncs within 5 min).

---

## 2. Before you start (per outlet)

You need three things:

1. **The outlet's heartbeat token** — one token per outlet, shared by all its devices.
   Found in `heartbeat_tokens.csv` (kept off GitHub — it's a secret).
2. **A station name for each device** — `POS-1`, `KDS-1`, `KDS-2`, `SOK-1`, `ODS-1` …
3. **The stations must exist in Supabase** (`public.outlet_stations`). A device reporting a
   station that isn't listed is **ignored**. Check / add in the Supabase SQL editor:

```sql
-- what stations does outlet 081 have?
select s.channel, s.station
from public.outlet_stations s join public.outlets o on o.outlet_id = s.outlet_id
where o.code = '081' order by 1, 2;

-- add a missing one (channel: pos | kds | kiosk | ods)
insert into public.outlet_stations (outlet_id, channel, station)
select outlet_id, 'kds', 'KDS-2' from public.outlets where code = '081';
```

### Station naming

| Device | `channel` | `station` |
|---|---|---|
| POS terminal | `pos` | `POS-1` (second POS = `POS-2`) |
| Kitchen display | `kds` | `KDS-1`, `KDS-2` … |
| Self-order kiosk | `kiosk` | `SOK-1`, `SOK-2` … |
| Order display TV | `ods` | `ODS-1` (no agent — pinged by POS) |

---

## 3. Windows devices — Telegraf

Do this over **AnyDesk**, in **PowerShell as Administrator**.

### 3.1 Install
1. Download Telegraf for Windows:
   `https://dl.influxdata.com/telegraf/releases/telegraf-1.40.1_windows_amd64.zip`
2. Extract to `C:\Program Files\InfluxData\telegraf\`

### 3.2 Config file
Generated configs are in `pos-agent/configs/<outlet_code>/telegraf.conf` (see section 6).
Copy it to `C:\Program Files\InfluxData\telegraf\telegraf.conf`, then check these lines:

```toml
[global_tags]
  outlet_code = "081"
  channel = "pos"          # pos | kds | kiosk  ← change on a KDS / SOK
  station = "POS-1"        # must match Supabase ← change on a KDS / SOK
```

- **App check** — set the app's process name (Task Manager → Details), and uncomment:
  ```toml
  [[inputs.procstat]]
    pid_finder = "native"
    exe = "PosApp.exe"
    fieldinclude = ["running"]
  ```
- **ODS ping (POS only)** — keep the `[[inputs.ping]]` block with the ODS IP.
  On a **KDS / SOK**, delete the ping block.
- **Token** — `Authorization = "Bearer hb_…"` (the outlet's token).

### 3.3 Test, then install as a service
```powershell
cd "C:\Program Files\InfluxData\telegraf"

# 1. Dry run — prints what it collects, sends nothing
.\telegraf.exe --config .\telegraf.conf --test
#    expect: mem, procstat_lookup (running=1), and ping (POS only)

# 2. Send once for real — check the dashboard turns green
.\telegraf.exe --config .\telegraf.conf --once

# 3. Install + start as a Windows service (starts on boot)
.\telegraf.exe --config "C:\Program Files\InfluxData\telegraf\telegraf.conf" service install
.\telegraf.exe service start
```

Log file: `C:\Program Files\InfluxData\telegraf\telegraf.log`

---

## 4. Android devices — Automate

For Sunmi / iMin POS, KDS and kiosks. Install **Automate** (LlamaLab) from the Play Store
or the Sunmi App Store / APK.

### 4.1 Flow 1 — heartbeat (required)

`Flow beginning` → `Failure catch` → **HTTP request** → `Delay 300 s` → back to HTTP request

**HTTP request** settings:

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `https://uptime-us-pizza-dashboard.fazdagroll.workers.dev/api/heartbeat` |
| Headers | `Authorization: Bearer <outlet token>` · `Content-Type: application/json` |
| Body | see below — **change `channel` and `station` per device** |

```json
{"metrics":[{"name":"alive","tags":{"channel":"kds","station":"KDS-1"},"fields":{"up":1}}]}
```

| Device | Tags |
|---|---|
| POS | `"channel":"pos","station":"POS-1"` |
| KDS 1 / 2 | `"channel":"kds","station":"KDS-1"` / `"KDS-2"` |
| Kiosk | `"channel":"kiosk","station":"SOK-1"` |

### 4.2 Flow 2 — app check (recommended)

`App foreground?` (**When changed**, pick the POS / KDS / kiosk app) → HTTP request → loop

Body — `running` is `1` when the app is in front, `0` when it isn't:

```json
{"metrics":[{"name":"procstat_lookup","tags":{"channel":"kds","station":"KDS-1"},"fields":{"running":1}}]}
```

### 4.3 Keep it running
- Automate → Settings → **Run on system startup** ✅
- Android Settings → Apps → Automate → Battery → **Unrestricted**
- Start both flows.

> Older Android agents that send `"pos_station":"POS-1"` still work and count as the POS.

---

## 5. Check it worked

1. Open the Uptime Monitor → find the outlet → the device should show **online** within a minute.
2. **Pilot test (during opening hours):**
   - Close the device's app → **CRITICAL** (POS) or **DEGRADED** (KDS/SOK) within ~2 min.
   - Reopen it → **RESOLVED** within ~1 min.
   - Stop the agent (Telegraf service / Automate flow) → flagged after ~12 min.
   - POS only: unplug the ODS network → **DEGRADED** within ~2 min.

---

## 6. Generating Telegraf configs for all outlets (admin)

Run once on the admin laptop from `pos-agent/`:

```powershell
pip install openpyxl
python generate_configs.py --excel "Outlet Info - FeedMe.xlsx" --tokens heartbeat_tokens.csv `
    --url https://uptime-us-pizza-dashboard.fazdagroll.workers.dev --process <PosApp.exe>
```

Output: `configs/<outlet_code>/telegraf.conf` — one **POS** config per outlet with the ODS ping
filled in from the equipment listing (commented out if the ODS has no IP yet).
For a Windows KDS/SOK, copy the POS config and change `channel`, `station`, the app
process name, and remove the ping block.

> 🔒 `heartbeat_tokens.csv` and `configs/` contain secret tokens — never commit them.

---

## 7. Troubleshooting

| Problem | Likely cause / fix |
|---|---|
| Device never appears | Station not in `outlet_stations`, or wrong `channel`/`station` spelling |
| `401 invalid token` in the log | Wrong / mistyped outlet token |
| App closed but still shows **up** | Outlet is outside opening hours; or `procstat` not set / wrong process name |
| Shows up as the POS instead of KDS | `channel` / `station` tags missing from the agent |
| Android agent stops overnight | Battery not set to Unrestricted, or "Run on system startup" off |
| Heartbeats return `500` | Cloudflare D1 daily write limit hit — resets 8am MYT |
