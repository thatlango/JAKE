#!/usr/bin/env bash
set -euo pipefail
OUT=/opt/tuku/platform/monitoring/security-health.json
TMP=$(mktemp); trap 'rm -f "$TMP"' EXIT
now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
install -d -m 0755 /run/sshd
password_auth=$(/usr/sbin/sshd -T | awk '$1=="passwordauthentication"{v=$2} END{print v}')
root_login=$(/usr/sbin/sshd -T | awk '$1=="permitrootlogin"{v=$2} END{print v}')
ufw=$(ufw status 2>/dev/null | awk 'NR==1{print tolower($2)}')
ufw_rules=$(ufw status 2>/dev/null || true)
public_ssh_rule=false
if printf '%s\n' "$ufw_rules" | awk '$1=="22/tcp" && $2=="ALLOW" {found=1} END{exit !found}'; then public_ssh_rule=true; fi
tailscale_ssh_rule=false
if printf '%s\n' "$ufw_rules" | awk '$1=="22/tcp" && $2=="on" && $3=="tailscale0" && $4=="ALLOW" {found=1} END{exit !found}'; then tailscale_ssh_rule=true; fi
f2b=$(systemctl is-active fail2ban 2>/dev/null || true)
banned=$(fail2ban-client status sshd 2>/dev/null | awk -F: '/Currently banned/{gsub(/[[:space:]]/,"",$2);v=$2} END{print v}')
tailscale_state=$(tailscale status --json 2>/dev/null | jq -r '.BackendState // "Unknown"' 2>/dev/null || echo Unknown)
reboot=false; [ -f /var/run/reboot-required ] && reboot=true
updates=$(apt list --upgradable 2>/dev/null | tail -n +2 | grep -c . || true)
severity=ok; reasons=()
warn(){ severity=warning; reasons+=("$1"); }
[ "$root_login" = no ] || warn root_ssh_login_not_disabled
[ "$ufw" = active ] || warn firewall_not_active
[ "$public_ssh_rule" = false ] || warn public_ssh_firewall_rule_present
[ "$tailscale_ssh_rule" = true ] || warn tailscale_ssh_firewall_rule_missing
[ "$f2b" = active ] || warn fail2ban_not_active
[ "$password_auth" = no ] || warn ssh_password_auth_still_enabled
[ "$tailscale_state" = Running ] || warn tailscale_not_authenticated
[ "$reboot" = false ] || warn reboot_required
[ "$updates" -eq 0 ] || warn package_updates_pending
reasons_json=$(printf '%s\n' "${reasons[@]:-}" | jq -R . | jq -s 'map(select(length>0))')
jq -n --arg t "$now" --arg severity "$severity" --argjson reasons "$reasons_json" \
 --arg password_auth "$password_auth" --arg root_login "$root_login" --arg ufw "$ufw" --arg fail2ban "$f2b" \
 --argjson public_ssh_rule "$public_ssh_rule" --argjson tailscale_ssh_rule "$tailscale_ssh_rule" \
 --argjson banned "${banned:-0}" --arg tailscale "$tailscale_state" --argjson reboot "$reboot" --argjson updates "$updates" \
 '{checked_at:$t,severity:$severity,reasons:$reasons,ssh:{password_authentication:$password_auth,permit_root_login:$root_login},firewall:{state:$ufw,public_ssh_rule:$public_ssh_rule,tailscale_ssh_rule:$tailscale_ssh_rule},fail2ban:{state:$fail2ban,currently_banned:$banned},tailscale:$tailscale,reboot_required:$reboot,pending_package_updates:$updates}' > "$TMP"
jq . "$TMP" > "$OUT"; chmod 640 "$OUT"; cat "$OUT"
exit 0
