import { useState, useCallback } from 'react';
import type { CounselingMethod } from '@domain/entities/StudentRecord';
import { HomeroomTabBar, type HomeroomTab } from './HomeroomTabBar';
import { RecordsTab } from './Records/RecordsTab';
import { SurveyTab } from './Survey/SurveyTab';
import { ConsultationTab } from './Consultation/ConsultationTab';
import { Seating } from '@adapters/components/Seating/Seating';

export interface RecordPrefill {
  studentId: string;
  category: string;      // 'counseling'
  subcategory: string;   // '학부모상담' | '학생상담'
  method?: CounselingMethod;
  date: string;
}

export function HomeroomPage() {
  const [activeTab, setActiveTab] = useState<HomeroomTab>('records');
  const [prefillRecord, setPrefillRecord] = useState<RecordPrefill | null>(null);

  const handleWriteRecord = useCallback((prefill: RecordPrefill) => {
    setPrefillRecord(prefill);
    setActiveTab('records');
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-sp-text flex items-center gap-2">
          <span>👩‍🏫</span>
          <span>담임 업무</span>
        </h2>
        <HomeroomTabBar activeTab={activeTab} onChange={setActiveTab} />
      </div>

      {/* 탭 콘텐츠 */}
      {activeTab === 'records' && <RecordsTab prefill={prefillRecord} onPrefillConsumed={() => setPrefillRecord(null)} />}
      {activeTab === 'survey' && <SurveyTab />}
      {activeTab === 'consultation' && <ConsultationTab onWriteRecord={handleWriteRecord} />}
      {activeTab === 'seating' && <Seating embedded />}
    </div>
  );
}
