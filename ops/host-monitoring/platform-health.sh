#!/usr/bin/env bash
set -euo pipefail
OUT=/opt/tuku/platform/monitoring/status.json
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
mkdir -p "$(dirname "$OUT")"

http_status(){
  local url="$1" code
  code=$(curl -L -sS -o /dev/null -w '%{http_code}' --max-time 8 "$url" 2>/dev/null || echo 000)
  case "$code" in 2*|3*) echo healthy;; *) echo "unhealthy:$code";; esac
}
http_reachable(){
  local url="$1" code
  code=$(curl -L -sS -o /dev/null -w '%{http_code}' --max-time 8 "$url" 2>/dev/null || echo 000)
  case "$code" in 2*|3*|4*) echo reachable;; *) echo "unreachable:$code";; esac
}
container_state(){
  local c="$1"
  if ! docker inspect "$c" >/dev/null 2>&1; then echo missing; return; fi
  docker inspect -f '{{.State.Status}}/{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$c"
}
container_restarts(){ docker inspect -f '{{.RestartCount}}' "$1" 2>/dev/null || echo -1; }
latest_age_hours(){
  local dir="$1" pattern="$2" f mt now_epoch
  f=$(find "$dir" -type f -name "$pattern" -printf '%T@ %p\n' 2>/dev/null | sort -nr | sed -n '1p' | cut -d' ' -f2-)
  [ -n "${f:-}" ] || { echo -1; return; }
  mt=$(stat -c %Y "$f"); now_epoch=$(date +%s)
  echo $(( (now_epoch - mt) / 3600 ))
}

# Production estate checks. The frozen field deployment is intentionally excluded.
core_http=$(http_status https://core.tukutuku.org/health/ready)
iq_http=$(http_status https://tukuiq.tukutuku.org/health)
traffiq_http=$(http_status https://api.traffiq.tukutuku.org/health)
ecitaa_web_http=$(http_status https://ecitaa.tukutuku.org/)
ecitaa_api_http=$(http_status https://ecitaaapi.tukutuku.org/api/v1/health)
nena_http=$(http_status https://nena.tukutuku.org/)
steady_http=$(http_status https://steady.tukutuku.org/health)
units_http=$(http_status https://units.tukutuku.org/)
radar_http=$(http_status https://radar.tukutuku.org/health)
synced_http=$(http_status https://api.synced.tukutuku.org/api/v1/health)
impactos_http=$(http_status https://impactos.tukutuku.org/)

# Host metrics.
disk=$(df -P / | awk 'NR==2{gsub("%","",$5);print $5}')
inodes=$(df -Pi / | awk 'NR==2{gsub("%","",$5);print $5}')
mem=$(free -m | awk '/Mem:/{printf "%.1f", ($3/$2)*100}')
swap=$(free -m | awk '/Swap:/{if($2==0)printf "0.0"; else printf "%.1f", ($3/$2)*100}')
load1=$(awk '{print $1}' /proc/loadavg)

# Backup freshness for every stateful first-party service in this release estate.
core_bak=$(latest_age_hours /opt/tuku/backups/postgres/tuku-core '*.sql.gz.enc')
iq_bak=$(latest_age_hours /opt/tuku/backups/postgres/tukuiq '*.sql.gz.enc')
ec_bak=$(latest_age_hours /opt/tuku/backups/postgres/ecitaa '*.sql.gz.enc')
tr_bak=$(latest_age_hours /opt/tuku/backups/postgres/traffiq '*.sql.gz.enc')
un_bak=$(latest_age_hours /opt/tuku/backups/postgres/units '*.sql.gz.enc')
sy_bak=$(latest_age_hours /opt/tuku/backups/postgres/synced '*.sql.gz.enc')
ra_bak=$(latest_age_hours /opt/tuku/backups/postgres/radar '*.sql.gz.enc')
st_bak=$(latest_age_hours /opt/tuku/backups/postgres/steady '*.sql.gz.enc')
ne_bak=$(latest_age_hours /opt/tuku/backups/postgres/nena '*.sql.gz.enc')
im_bak=$(latest_age_hours /opt/tuku/backups/postgres/impactos '*.sql.gz.enc')
restore_ok=unknown
restore_finished=none
if [ -s /opt/tuku/platform/monitoring/restore-verification.json ]; then
  restore_ok=$(jq -r '.ok // false' /opt/tuku/platform/monitoring/restore-verification.json 2>/dev/null || echo false)
  restore_finished=$(jq -r '.finished_at // "none"' /opt/tuku/platform/monitoring/restore-verification.json 2>/dev/null || echo none)
fi

containers_json=$(for c in \
  tuku-core-api tuku-core-event-worker tuku-core-whatsapp-worker tuku-core-ai-worker \
  tukuiq-api tukuiq-intelligence-worker tukuiq-nena-provisioning-worker tukuiq-regulatory-worker \
  traffiq-iq-backend-api-1 traffiq-iq-backend-mobile-1 traffiq-iq-backend-postgres-1 \
  ecitaa-api ecitaa-web ecitaa-postgis nena-web nena-postgrest nena-postgres \
  steady-steady-api-1 steady-steady-worker-1 steady-steady-db-1 \
  units-web units-core-postgrest units-postgres \
  radar-api radar-worker radar-scheduler radar-db synced-api synced-postgres synced-redis impactos-web impactos-rest \
  jakeos-web jakeos-db kela-api kela-kds kela-db lendflow-api lendflow-web lendflow-worker lendflow-db lendflow-redis \
  prediq-api prediq-worker prediq-live-watcher prediq-db tukupay-api tukupay-db bcp-web-vps bcp-vps-api bcp-vps-db \
  tukutuku-site-auth tukutuku-site-rest tukutuku-site-storage tukutuku-site-postgres \
  tuku-platform-postgres tuku-core-redis tuku-local-llm tuku-edge; do
    jq -n --arg name "$c" --arg state "$(container_state "$c")" --argjson restarts "$(container_restarts "$c")" \
      '{name:$name,state:$state,restarts:$restarts}'
  done | jq -s '.')

severity=healthy
for s in "$core_http" "$iq_http" "$traffiq_http" "$ecitaa_web_http" "$nena_http" "$steady_http" "$units_http" "$radar_http" "$synced_http" "$impactos_http"; do
  [[ "$s" == healthy ]] || severity=critical
done
[[ "$ecitaa_api_http" == healthy ]] || severity=critical
if [ "$disk" -ge 90 ] || [ "${mem%.*}" -ge 95 ]; then severity=critical
elif [ "$disk" -ge 80 ] || [ "${mem%.*}" -ge 85 ] || [ "${swap%.*}" -ge 90 ]; then [ "$severity" = critical ] || severity=warning
fi
for age in "$core_bak" "$iq_bak" "$ec_bak" "$tr_bak" "$un_bak" "$sy_bak" "$ra_bak" "$st_bak" "$ne_bak" "$im_bak"; do
  if [ "$age" -lt 0 ] || [ "$age" -gt 30 ]; then severity=critical; fi
done
if [ "$restore_ok" != true ]; then [ "$severity" = critical ] || severity=warning; fi
worker_severity=$(jq -r '.severity // "unknown"' /opt/tuku/platform/monitoring/worker-health.json 2>/dev/null || echo unknown)
database_severity=$(jq -r '.severity // "unknown"' /opt/tuku/platform/monitoring/database-health.json 2>/dev/null || echo unknown)
security_severity=$(jq -r '.severity // "unknown"' /opt/tuku/platform/monitoring/security-health.json 2>/dev/null || echo unknown)
offsite_state=$(jq -r '.state // "unknown"' /opt/tuku/platform/monitoring/offsite-backup-status.json 2>/dev/null || echo unknown)
for sub in "$worker_severity" "$database_severity"; do
  [ "$sub" = critical ] && severity=critical
  [ "$sub" = warning ] && [ "$severity" != critical ] && severity=warning
done
# External backup absence is explicit operational debt, not a false green state.
[ "$offsite_state" = healthy ] || { [ "$severity" = critical ] || severity=warning; }

jq -n \
  --arg checked_at "$now" --arg severity "$severity" \
  --arg core "$core_http" --arg iq "$iq_http" --arg traffiq "$traffiq_http" \
  --arg ecitaa_web "$ecitaa_web_http" --arg ecitaa_api "$ecitaa_api_http" --arg nena "$nena_http" \
  --arg steady "$steady_http" --arg units "$units_http" --arg radar "$radar_http" --arg synced "$synced_http" --arg impactos "$impactos_http" \
  --argjson disk "$disk" --argjson inodes "$inodes" --argjson mem "$mem" --argjson swap "$swap" --arg load1 "$load1" \
  --argjson core_bak "$core_bak" --argjson iq_bak "$iq_bak" --argjson ec_bak "$ec_bak" --argjson tr_bak "$tr_bak" \
  --argjson un_bak "$un_bak" --argjson sy_bak "$sy_bak" --argjson ra_bak "$ra_bak" --argjson st_bak "$st_bak" --argjson ne_bak "$ne_bak" --argjson im_bak "$im_bak" \
  --arg restore_ok "$restore_ok" --arg restore_finished "$restore_finished" \
  --arg worker_severity "$worker_severity" --arg database_severity "$database_severity" --arg security_severity "$security_severity" --arg offsite_state "$offsite_state" \
  --argjson containers "$containers_json" \
  '{checked_at:$checked_at,severity:$severity,http:{tuku_core:$core,tukuiq:$iq,traffiq:$traffiq,ecitaa_web:$ecitaa_web,ecitaa_api:$ecitaa_api,nena:$nena,steady:$steady,units:$units,radar:$radar,synced:$synced,impactos:$impactos},host:{disk_used_percent:$disk,inode_used_percent:$inodes,memory_used_percent:$mem,swap_used_percent:$swap,load_1m:$load1},backup_age_hours:{tuku_core:$core_bak,tukuiq:$iq_bak,ecitaa:$ec_bak,traffiq:$tr_bak,units:$un_bak,synced:$sy_bak,radar:$ra_bak,steady:$st_bak,nena:$ne_bak,impactos:$im_bak},restore_verification:{ok:$restore_ok,finished_at:$restore_finished},subsystems:{workers:$worker_severity,databases:$database_severity,security:$security_severity,offsite_backup:$offsite_state},containers:$containers}' > "$TMP"
jq . "$TMP" > "$OUT"
chmod 640 "$OUT"
cat "$OUT"
