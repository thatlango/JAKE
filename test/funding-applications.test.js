'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {normalize}=require('../server/funding-applications');
test('creates a valid application payload',()=>assert.equal(normalize({title:'AfCFTA application',status:'draft'},true).status,'draft'));
test('rejects absent title',()=>assert.throws(()=>normalize({status:'draft'},true),/Title required/));
test('rejects unknown status',()=>assert.throws(()=>normalize({title:'ECITAA',status:'approved'},true),/Invalid status/));
test('rejects insecure evidence URL',()=>assert.throws(()=>normalize({receipt_url:'http://example.org'},false),/requires HTTPS/));
test('accepts submission evidence metadata',()=>assert.equal(normalize({status:'submitted_verified',submission_channel:'Portal',submission_reference:'ABC123',submitted_at:'2026-09-04T10:00:00Z'}).submission_reference,'ABC123'));
