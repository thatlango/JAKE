#!/usr/bin/env bash
set -euo pipefail
ROOT=/opt/tuku
OUT="$ROOT/platform/monitoring/worker-health.json"
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
mkdir -p "$(dirname "$OUT")"
now=$(date -u +%Y-%m-%dT%H:%M:%SZ)

set -a
. "$ROOT/secrets/tuku-core-db.env"
CORE_USER="$TUKU_CORE_DB_USER"; CORE_PASS="$TUKU_CORE_DB_PASSWORD"; CORE_DB="$TUKU_CORE_DB_NAME"
. "$ROOT/secrets/tukuiq-db.env"
IQ_USER="$TUKUIQ_DB_USER"; IQ_PASS="$TUKUIQ_DB_PASSWORD"; IQ_DB="$TUKUIQ_DB_NAME"
set +a

core_sql(){ docker exec -e PGPASSWORD="$CORE_PASS" tuku-platform-postgres psql -XAtq -v ON_ERROR_STOP=1 -U "$CORE_USER" -d "$CORE_DB" -c "$1" 2>/dev/null || true; }
iq_sql(){ docker exec -e PGPASSWORD="$IQ_PASS" tuku-platform-postgres psql -XAtq -v ON_ERROR_STOP=1 -U "$IQ_USER" -d "$IQ_DB" -c "$1" 2>/dev/null || true; }
num(){ local v="${1:-0}"; [[ "$v" =~ ^-?[0-9]+([.][0-9]+)?$ ]] && printf '%s' "$v" || printf '0'; }
container_state(){ docker inspect -f '{{.State.Status}}' "$1" 2>/dev/null || echo missing; }
container_restarts(){ docker inspect -f '{{.RestartCount}}' "$1" 2>/dev/null || echo -1; }

events_ttl=$(docker exec tuku-core-redis redis-cli TTL bull:tuku-core-events:stalled-check 2>/dev/null || echo -2)
whatsapp_ttl=$(docker exec tuku-core-redis redis-cli TTL bull:tuku-core-whatsapp:stalled-check 2>/dev/null || echo -2)

core_ai_pending=$(core_sql "select count(*) from core.ai_jobs where status='pending' and scheduled_at<=now();")
core_ai_processing_stale=$(core_sql "select count(*) from core.ai_jobs where status='processing' and coalesce(started_at,updated_at)<now()-interval '30 minutes';")
core_ai_failed=$(core_sql "select count(*) from core.ai_jobs where status='failed';")
core_ai_oldest=$(core_sql "select coalesce(round(extract(epoch from now()-min(scheduled_at))/60),0)::bigint from core.ai_jobs where status='pending' and scheduled_at<=now();")

core_event_due=$(core_sql "select count(*) from core.event_outbox where status in ('pending','failed') and available_at<=now();")
core_event_stale=$(core_sql "select count(*) from core.event_outbox where status='processing' and locked_at<now()-interval '15 minutes';")
core_event_dead=$(core_sql "select count(*) from core.event_outbox where status='dead_letter';")
core_event_oldest=$(core_sql "select coalesce(round(extract(epoch from now()-min(available_at))/60),0)::bigint from core.event_outbox where status in ('pending','failed') and available_at<=now();")

wa_pending=$(core_sql "select count(*) from public.whatsapp_messages where processing_status in ('pending','failed');")
wa_stale=$(core_sql "select count(*) from public.whatsapp_messages where processing_status='processing' and processing_started_at<now()-interval '15 minutes';")
wa_dead=$(core_sql "select count(*) from public.whatsapp_messages where processing_status='dead_letter';")
wa_oldest=$(core_sql "select coalesce(round(extract(epoch from now()-min(created_at))/60),0)::bigint from public.whatsapp_messages where processing_status in ('pending','failed');")

iq_pending=$(iq_sql "select count(*) from iq.intelligence_jobs where status='PENDING' and scheduled_at<=now();")
iq_stale=$(iq_sql "select count(*) from iq.intelligence_jobs where status='PROCESSING' and started_at<now()-interval '30 minutes';")
iq_failed=$(iq_sql "select count(*) from iq.intelligence_jobs where status='FAILED';")
iq_oldest=$(iq_sql "select coalesce(round(extract(epoch from now()-min(scheduled_at))/60),0)::bigint from iq.intelligence_jobs where status='PENDING' and scheduled_at<=now();")

reg_pending=$(iq_sql "select count(*) from iq.regulatory_projection_receipts where status='PENDING';")
reg_stale=$(iq_sql "select count(*) from iq.regulatory_projection_receipts where status='PROCESSING' and updated_at<now()-interval '30 minutes';")
reg_failed=$(iq_sql "select count(*) from iq.regulatory_projection_receipts where status='FAILED';")

nena_waiting=$(iq_sql "select count(*) from iq.core_event_receipts where processing_status='WAITING_FOR_BUSINESS_LINK' and event_type='business.source_observed.v1' and lower(coalesce(metadata->>'producer',''))='nena' and coalesce(metadata->>'sourceSystem','')='nena-lovable';")
nena_failed=$(iq_sql "select count(*) from iq.core_event_receipts where processing_status='FAILED' and lower(coalesce(metadata->>'producer',''))='nena';")
nena_oldest=$(iq_sql "select coalesce(round(extract(epoch from now()-min(received_at))/60),0)::bigint from iq.core_event_receipts where processing_status='WAITING_FOR_BUSINESS_LINK' and event_type='business.source_observed.v1' and lower(coalesce(metadata->>'producer',''))='nena' and coalesce(metadata->>'sourceSystem','')='nena-lovable';")

severity=ok
reasons=()
add_warn(){ severity=warning; reasons+=("$1"); }
[ "$(num "$events_ttl")" -gt 0 ] || add_warn "event_worker_bullmq_heartbeat_missing"
[ "$(num "$whatsapp_ttl")" -gt 0 ] || add_warn "whatsapp_worker_bullmq_heartbeat_missing"
[ "$(num "$core_ai_processing_stale")" -eq 0 ] || add_warn "core_ai_stale_processing"
[ "$(num "$core_event_stale")" -eq 0 ] || add_warn "core_event_stale_processing"
[ "$(num "$core_event_dead")" -eq 0 ] || add_warn "core_event_dead_letters"
[ "$(num "$wa_stale")" -eq 0 ] || add_warn "whatsapp_stale_processing"
[ "$(num "$wa_dead")" -eq 0 ] || add_warn "whatsapp_dead_letters"
[ "$(num "$iq_stale")" -eq 0 ] || add_warn "tukuiq_stale_processing"
[ "$(num "$reg_stale")" -eq 0 ] || add_warn "regulatory_stale_processing"
[ "$(num "$reg_failed")" -eq 0 ] || add_warn "regulatory_failed"
[ "$(num "$nena_failed")" -eq 0 ] || add_warn "nena_failed"
[ "$(num "$core_ai_oldest")" -le 30 ] || add_warn "core_ai_backlog_over_30m"
[ "$(num "$core_event_oldest")" -le 15 ] || add_warn "core_event_backlog_over_15m"
[ "$(num "$wa_oldest")" -le 15 ] || add_warn "whatsapp_backlog_over_15m"
[ "$(num "$iq_oldest")" -le 30 ] || add_warn "tukuiq_backlog_over_30m"
[ "$(num "$nena_oldest")" -le 30 ] || add_warn "nena_backlog_over_30m"
for c in tuku-core-event-worker tuku-core-whatsapp-worker tuku-core-ai-worker tukuiq-intelligence-worker tukuiq-regulatory-worker tukuiq-nena-provisioning-worker; do
  [ "$(container_state "$c")" = running ] || add_warn "container_${c}_not_running"
  r=$(container_restarts "$c"); [ "$(num "$r")" -le 3 ] || add_warn "container_${c}_restart_loop"
done

reasons_json=$(printf '%s\n' "${reasons[@]:-}" | jq -R . | jq -s 'map(select(length>0))')
jq -n \
  --arg checked "$now" --arg severity "$severity" --argjson reasons "$reasons_json" \
  --argjson events_ttl "$(num "$events_ttl")" --argjson whatsapp_ttl "$(num "$whatsapp_ttl")" \
  --argjson caip "$(num "$core_ai_pending")" --argjson cais "$(num "$core_ai_processing_stale")" --argjson caif "$(num "$core_ai_failed")" --argjson caio "$(num "$core_ai_oldest")" \
  --argjson ced "$(num "$core_event_due")" --argjson ces "$(num "$core_event_stale")" --argjson cedd "$(num "$core_event_dead")" --argjson ceo "$(num "$core_event_oldest")" \
  --argjson wap "$(num "$wa_pending")" --argjson was "$(num "$wa_stale")" --argjson wad "$(num "$wa_dead")" --argjson wao "$(num "$wa_oldest")" \
  --argjson iqp "$(num "$iq_pending")" --argjson iqs "$(num "$iq_stale")" --argjson iqf "$(num "$iq_failed")" --argjson iqo "$(num "$iq_oldest")" \
  --argjson rp "$(num "$reg_pending")" --argjson rs "$(num "$reg_stale")" --argjson rf "$(num "$reg_failed")" \
  --argjson nw "$(num "$nena_waiting")" --argjson nf "$(num "$nena_failed")" --argjson no "$(num "$nena_oldest")" \
  '{checked_at:$checked,severity:$severity,reasons:$reasons,
    core:{bullmq:{event_ttl_seconds:$events_ttl,whatsapp_ttl_seconds:$whatsapp_ttl},
      ai_jobs:{pending_due:$caip,stale_processing:$cais,failed:$caif,oldest_pending_minutes:$caio},
      event_outbox:{due:$ced,stale_processing:$ces,dead_letter:$cedd,oldest_due_minutes:$ceo},
      whatsapp:{pending_or_failed:$wap,stale_processing:$was,dead_letter:$wad,oldest_pending_minutes:$wao}},
    tukuiq:{intelligence_jobs:{pending_due:$iqp,stale_processing:$iqs,failed:$iqf,oldest_pending_minutes:$iqo},
      regulatory:{pending:$rp,stale_processing:$rs,failed:$rf},
      nena_provisioning:{waiting:$nw,failed:$nf,oldest_waiting_minutes:$no}}}' > "$TMP"
jq . "$TMP" > "$OUT"
chmod 640 "$OUT"
cat "$OUT"
exit 0
