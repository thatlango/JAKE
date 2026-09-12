# JakeOS host monitoring

These files are the versioned source copies of the production VPS telemetry collectors deployed under `/opt/tuku/bin`.

Production mappings:

- `database-health.py` -> `/opt/tuku/bin/database-health.py`
- `platform-health.sh` -> `/opt/tuku/bin/platform-health.sh`
- `platform-worker-health.sh` -> `/opt/tuku/bin/platform-worker-health.sh`
- `security-health.sh` -> `/opt/tuku/bin/security-health.sh`

JakeOS ingests their JSON output from `/opt/tuku/platform/monitoring` through `ops-agent/jakeos_ops_agent.py` and `ops/collector.sh`.

Warning/degraded subsystem states are emitted as telemetry and must not make the collector process fail. JakeOS is responsible for turning those states, and stale collector timestamps, into attention signals.
