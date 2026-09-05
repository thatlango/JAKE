#!/bin/sh
set -eu
set -a
. /opt/tuku/secrets/jakeos.env
[ ! -r /opt/tuku/secrets/estate-product-telemetry.env ] || . /opt/tuku/secrets/estate-product-telemetry.env
set +a

TOKEN="${OPS_INGEST_TOKEN:-${JAKEOS_INGEST_TOKEN:-${TUKU_ESTATE_INSIGHTS_SECRET:-}}}"
[ -n "$TOKEN" ] || exit 1

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

python3 - <<'PY' > "$TMP"
import json, os, shutil, socket, subprocess, time

def cpu_sample():
    with open('/proc/stat') as f:
        p = list(map(int, f.readline().split()[1:]))
    idle = p[3] + (p[4] if len(p) > 4 else 0)
    return idle, sum(p)

i1, t1 = cpu_sample()
time.sleep(0.2)
i2, t2 = cpu_sample()
cpu = 0.0 if t2 == t1 else (1 - (i2 - i1) / (t2 - t1)) * 100

mem = {}
with open('/proc/meminfo') as f:
    for line in f:
        k, v = line.split(':', 1)
        mem[k] = int(v.strip().split()[0]) * 1024
mt = mem.get('MemTotal', 0)
ma = mem.get('MemAvailable', 0)
mu = max(0, mt - ma)

disk = shutil.disk_usage('/')
containers = []
try:
    ids = subprocess.check_output(['docker', 'ps', '-aq'], text=True).split()
    raw = subprocess.check_output(['docker', 'inspect'] + ids, text=True) if ids else '[]'
    for c in json.loads(raw or '[]'):
        state = c.get('State') or {}
        containers.append({
            'name': (c.get('Name') or '').lstrip('/'),
            'image': (c.get('Config') or {}).get('Image'),
            'running': bool(state.get('Running')),
            'status': state.get('Status'),
            'health': (state.get('Health') or {}).get('Status'),
            'restarts': c.get('RestartCount', 0),
            'startedAt': state.get('StartedAt')
        })
except Exception as e:
    containers = [{
        'name': 'docker-inventory',
        'running': False,
        'status': 'collector-error',
        'health': None,
        'error': str(e)
    }]

load = os.getloadavg()
uptime = float(open('/proc/uptime').read().split()[0])

print(json.dumps({
    'host': {
        'id': 'tuku-prod-ovh',
        'label': 'Tuku production VPS',
        'hostname': socket.gethostname(),
        'provider': 'OVH',
        'cpu_percent': round(cpu, 2),
        'memory_percent': round((mu / mt * 100) if mt else 0, 2),
        'disk_percent': round(disk.used / disk.total * 100, 2),
        'load1': load[0],
        'load5': load[1],
        'load15': load[2],
        'uptime_seconds': round(uptime),
        'memory_total_bytes': mt,
        'memory_used_bytes': mu,
        'disk_total_bytes': disk.total,
        'disk_used_bytes': disk.used
    },
    'containers': containers
}))
PY

curl -fsS --max-time 20 \
  -H "x-jakeos-ingest-token: $TOKEN" \
  -H 'Content-Type: application/json' \
  --data-binary @"$TMP" \
  https://jakeos.tukutuku.org/api/integrations/v1/ops/snapshot >/dev/null
