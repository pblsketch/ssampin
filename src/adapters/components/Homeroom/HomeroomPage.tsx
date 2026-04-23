import { useState, useCallback } from 'react';
import type { CounselingMethod } from '@domain/entities/StudentRecord';
import { HomeroomTabBar, type HomeroomTab } from './HomeroomTabBar';
import { RecordsTab } from './Records/RecordsTab';
import { SurveyTab } from './Survey/SurveyTab';
import { AssignmentTab } from './Assignment/AssignmentTab';
import { ConsultationTab } from './Consultation/ConsultationTab';
import { Seating } from '@adapters/components/Seating/Seating';
import { RosterManagementTab } from './RosterManagementTab';
import { PageHeader } from '@adapters/components/common/PageHeader';

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
    <div className="h-full flex flex-col -m-8">
      <PageHeader
        icon="👩‍🏫"
        title="담임 업무"
        rightActions={<HomeroomTabBar activeTab={activeTab} onChange={setActiveTab} />}
      />
      <div className="flex-1 min-h-0 p-8 overflow-y-auto">
        {activeTab === 'roster' && <RosterManagementTab />}
        {activeTab === 'records' && <RecordsTab prefill={prefillRecord} onPrefillConsumed={() => setPrefillRecord(null)} />}
        {activeTab === 'survey' && <SurveyTab />}
        {activeTab === 'assignment' && <AssignmentTab />}
        {activeTab === 'consultation' && <ConsultationTab onWriteRecord={handleWriteRecord} />}
        {activeTab === 'seating' && <Seating embedded />}
      </div>
    </div>
  );
}
