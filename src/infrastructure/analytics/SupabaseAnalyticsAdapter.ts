import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { IAnalyticsPort } from '@domain/ports/IAnalyticsPort';
import { generateUUID } from '@infrastructure/utils/uuid';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

const BATCH_SIZE = 10;
const BATCH_INTERVAL_MS = 30_000;
const MAX_OFFLINE_QUEUE = 500;
const OFFLINE_QUEUE_KEY = 'ssampin_analytics_queue';

interface AnalyticsRecord {
  event_id: string;
  event: string;
  properties: Record<string, unknown>;
  app_version: string;
  device_id: string;
  os_info: string;
  created_at: string;
}

export class SupabaseAnalyticsAdapter implements IAnalyticsPort {
  private readonly supabase: SupabaseClient | null;
  private buffer: AnalyticsRecord[] = [];
  private deviceId = '';
  private appVersion = '';
  private osInfo = '';
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.supabase = SUPABASE_URL && SUPABASE_ANON_KEY
      ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
      : null;
    this.osInfo = this.detectOsInfo();
    if (this.supabase) this.startTimer();
  }

  setDeviceId(id: string): void {
    this.deviceId = id;
  }

  setAppVersion(version: string): void {
    this.appVersion = version;
  }

  track(event: string, properties: Record<string, unknown> = {}): void {
    if (!this.supabase) return;

    // 개발 환경에서는 추적 건너뜀 (강제 플래그 없으면)
    const isDev = import.meta.env.DEV ||
      (typeof window !== 'undefined' && window.location.hostname === 'localhost');
    const forceAnalytics = typeof window !== 'undefined' &&
      localStorage.getItem('ssampin_force_analytics') === 'true';

    if (isDev && !forceAnalytics) {
      console.debug('[Analytics skip]', event, properties);
      return;
    }

    const record: AnalyticsRecord = {
      event_id: generateUUID(),
      event,
      properties,
      app_version: this.appVersion,
      device_id: this.deviceId,
      os_info: this.osInfo,
      created_at: new Date().toISOString(),
    };
    this.buffer.push(record);

    if (this.buffer.length >= BATCH_SIZE) {
      void this.sendBatch();
    }
  }

  async flush(): Promise<void> {
    this.stopTimer();
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;

    const offlineQueue = this.loadOfflineQueue();
    const toSend = [...offlineQueue, ...this.buffer];
    this.buffer = [];

    if (toSend.length === 0) return;

    // keepalive: true 로 beforeunload/페이지 종료 시에도 전송 보장
    try {
      fetch(`${SUPABASE_URL}/rest/v1/app_analytics?on_conflict=event_id`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=ignore-duplicates',
        },
        body: JSON.stringify(toSend),
        keepalive: true,
      }).then((res) => {
        if (res.ok) this.clearOfflineQueue();
        else this.saveToOfflineQueue(toSend);
      }).catch(() => {
        this.saveToOfflineQueue(toSend);
      });
    } catch {
      this.saveToOfflineQueue(toSend);
    }
  }

  // ── private ──

  private detectOsInfo(): string {
    if (typeof navigator !== 'undefined') {
      const platform = navigator.platform || 'unknown';
      const ua = navigator.userAgent || '';
      const archMatch = ua.match(/(?:WOW64|Win64|x86_64|x64|aarch64|arm64)/i);
      const arch = archMatch ? archMatch[0] : '';
      return `${platform} ${arch}`.trim();
    }
    return 'unknown';
  }

  private startTimer(): void {
    this.timer = setInterval(() => {
      if (this.buffer.length > 0) {
        void this.sendBatch();
      }
    }, BATCH_INTERVAL_MS);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async sendBatch(): Promise<void> {
    if (!this.supabase) return;

    const offlineQueue = this.loadOfflineQueue();
    const toSend = [...offlineQueue, ...this.buffer];
    this.buffer = [];

    if (toSend.length === 0) return;

    try {
      const { error } = await this.supabase
        .from('app_analytics')
        .upsert(toSend, { onConflict: 'event_id', ignoreDuplicates: true });

      if (error) {
        console.warn('[Analytics] Supabase insert failed:', error.message);
        this.saveToOfflineQueue(toSend);
      } else {
        this.clearOfflineQueue();
      }
    } catch (err) {
      console.warn('[Analytics] Network error:', err);
      this.saveToOfflineQueue(toSend);
    }
  }

  private loadOfflineQueue(): AnalyticsRecord[] {
    try {
      const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed as AnalyticsRecord[];
    } catch {
      return [];
    }
  }

  private saveToOfflineQueue(records: AnalyticsRecord[]): void {
    try {
      const existing = this.loadOfflineQueue();
      const merged = [...existing, ...records];
      const trimmed = merged.slice(-MAX_OFFLINE_QUEUE);
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(trimmed));
    } catch {
      // localStorage 접근 불가 시 무시
    }
  }

  private clearOfflineQueue(): void {
    try {
      localStorage.removeItem(OFFLINE_QUEUE_KEY);
    } catch {
      // ignore
    }
  }
}
