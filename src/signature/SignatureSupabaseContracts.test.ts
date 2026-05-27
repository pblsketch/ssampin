import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = () =>
  readFileSync('supabase/migrations/029_signature_request_tables.sql', 'utf8');
const getPublicFunction = () =>
  readFileSync('supabase/functions/get-signature-request-public/index.ts', 'utf8');
const submitFunction = () => readFileSync('supabase/functions/submit-signature/index.ts', 'utf8');
const config = () => readFileSync('supabase/config.toml', 'utf8');

describe('signature request Supabase contracts', () => {
  it('defines private signature tables with token/PIN hashes and no public RLS writes', () => {
    const sql = migration();

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS signature_requests');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS signature_participants');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS signature_submissions');
    expect(sql).toContain('unique_link_token_hash TEXT');
    expect(sql).toContain('pin_hash TEXT');
    expect(sql).toContain('admin_key TEXT NOT NULL');
    expect(sql).toContain('ALTER TABLE signature_requests ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('signature_requests_service_all');
    expect(sql).not.toMatch(/signature_.*public_insert/i);
    expect(sql).not.toMatch(/WITH CHECK \(TRUE\)/i);
  });

  it('creates a private storage bucket for signature images', () => {
    const sql = migration();

    expect(sql).toContain("'signature-images'");
    expect(sql).toContain('public = false');
    expect(sql).toContain("ARRAY['image/png', 'image/webp']");
    expect(sql).toContain('signature_images_service_all');
  });

  it('uses Edge Functions with service role, token/PIN hashes, rate limits, and sanitized reads', () => {
    const getSource = getPublicFunction();
    const submitSource = submitFunction();

    expect(getSource).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(getSource).toContain('checkRateLimit');
    expect(getSource).toContain('unique_link_token_hash');
    expect(getSource).not.toContain('admin_key');

    expect(submitSource).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(submitSource).toContain('checkRateLimit');
    expect(submitSource).toContain('sha256Hex');
    expect(submitSource).toContain('pin_hash');
    expect(submitSource).toContain('signature-images');
    expect(submitSource).toContain('signature_submissions');
  });

  it('registers public get and submit functions in Supabase config', () => {
    const source = config();

    expect(source).toContain('[functions.get-signature-request-public]');
    expect(source).toContain('[functions.submit-signature]');
    expect(source).toMatch(/\[functions\.submit-signature\]\s+verify_jwt = true/);
  });

  it('registers publish-signature-request function with verify_jwt=true', () => {
    const source = config();
    expect(source).toContain('[functions.publish-signature-request]');
    expect(source).toMatch(/\[functions\.publish-signature-request\]\s+verify_jwt = true/);
  });
});
