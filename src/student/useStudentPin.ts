import { useCallback, useEffect, useState } from 'react';
import { useRealtimeWallSyncStore } from '@adapters/stores/useRealtimeWallSyncStore';
import { hashStudentPin } from '@usecases/realtimeWall/HashStudentPin';

/**
 * v2.1 Phase D — 학생 PIN 훅 (Plan FR-D6 / Design v2.1 §5.14 / §6.1).
 *
 * 4자리 PIN 평문 → SHA-256 hash (boardKey salt) → localStorage 저장.
 * 저장 키: `ssampin-realtime-wall-pin-hash:{boardKey}` (스토어가 관리)
 *
 * 회귀 위험 #9 (PIN 평문 저장 부재) 보호:
 *   - PIN 평문은 컴포넌트 useState 내에서만 (메모리 휘발)
 *   - hash 결과만 localStorage / WebSocket 송신
 *   - 평문은 어디에도 영속 X
 */

interface UseStudentPinOptions {
  /** 보드 식별 키 — localStorage 분리 + hash salt */
  readonly boardKey: string;
  /** mount 시 자동 로드 여부 (기본 true) */
  readonly autoLoad?: boolean;
}

interface UseStudentPinResult {
  /** 현재 hash (없으면 undefined) — store 동기화 */
  readonly currentHash: string | undefined;
  /** PIN 등록/변경: 평문 → hash → state + localStorage + 서버 ack 송신 */
  readonly setPin: (pin: string) => Promise<void>;
  /** PIN 검증: 평문 → hash → 서버 verify 요청 → 결과 콜백 */
  readonly verifyPin: (pin: string) => Promise<boolean>;
  /** PIN 제거 */
  readonly clearPin: () => void;
  /** 마지막 PIN 작업 에러 (한국어) */
  readonly error: string | null;
}

export function useStudentPin({
  boardKey,
  autoLoad = true,
}: UseStudentPinOptions): UseStudentPinResult {
  const setPinHash = useRealtimeWallSyncStore((s) => s.setPinHash);
  const loadPinHash = useRealtimeWallSyncStore((s) => s.loadPinHash);
  const clearPinHashAction = useRealtimeWallSyncStore((s) => s.clearPinHash);
  const submitPinSet = useRealtimeWallSyncStore((s) => s.submitPinSet);
  const submitPinVerify = useRealtimeWallSyncStore((s) => s.submitPinVerify);
  const onPinVerifyResult = useRealtimeWallSyncStore((s) => s.onPinVerifyResult);
  const currentHash = useRealtimeWallSyncStore((s) => s.currentPinHash);

  const [error, setError] = useState<string | null>(null);

  // mount 시 PIN 자동 로드
  useEffect(() => {
    if (!autoLoad || !boardKey) return;
    loadPinHash(boardKey);
  }, [autoLoad, boardKey, loadPinHash]);

  const setPin = useCallback(
    async (pin: string): Promise<void> => {
      setError(null);
      if (!boardKey) {
        setError('보드 정보가 없어요.');
        throw new Error('boardKey required');
      }
      if (!/^\d{4}$/.test(pin)) {
        setError('PIN은 4자리 숫자여야 해요.');
        throw new Error('PIN must be 4 digits');
      }
      try {
        const hash = await hashStudentPin(pin, boardKey);
        setPinHash(hash, boardKey);
        submitPinSet(hash); // 서버에 ack (보드 내 다른 학생 PIN 충돌 검사 X — 학생 본인 결정)
      } catch (e) {
        setError('PIN 설정에 실패했어요. 잠시 후 다시 시도해 주세요.');
        throw e;
      }
    },
    [boardKey, setPinHash, submitPinSet],
  );

  const verifyPin = useCallback(
    async (pin: string): Promise<boolean> => {
      setError(null);
      if (!boardKey) {
        setError('보드 정보가 없어요.');
        return false;
      }
      if (!/^\d{4}$/.test(pin)) {
        setError('PIN은 4자리 숫자여야 해요.');
        return false;
      }
      let hash: string;
      try {
        hash = await hashStudentPin(pin, boardKey);
      } catch {
        setError('PIN 검증에 실패했어요.');
        return false;
      }
      return new Promise<boolean>((resolve) => {
        let resolved = false;
        const unsubscribe = onPinVerifyResult((ok) => {
          if (resolved) return;
          resolved = true;
          unsubscribe();
          if (ok) {
            // 검증 성공 — hash를 state + localStorage에 반영 (학생이 같은 PIN으로 로그인)
            setPinHash(hash, boardKey);
            resolve(true);
          } else {
            setError('PIN이 일치하지 않아요.');
            resolve(false);
          }
        });
        // 5초 타임아웃 (서버 미응답 보호)
        setTimeout(() => {
          if (resolved) return;
          resolved = true;
          unsubscribe();
          setError('PIN 검증 응답이 없어요.');
          resolve(false);
        }, 5000);
        submitPinVerify(hash);
      });
    },
    [boardKey, setPinHash, submitPinVerify, onPinVerifyResult],
  );

  const clearPin = useCallback(() => {
    setError(null);
    clearPinHashAction(boardKey);
  }, [boardKey, clearPinHashAction]);

  return {
    currentHash,
    setPin,
    verifyPin,
    clearPin,
    error,
  };
}
