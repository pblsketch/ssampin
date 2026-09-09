/**
 * 상담 명단 로컬 사본 보관소 (ADR-095 · 계획서 §6 S4-b)
 *
 * 유예 기한이 지나면 서버는 소유자 없는 옛 일정을 더 이상 열어 주지 않는다. 기한 안에
 * 상세를 열어 본 일정만 여기에 남겨 두고, 기한이 지난 뒤에는 이 사본으로 보여 준다.
 *
 * ★ 파일 하나에 일정별로 모아 둔다. 일정마다 파일을 만들면 지우기·동기화 대상이 흩어진다.
 * ★ 예약자 정보는 **암호문 그대로** 담는다. 여기서 풀어 두면 평문 개인정보가 기기에
 *   한 벌 더 생긴다. 여는 열쇠(관리 키·소금값)는 일정 쪽에 이미 있으므로 그대로 풀린다.
 */
import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { ConsultationLocalCopy } from '@domain/rules/consultationLocalCopy';
import type {
  BookingPublic,
  SlotPublic,
} from '@infrastructure/supabase/ConsultationSupabaseClient';

export type ConsultationCopy = ConsultationLocalCopy<SlotPublic, BookingPublic>;

interface CopyFile {
  readonly copies: Record<string, ConsultationCopy>;
}

const FILE = 'consultation-local-copies';

export class ConsultationLocalCopyStore {
  constructor(private readonly storage: IStoragePort) {}

  private async readAll(): Promise<CopyFile> {
    const data = await this.storage.read<CopyFile>(FILE);
    return data ?? { copies: {} };
  }

  async get(scheduleId: string): Promise<ConsultationCopy | null> {
    try {
      const all = await this.readAll();
      return all.copies[scheduleId] ?? null;
    } catch {
      // 사본을 못 읽는 것은 화면을 막을 이유가 아니다 — 없는 것으로 본다.
      return null;
    }
  }

  async save(copy: ConsultationCopy): Promise<void> {
    const all = await this.readAll();
    await this.storage.write<CopyFile>(FILE, {
      copies: { ...all.copies, [copy.scheduleId]: copy },
    });
  }

  /** 일정을 지울 때 사본도 함께 지운다 — 남겨 두면 아무도 안 보는 개인정보가 된다. */
  async remove(scheduleId: string): Promise<void> {
    const all = await this.readAll();
    if (!(scheduleId in all.copies)) return;
    const next = { ...all.copies };
    delete next[scheduleId];
    await this.storage.write<CopyFile>(FILE, { copies: next });
  }
}
