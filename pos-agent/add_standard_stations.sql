-- Give every monitored outlet the same stations as 081 Kota Damansara:
-- POS-1, KDS-1, KDS-2, SOK-1, ODS-1. Run in the Supabase SQL editor (D1 syncs within ~5 min).
-- Safe to re-run: existing rows are skipped.
insert into uptime.outlet_stations (outlet_id, channel, station)
select o.outlet_id, v.channel, v.station
from public.outlets o
cross join (values ('pos','POS-1'),('kds','KDS-1'),('kds','KDS-2'),('kiosk','SOK-1'),('ods','ODS-1')) as v(channel, station)
where o.monitored
on conflict do nothing;
