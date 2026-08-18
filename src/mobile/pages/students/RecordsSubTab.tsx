import { useState, useEffect } from 'react';
import { generateUUID } from '@infrastructure/utils/uuid';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import { useMobileStudentRecordsStore } from '@mobile/stores/useMobileStudentRecordsStore';
import { todayISO } from '@mobile/utils/date';
import { CATEGORY_COLORS } from './shared';
import { StudentRecordsFullSheet } from './StudentRecordsFullSheet';

// ============================================================
// 기록 서브탭 (Phase A 신규)
// ============================================================

export function RecordsSubTab({
  studentId,
  studentName,
}: {
  studentId: string;
  studentName: string;
}) {
  const loadRecords = useMobileStudentRecordsStore((s) => s.load);
  const getRecords = useMobileStudentRecordsStore((s) => s.getRecordsByStudentId);
  const addRecord = useMobileStudentRecordsStore((s) => s.addRecord);
  const categories = useMobileStudentRecordsStore((s) => s.categories);

  const [showForm, setShowForm] = useState(false);
  const [showMobileRecords, setShowMobileRecords] = useState(false);
  const [showFullSheet, setShowFullSheet] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  // 출결(attendance) 카테고리 제외
  const mobileCategories = categories.filter((c) => c.id !== 'attendance');
  const selectedCategory = mobileCategories.find((c) => c.id === selectedCategoryId);
  const recentRecords = getRecords(studentId, 3);
  const allRecords = getRecords(studentId, Number.POSITIVE_INFINITY);

  const handleSubmit = async () => {
    if (!selectedCategoryId || !content.trim()) return;
    setSaving(true);
    const now = new Date();
    const record: StudentRecord = {
      id: generateUUID(),
      studentId,
      category: selectedCategoryId,
      subcategory: selectedSubcategory,
      content: content.trim(),
      date: todayISO(),
      createdAt: now.toISOString(),
    };
    await addRecord(record);
    setContent('');
    setSelectedCategoryId('');
    setSelectedSubcategory('');
    setShowForm(false);
    setSaving(false);
  };

  return (
    <div className="px-5 py-4 space-y-4 max-h-[50dvh] overflow-y-auto">
      {/* 최근 기록 (토글) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setShowMobileRecords((v) => !v)}
            className="flex items-center gap-1 text-sp-muted text-xs font-medium"
          >
            <span
              className="material-symbols-outlined text-sm"
              style={{
                transition: 'transform 0.2s',
                transform: showMobileRecords ? 'rotate(90deg)' : 'rotate(0deg)',
              }}
            >
              chevron_right
            </span>
            최근 기록 ({recentRecords.length})
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="text-sp-accent text-xs font-medium"
          >
            {showForm ? '취소' : '+ 새 기록'}
          </button>
        </div>

        {showMobileRecords &&
          (recentRecords.length === 0 ? (
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4 text-center">
              <p className="text-sp-muted text-sm">기록이 없습니다</p>
            </div>
          ) : (
            recentRecords.map((rec) => {
              const cat = categories.find((c) => c.id === rec.category);
              const colorClass = CATEGORY_COLORS[cat?.color ?? 'gray'] ?? 'bg-gray-400';
              return (
                <div
                  key={rec.id}
                  className="bg-white/5 backdrop-blur-sm border border-white/10 flex rounded-xl overflow-hidden mb-2"
                >
                  <div className={`w-1 shrink-0 ${colorClass}`} />
                  <div className="flex-1 p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-sp-muted">{rec.date}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-white/5 text-sp-muted">
                        {cat?.name.split('(')[0]?.trim() ?? rec.category}
                      </span>
                      {/* Q2: 출결은 subcategory, 비출결은 태그(있을 때만 — 카테고리명은 위에 이미 표시). */}
                      {rec.category === 'attendance'
                        ? rec.subcategory && (
                            <span className="text-xs text-sp-muted/70">{rec.subcategory}</span>
                          )
                        : rec.tags &&
                          rec.tags.length > 0 && (
                            <span className="text-xs text-sp-muted/70">{rec.tags.join(' · ')}</span>
                          )}
                    </div>
                    <p className="text-sp-text text-sm">{rec.content}</p>
                  </div>
                </div>
              );
            })
          ))}
      </div>

      {/* 전체 기록 보기 진입 링크 */}
      <button
        onClick={() => setShowFullSheet(true)}
        className="w-full flex items-center justify-between px-1 py-3 min-h-[44px] text-sp-accent text-sm font-medium"
      >
        <span>전체 기록 보기 ({allRecords.length}건)</span>
        <span className="material-symbols-outlined text-lg">chevron_right</span>
      </button>

      {/* 기록 추가 폼 */}
      {showForm && (
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4 space-y-3">
          {/* 카테고리 선택 */}
          <div>
            <p className="text-sp-muted text-xs mb-2">카테고리</p>
            <div className="flex flex-wrap gap-1.5">
              {mobileCategories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    setSelectedCategoryId(cat.id);
                    setSelectedSubcategory('');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors min-h-[36px] ${
                    selectedCategoryId === cat.id
                      ? 'bg-sp-accent/15 border-sp-accent/40 text-sp-accent'
                      : 'border-sp-border text-sp-muted'
                  }`}
                >
                  {cat.name.split('(')[0]?.trim()}
                </button>
              ))}
            </div>
          </div>

          {/* 서브카테고리 */}
          {selectedCategory && selectedCategory.subcategories.length > 0 && (
            <div>
              <p className="text-sp-muted text-xs mb-2">세부</p>
              <div className="flex flex-wrap gap-1.5">
                {selectedCategory.subcategories.map((sub) => (
                  <button
                    key={sub}
                    onClick={() => setSelectedSubcategory(sub === selectedSubcategory ? '' : sub)}
                    className={`px-2.5 py-1 rounded-md text-xs border transition-colors min-h-[32px] ${
                      selectedSubcategory === sub
                        ? 'bg-sp-accent/15 border-sp-accent/40 text-sp-accent'
                        : 'border-sp-border text-sp-muted'
                    }`}
                  >
                    {sub}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 기록 내용 */}
          <textarea
            placeholder="기록 내용을 입력하세요"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 bg-sp-surface border border-sp-border rounded-xl text-sp-text text-sm placeholder:text-sp-muted/50 resize-none"
          />

          {/* 저장 버튼 */}
          <button
            onClick={() => void handleSubmit()}
            disabled={!selectedCategoryId || !content.trim() || saving}
            className="w-full py-3 bg-sp-accent text-sp-accent-fg text-sm font-bold rounded-xl disabled:opacity-50 transition-colors active:bg-sp-accent/80"
          >
            {saving ? '저장 중...' : '기록 저장'}
          </button>
        </div>
      )}

      {showFullSheet && (
        <StudentRecordsFullSheet
          studentId={studentId}
          studentName={studentName}
          onClose={() => setShowFullSheet(false)}
        />
      )}
    </div>
  );
}
