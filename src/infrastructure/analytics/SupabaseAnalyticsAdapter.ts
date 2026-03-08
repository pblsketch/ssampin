import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { IAnalyticsPort } from '@domain/ports/IAnalyticsPort';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

const BATCH_SIZE = 10;
const BATCH_INTERVAL_MS = 30_000;
const MAX_OFFLINE_QUEUE = 500;
const OFFLINE_QUEUE_KEY = 'ssampin_analytics_queue';

interface AnalyticsRecord {
  event: string;
  properties: Record<string, unknown>;
  app_version: string;
  device_id: string;
  os_info: string;
  created_at: string;
}

export class SupabaseAnalyticsAdapter implements IAnalyticsPort {
  private readonly supabase: SupabaseClient;
  private buffer: AnalyticsRecord[] = [];
  private deviceId = '';
  private appVersion = '';
  private osInfo = '';
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    this.osInfo = this.detectOsInfo();
    this.startTimer();
  }

  setDeviceId(id: string): void {
    this.deviceId = id;
  }

  setAppVersion(version: string): void {
    this.appVersion = version;
  }

  track(event: string, properties: Record<string, unknown> = {}): void {
    const record: AnalyticsRecord = {
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
    await this.sendBatch();
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
    const offlineQueue = this.loadOfflineQueue();
    const toSend = [...offlineQueue, ...this.buffer];
    this.buffer = [];

    if (toSend.length === 0) return;

    try {
      const { error } = await this.supabase
        .from('app_analytics')
        .insert(toSend);

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
