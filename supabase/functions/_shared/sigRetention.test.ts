import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildCloseMetadata,
  buildReopenMetadata,
  canDeleteSignatureImages,
  canReopenSession,
  normalizeRetentionDays,
  planSignatureImageDeletion,
} from './sigRetention.ts';

Deno.test('normalizeRetentionDays accepts presets and direct values within 1..365', () => {
  assertEquals(normalizeRetentionDays(undefined), 30);
  assertEquals(normalizeRetentionDays(30), 30);
  assertEquals(normalizeRetentionDays(60), 60);
  assertEquals(normalizeRetentionDays(90), 90);
  assertEquals(normalizeRetentionDays('120'), 120);
});

Deno.test('normalizeRetentionDays rejects unsafe direct values', () => {
  assertEquals(normalizeRetentionDays(0), null);
  assertEquals(normalizeRetentionDays(366), null);
  assertEquals(normalizeRetentionDays(30.5), null);
  assertEquals(normalizeRetentionDays('abc'), null);
});

Deno.test('canDeleteSignatureImages allows closed sessions only', () => {
  assertEquals(canDeleteSignatureImages('active'), false);
  assertEquals(canDeleteSignatureImages('draft'), false);
  assertEquals(canDeleteSignatureImages('closed'), true);
});

Deno.test('canReopenSession allows closed sessions only before image deletion', () => {
  assertEquals(canReopenSession('active', null), false);
  assertEquals(canReopenSession('draft', null), false);
  assertEquals(canReopenSession('closed', null), true);
  assertEquals(canReopenSession('closed', undefined), true);
  assertEquals(canReopenSession('closed', '2026-06-24T00:00:00.000Z'), false);
});

Deno.test('buildCloseMetadata starts cleanup after the selected retention days', () => {
  const now = new Date('2026-06-24T00:00:00.000Z');
  const metadata = buildCloseMetadata(now, 30);
  assertEquals(metadata.status, 'closed');
  assertEquals(metadata.closed_at, '2026-06-24T00:00:00.000Z');
  assertEquals(metadata.signature_retention_days, 30);
  assertEquals(metadata.signature_cleanup_after, '2026-07-24T00:00:00.000Z');
});

Deno.test('buildReopenMetadata restores active status and cancels cleanup schedule', () => {
  assertEquals(buildReopenMetadata(), {
    status: 'active',
    closed_at: null,
    signature_cleanup_after: null,
    signature_images_deleted_reason: null,
  });
});

Deno.test('planSignatureImageDeletion keeps exact session prefix and skips other sessions', () => {
  const plan = planSignatureImageDeletion('session-a', [
    { id: 'entry-1', signature_object_key: 'session-a/one.png' },
    { id: 'entry-2', signature_object_key: 'session-b/two.png' },
    { id: 'entry-3', signature_object_key: null },
    { id: 'entry-4', signature_object_key: 'session-a/../escape.png' },
  ]);

  assertEquals(plan.keys, ['session-a/one.png']);
  assertEquals(plan.entryIds, ['entry-1']);
  assertEquals(plan.skippedKeys, ['session-b/two.png', 'session-a/../escape.png']);
});

Deno.test('planSignatureImageDeletion is idempotent after pointers are already cleared', () => {
  const plan = planSignatureImageDeletion('session-a', [
    { id: 'entry-1', signature_object_key: null },
    { id: 'entry-2', signature_object_key: null },
  ]);

  assertEquals(plan.keys, []);
  assertEquals(plan.entryIds, []);
  assert(plan.skippedKeys.length === 0);
});
