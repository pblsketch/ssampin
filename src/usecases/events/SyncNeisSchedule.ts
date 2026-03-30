import type { INeisPort } from '@domain/ports/INeisPort';
import type { IEventsRepository } from '@domain/repositories/IEventsRepository';
import type { ISettingsRepository } from '@domain/repositories/ISettingsRepository';
import type { SchoolEvent, CategoryItem } from '@domain/entities/SchoolEvent';
import { DEFAULT_CATEGORIES } from '@domain/entities/SchoolEvent';
import {
  parseNeisScheduleRow,
  deduplicateNeisEvents,
  filterExcludedNeisEvents,
  getAcademicYearRange,
  NEIS_SCHEDULE_CATEGORY,
} from '@domain/entities/NeisSchedule';
import type { NeisScheduleEvent } from '@domain/entities/NeisSchedule';
import { generateUUID } from '@infrastructure/utils/uuid';

export interface SyncResult {
  readonly added: number;
  readonly updated: number;
  readonly skipped: number;
  readonly total: number;
}

export class SyncNeisSchedule {
  constructor(
    private readonly neisPort: INeisPort,
    private readonly eventsRepository: IEventsRepository,
    private readonly settingsRepository: ISettingsRepository,
  ) {}

  /**
   * NEIS 학사일정 전체 동기화
   * 1. API에서 현재 학년도 전체 학사일정 조회
   * 2. 기존 NEIS 일정과 비교 & 병합
   * 3. 저장소 업데이트
   */
  async syncNow(apiKey: string): Promise<SyncResult> {
    const settings = await this.settingsRepository.getSettings();
    if (!settings) throw new Error('설정을 찾을 수 없습니다.');

    const { atptCode, schoolCode } = settings.neis;
    if (!atptCode || !schoolCode) {
      throw new Error('학교 정보가 설정되어 있지 않습니다.');
    }

    // 1. API에서 학사일정 조회
    const { fromDate, toDate } = getAcademicYearRange();
    const rawRows = await this.neisPort.getSchoolSchedule({
      apiKey,
      officeCode: atptCode,
      schoolCode,
      fromDate,
      toDate,
    });

    // 2. 파싱 → 불필요 일정 제외 → 중복 제거
    const parsedEvents = deduplicateNeisEvents(
      filterExcludedNeisEvents(rawRows.map(parseNeisScheduleRow)),
    );

    // 3. 기존 데이터 로드
    const data = await this.eventsRepository.getEvents();
    const existingEvents = data?.events ?? [];
    const existingCategories = data?.categories ?? [...DEFAULT_CATEGORIES];

    // 4. NEIS 카테고리 자동 생성
    const categories = this.ensureNeisCategory(existingCategories);

    // 5. 비교 & 병합
    const now = new Date().toISOString();
    const { mergedEvents, added, updated, skipped } = this.mergeEvents(
      existingEvents,
      parsedEvents,
      now,
    );

    // 6. 저장
    await this.eventsRepository.saveEvents({
      events: mergedEvents,
      categories,
    });

    return {
      added,
      updated,
      skipped,
      total: parsedEvents.length,
    };
  }

  /**
   * 조건부 동기화 — lastSyncAt 기준으로 syncIntervalHours 경과 시에만 실행
   */
  async syncIfNeeded(apiKey: string): Promise<SyncResult | null> {
    const settings = await this.settingsRepository.getSettings();
    if (!settings) return null;

    const neisSchedule = settings.neisSchedule;
    if (!neisSchedule?.enabled || !neisSchedule.autoSync) return null;

    const { atptCode, schoolCode } = settings.neis;
    if (!atptCode || !schoolCode) return null;

    // 마지막 동기화 시간 확인
    if (neisSchedule.lastSyncAt) {
      const lastSync = new Date(neisSchedule.lastSyncAt).getTime();
      const intervalMs = (neisSchedule.syncIntervalHours ?? 24) * 60 * 60 * 1000;
      if (Date.now() - lastSync < intervalMs) return null;
    }

    return this.syncNow(apiKey);
  }

  /**
   * NEIS 일정 전체 삭제
   */
  async removeAllNeisEvents(): Promise<number> {
    const data = await this.eventsRepository.getEvents();
    if (!data) return 0;

    const neisEvents = data.events.filter((e) => e.source === 'neis');
    const remaining = data.events.filter((e) => e.source !== 'neis');

    await this.eventsRepository.saveEvents({
      events: remaining,
      categories: data.categories,
    });

    return neisEvents.length;
  }

  /** NEIS 카테고리가 없으면 자동 추가 */
  private ensureNeisCategory(
    categories: readonly CategoryItem[],
  ): readonly CategoryItem[] {
    const exists = categories.some((c) => c.id === NEIS_SCHEDULE_CATEGORY.id);
    if (exists) return categories;

    return [
      ...categories,
      {
        id: NEIS_SCHEDULE_CATEGORY.id,
        name: NEIS_SCHEDULE_CATEGORY.name,
        color: NEIS_SCHEDULE_CATEGORY.color,
      },
    ];
  }

  /**
   * 기존 이벤트와 API 데이터 병합
   * - API에 있고 로컬에 없음 → 새로 추가
   * - API에 있고 로컬에 있음 (isModified=false) → 제목/날짜 업데이트
   * - API에 있고 로컬에 있음 (isModified=true | isHidden=true) → 스킵
   * - 로컬에 있지만 API에 없음 → 유지
   */
  private mergeEvents(
    existingEvents: readonly SchoolEvent[],
    apiEvents: readonly NeisScheduleEvent[],
    syncTime: string,
  ): {
    mergedEvents: readonly SchoolEvent[];
    added: number;
    updated: number;
    skipped: number;
  } {
    // neis.eventId → 기존 이벤트 매핑
    const neisMap = new Map<string, SchoolEvent>();
    const nonNeisEvents: SchoolEvent[] = [];

    for (const ev of existingEvents) {
      if (ev.source === 'neis' && ev.neis?.eventId) {
        neisMap.set(ev.neis.eventId, ev);
      } else {
        nonNeisEvents.push(ev);
      }
    }

    let added = 0;
    let updated = 0;
    let skipped = 0;
    const mergedNeisEvents: SchoolEvent[] = [];

    // API 이벤트 처리
    for (const apiEv of apiEvents) {
      const existing = neisMap.get(apiEv.eventId);

      if (!existing) {
        // 새로 추가
        mergedNeisEvents.push(this.createNewNeisEvent(apiEv, syncTime));
        added++;
      } else if (existing.isModified || existing.isHidden) {
        // 사용자 수정/숨김 → 스킵 (기존 유지)
        mergedNeisEvents.push(existing);
        skipped++;
        neisMap.delete(apiEv.eventId);
      } else {
        // 업데이트
        mergedNeisEvents.push(this.updateNeisEvent(existing, apiEv, syncTime));
        updated++;
        neisMap.delete(apiEv.eventId);
      }
    }

    // API에 없는 기존 NEIS 일정 → 유지
    for (const remaining of neisMap.values()) {
      mergedNeisEvents.push(remaining);
    }

    return {
      mergedEvents: [...nonNeisEvents, ...mergedNeisEvents],
      added,
      updated,
      skipped,
    };
  }

  /** API 데이터로 새 SchoolEvent 생성 */
  private createNewNeisEvent(apiEv: NeisScheduleEvent, syncTime: string): SchoolEvent {
    return {
      id: generateUUID(),
      title: apiEv.title,
      date: apiEv.date,
      category: NEIS_SCHEDULE_CATEGORY.id,
      source: 'neis',
      neis: {
        eventId: apiEv.eventId,
        eventName: apiEv.title,
        schoolYear: apiEv.schoolYear,
        gradeYn: apiEv.gradeYn,
        subtractDayType: apiEv.subtractDayType,
        loadDate: apiEv.loadDate,
        lastSyncAt: syncTime,
      },
    };
  }

  /** 기존 NEIS 이벤트를 API 데이터로 업데이트 */
  private updateNeisEvent(
    existing: SchoolEvent,
    apiEv: NeisScheduleEvent,
    syncTime: string,
  ): SchoolEvent {
    return {
      ...existing,
      title: apiEv.title,
      date: apiEv.date,
      neis: {
        eventId: apiEv.eventId,
        eventName: apiEv.title,
        schoolYear: apiEv.schoolYear,
        gradeYn: apiEv.gradeYn,
        subtractDayType: apiEv.subtractDayType,
        loadDate: apiEv.loadDate,
        lastSyncAt: syncTime,
      },
    };
  }
}
