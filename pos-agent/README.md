# POS agent (Telegraf) — install guide

Each Windows POS runs Telegraf as a service. Every minute it checks the POS app
and pings the outlet's KDS / kiosk, and sends to the dashboard **only when
something changes**, plus an "I'm alive" refresh every 5 minutes.

## 1. Generate the configs (once, on your laptop)

The tokens are secrets — `heartbeat_tokens.csv` and `configs/` must never be committed.

```
pip install openpyxl
python generate_configs.py --excel "Outlet Info - FeedMe.xlsx" --tokens heartbeat_tokens.csv ^
    --url https://<your-dashboard-domain> --process <PosApp.exe>
```

Output: `configs/<outlet_code>/telegraf.conf`. KDS/kiosk entries without an IP in the
equipment listing are left commented — fill in the IP and uncomment.

## 2. Install on a POS (over AnyDesk, PowerShell **as Administrator**)

1. Download `telegraf-1.40.1_windows_amd64.zip` from
   https://dl.influxdata.com/telegraf/releases/telegraf-1.40.1_windows_amd64.zip
   and extract to `C:\Program Files\InfluxData\telegraf\`
2. Copy that outlet's `telegraf.conf` into the same folder.
3. Test (prints what it collects, sends nothing):
   ```
   cd "C:\Program Files\InfluxData\telegraf"
   .\telegraf.exe --config "C:\Program Files\InfluxData\telegraf\telegraf.conf" --test
   ```
   You should see `mem`, `procstat_lookup` (running=1) and `ping` lines.
4. Send once for real, then check the outlet turns green on the dashboard:
   ```
   .\telegraf.exe --config "C:\Program Files\InfluxData\telegraf\telegraf.conf" --once
   ```
5. Install and start the service:
   ```
   .\telegraf.exe --config "C:\Program Files\InfluxData\telegraf\telegraf.conf" service install
   .\telegraf.exe service start
   ```

Logs: `C:\Program Files\InfluxData\telegraf\telegraf.log`

## Pilot checklist

- Close the POS app → outlet shows **CRITICAL** within ~2 min; reopen → **RESOLVED** within ~1 min.
- Unplug a KDS → **DEGRADED** within ~2 min.
- Stop the Telegraf service → **CRITICAL** after ~12 min (heartbeat timeout).
