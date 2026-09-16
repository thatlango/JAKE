import React from 'react';
import { EmptyState, Metric, Panel, Pill, StateBanner } from './ProductUI';

function age(value){
  if(!value)return 'not recorded';
  const ms=Date.now()-new Date(value).getTime();
  if(!Number.isFinite(ms))return 'unknown';
  if(ms<60000)return 'just now';
  if(ms<3600000)return Math.floor(ms/60000)+'m ago';
  if(ms<86400000)return Math.floor(ms/3600000)+'h ago';
  return Math.floor(ms/86400000)+'d ago';
}

function activityTone(status){
  if(status==='active_now')return 'success';
  if(status==='recent')return 'neutral';
  if(status==='stale')return 'warning';
  if(status==='dormant')return 'danger';
  return 'neutral';
}

function activityLabel(status){
  if(status==='active_now')return 'Online now';
  if(status==='recent')return 'Active today';
  if(status==='stale')return 'Quiet';
  if(status==='dormant')return 'Dormant';
  return 'Unknown';
}

export default function ECITAADeviceTelemetry({domainTelemetry}){
  const registry=domainTelemetry?.payload?.fieldDevices;
  if(!registry||!Array.isArray(registry.devices))return null;

  const versions=Array.isArray(registry.versions)?registry.versions:[];
  const visibleDevices=registry.devices.slice(0,20);
  const attention=[];
  if(Number(registry.pendingItems||0)>0){
    attention.push(
      String(registry.pendingItems)+' pending item'+(Number(registry.pendingItems)===1?'':'s')+
      ' reported across '+String(registry.queuedDevices||0)+' device'+(Number(registry.queuedDevices)===1?'':'s')+'.'
    );
  }
  if(Number(registry.pendingSyncRequests||0)>0){
    attention.push(
      String(registry.pendingSyncRequests)+' server sync request'+
      (Number(registry.pendingSyncRequests)===1?' is':'s are')+
      ' still waiting for device acknowledgement.'
    );
  }
  if(Number(registry.failedIntakes24h||0)>0){
    attention.push(
      String(registry.failedIntakes24h)+' sync intake'+
      (Number(registry.failedIntakes24h)===1?' failed':'s failed')+
      ' in the last 24 hours.'
    );
  }

  return <Panel
    title="ECITAA Field devices & sync"
    subtitle="Live fleet telemetry from Field heartbeats, queue reports and the server sync intake journal."
  >
    <div className="px-metrics estate-device-metrics">
      <Metric icon="users" label="Registered" value={registry.total||0} helper="Field devices"/>
      <Metric icon="check" label="Online now" value={registry.activeNow||0} helper="Heartbeat within 15 min" tone={registry.activeNow?'success':'neutral'}/>
      <Metric icon="clock" label="Active / 24h" value={registry.recent24h||0} helper={String(registry.recent7d||0)+' active / 7d'}/>
      <Metric icon="warning" label="Queued devices" value={registry.queuedDevices||0} helper={String(registry.pendingItems||0)+' pending items'} tone={registry.queuedDevices?'warning':'neutral'}/>
      <Metric icon="refresh" label="Sync requests" value={registry.pendingSyncRequests||0} helper="Awaiting acknowledgement" tone={registry.pendingSyncRequests?'warning':'neutral'}/>
      <Metric icon="warning" label="Failed intake / 24h" value={registry.failedIntakes24h||0} helper={String(registry.completedIntakes24h||0)+' completed'} tone={registry.failedIntakes24h?'danger':'success'}/>
    </div>

    {attention.length>0&&<StateBanner tone="warning" title="Field sync needs attention">{attention.join(' ')}</StateBanner>}

    {versions.length>0&&<div className="estate-device-versions">
      <div className="px-brief-label">Field app versions</div>
      <div className="estate-device-version-grid">
        {versions.map(version=><div className="estate-device-version" key={version.appVersion||'unknown'}>
          <strong>{version.appVersion||'Unknown version'}</strong>
          <span>{version.devices||0} device{Number(version.devices)===1?'':'s'} · {version.active24h||0} active / 24h</span>
          <small>Last seen {age(version.lastSeenAt)}</small>
        </div>)}
      </div>
    </div>}

    {visibleDevices.length?<div className="px-list estate-device-list">
      {visibleDevices.map(device=><div className="px-list-row" key={device.deviceUid}>
        <div className="px-list-main">
          <div className="estate-device-title-row">
            <div className="px-list-title">{device.actorName||device.deviceName||'Unassigned ECITAA device'}</div>
            <div className="estate-device-pills">
              <Pill tone={activityTone(device.activityStatus)}>{activityLabel(device.activityStatus)}</Pill>
              {device.syncRequestPending&&<Pill tone="warning">Sync requested</Pill>}
              {Number(device.pendingTotal||0)>0&&<Pill tone="danger">{device.pendingTotal} queued</Pill>}
            </div>
          </div>
          <div className="px-list-sub">
            {device.organizationName||'Organisation unknown'}
            {device.countryCode?' · '+device.countryCode:''}
            {' · '}
            {device.appVersion||'version unknown'}
          </div>
          <div className="px-list-sub estate-device-meta">
            <span>{device.devicePlatform||'platform unknown'}</span>
            <span>last use {age(device.lastSeenAt)}</span>
            <span>last sync {age(device.lastSyncAt)}</span>
            <span>intake {device.lastIntakeStatus||'not recorded'}</span>
            {device.lastIntakeErrorCode&&<span className="estate-device-error">{device.lastIntakeErrorCode}</span>}
            <span className="estate-device-uid">{String(device.deviceUid||'').slice(0,8)}…</span>
          </div>
        </div>
      </div>)}
    </div>:<EmptyState icon="warning" title="No ECITAA Field devices registered" body="Device heartbeat records will appear here after Field devices contact Core."/>}

    {registry.devices.length>visibleDevices.length&&<div className="px-kicker estate-device-foot">
      Showing the 20 most recently seen devices of {registry.devices.length} returned by ECITAA.
    </div>}
    <div className="px-kicker estate-device-foot">
      Queue counts are the latest values reported by each Field device. Local work created after a device goes offline is not visible to JakeOS until that device reconnects.
    </div>
  </Panel>;
}
