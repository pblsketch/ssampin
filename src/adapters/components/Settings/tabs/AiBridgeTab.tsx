import { AiBridgeCard } from '../aiBridge/AiBridgeCard';

export function AiBridgeTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-sp-text">AI 연결</h2>
        <p className="mt-1 text-sm text-sp-muted">
          쌤핀 데이터를 외부 AI 도구와 안전하게 잇습니다. 사용자 PC에 별도 설치(Node 등) 없이, 버튼
          하나로 연결됩니다.
        </p>
      </div>
      <AiBridgeCard />
    </div>
  );
}
