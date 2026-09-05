#!/usr/bin/env python3
"""Read-only VPS telemetry collector for JakeOS Estate Operations."""
from __future__ import annotations
import json, os, platform, socket, subprocess, time, urllib.request
from pathlib import Path

ENV_FILE = os.getenv("JAKEOS_ENV_FILE", "/opt/tuku/secrets/estate-product-telemetry.env")
ENDPOINT = os.getenv("JAKEOS_OPS_ENDPOINT", "https://jakeos.tukutuku.org/api/integrations/v1/ops/snapshot")
BACKUP_ENDPOINT = os.getenv("JAKEOS_BACKUP_ENDPOINT", "https://jakeos.tukutuku.org/api/integrations/v1/ops/backup")
BACKUP_ROOT = Path(os.getenv("TUKU_BACKUP_ROOT", "/opt/tuku/backups"))


def load_env(path: str) -> dict[str, str]:
    values = {}
    try:
        for raw in Path(path).read_text().splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    except OSError:
        pass
    return values


def command(*args: str) -> str:
    try:
        return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL, timeout=8).strip()
    except Exception:
        return ""


def cpu_percent() -> float | None:
    def sample():
        fields = [int(x) for x in Path("/proc/stat").read_text().splitlines()[0].split()[1:]]
        idle = fields[3] + (fields[4] if len(fields) > 4 else 0)
        return sum(fields), idle
    try:
        total1, idle1 = sample(); time.sleep(0.25); total2, idle2 = sample()
        delta = total2 - total1
        return round((1 - (idle2 - idle1) / delta) * 100, 1) if delta else None
    except Exception:
        return None


def memory_percent() -> float | None:
    try:
        mem = {}
        for line in Path("/proc/meminfo").read_text().splitlines():
            key, value = line.split(":", 1)
            mem[key] = int(value.strip().split()[0])
        total, available = mem["MemTotal"], mem.get("MemAvailable", mem.get("MemFree", 0))
        return round((total - available) * 100 / total, 1)
    except Exception:
        return None


def disk_percent() -> float | None:
    try:
        stat = os.statvfs("/")
        total = stat.f_blocks * stat.f_frsize
        available = stat.f_bavail * stat.f_frsize
        return round((total - available) * 100 / total, 1) if total else None
    except Exception:
        return None


def containers() -> list[dict]:
    raw = command("docker", "ps", "-a", "--format", "{{json .}}")
    if not raw:
        return []
    result = []
    for line in raw.splitlines()[:250]:
        try:
            row = json.loads(line)
            status = row.get("Status", "")
            result.append({
                "name": row.get("Names") or row.get("ID"),
                "image": row.get("Image"),
                "status": status,
                "health": "unhealthy" if "unhealthy" in status.lower() else ("healthy" if "healthy" in status.lower() else None),
                "running": status.lower().startswith("up"),
            })
        except Exception:
            continue
    return result


def post(url: str, token: str, payload: dict) -> None:
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST", headers={
        "Content-Type": "application/json", "X-JakeOS-Ingest-Token": token,
    })
    with urllib.request.urlopen(req, timeout=12) as response:
        if response.status >= 300:
            raise RuntimeError(f"JakeOS returned HTTP {response.status}")


def latest_backup() -> dict | None:
    try:
        candidates = [p for p in BACKUP_ROOT.rglob("*") if p.is_file() and not p.name.startswith(".")]
        if not candidates:
            return None
        latest = max(candidates, key=lambda p: p.stat().st_mtime)
        stat = latest.stat()
        return {
            "id": "tuku-vps-latest", "name": "Tuku VPS latest backup", "target": str(latest),
            "status": "healthy" if time.time() - stat.st_mtime < 36 * 3600 else "stale",
            "sizeBytes": stat.st_size,
            "completedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(stat.st_mtime)),
            "metadata": {"source": "vps-agent", "backupRoot": str(BACKUP_ROOT)},
        }
    except Exception:
        return None


def main() -> int:
    env = load_env(ENV_FILE)
    token = os.getenv("OPS_INGEST_TOKEN") or env.get("OPS_INGEST_TOKEN") or env.get("JAKEOS_INGEST_TOKEN") or env.get("TUKU_ESTATE_INSIGHTS_SECRET")
    if not token:
        raise RuntimeError("No JakeOS ops ingest credential is configured")
    loads = os.getloadavg()
    payload = {
        "host": {
            "id": "tuku-prod-ovh", "label": "Tuku production VPS", "hostname": socket.gethostname(),
            "provider": "OVH", "kernel": platform.release(), "arch": platform.machine(),
            "cpuPercent": cpu_percent(), "memoryPercent": memory_percent(), "diskPercent": disk_percent(),
            "load1": round(loads[0], 2), "load5": round(loads[1], 2), "load15": round(loads[2], 2),
            "uptimeSeconds": int(float(Path("/proc/uptime").read_text().split()[0])),
        },
        "containers": containers(),
    }
    post(ENDPOINT, token, payload)
    backup = latest_backup()
    if backup:
        post(BACKUP_ENDPOINT, token, backup)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
