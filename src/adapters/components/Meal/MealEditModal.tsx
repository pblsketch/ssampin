import { useState, useEffect } from 'react';
import type { ManualMealInfo, MealDish } from '@domain/entities/Meal';

interface MealEditModalProps {
  date: string;
  existingMeals: readonly ManualMealInfo[];
  onSave: (meals: ManualMealInfo[]) => void;
  onClose: () => void;
}

const MEAL_TYPES = ['조식', '중식', '석식', '간식'] as const;

function formatDateDisplay(yyyymmdd: string): string {
  const y = yyyymmdd.slice(0, 4);
  const m = parseInt(yyyymmdd.slice(4, 6), 10);
  const d = parseInt(yyyymmdd.slice(6, 8), 10);
  return `${y}년 ${m}월 ${d}일`;
}

export function MealEditModal({ date, existingMeals, onSave, onClose }: MealEditModalProps) {
  const [mealType, setMealType] = useState<string>('중식');
  const [menuText, setMenuText] = useState('');
  const [calorie, setCalorie] = useState('');

  // 기존 데이터가 있으면 해당 식사유형의 메뉴를 불러오기
  useEffect(() => {
    const existing = existingMeals.find((m) => m.mealType === mealType);
    if (existing) {
      setMenuText(existing.dishes.map((d) => d.name).join('\n'));
      setCalorie(existing.calorie ?? '');
    } else {
      setMenuText('');
      setCalorie('');
    }
  }, [mealType, existingMeals]);

  const handleSave = () => {
    const trimmed = menuText.trim();
    if (!trimmed) {
      // 빈 입력 → 해당 식사유형 삭제
      onSave([...existingMeals].filter((m) => m.mealType !== mealType));
      return;
    }

    const dishes: MealDish[] = trimmed
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((name) => ({ name, allergens: [] as readonly number[] }));

    const newMeal: ManualMealInfo = {
      date,
      mealType,
      dishes,
      calorie: calorie.trim() || undefined,
      source: 'manual',
    };

    onSave([...existingMeals.filter((m) => m.mealType !== mealType), newMeal]);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="bg-sp-bg rounded-2xl border border-sp-border p-6 w-full max-w-md shadow-2xl">
        <h3 className="text-lg font-bold text-sp-text mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-sp-accent">edit_note</span>
          급식 메뉴 입력 — {formatDateDisplay(date)}
        </h3>

        {/* 식사 유형 선택 */}
        <div className="flex gap-2 mb-4">
          {MEAL_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setMealType(type)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                mealType === type
                  ? 'bg-sp-accent text-white'
                  : 'bg-sp-surface text-sp-muted hover:text-sp-text'
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        {/* 메뉴 입력 (줄당 하나) */}
        <textarea
          value={menuText}
          onChange={(e) => setMenuText(e.target.value)}
          placeholder={'메뉴를 줄마다 하나씩 입력하세요\n예:\n쌀밥\n미역국\n제육볶음\n배추김치\n사과'}
          className="w-full h-40 bg-sp-surface border border-sp-border rounded-xl p-3 text-sm text-sp-text placeholder-sp-muted/50 resize-none focus:outline-none focus:border-sp-accent transition-colors"
        />

        {/* 칼로리 (선택) */}
        <input
          type="text"
          value={calorie}
          onChange={(e) => setCalorie(e.target.value)}
          placeholder="칼로리 (선택, 예: 693.2 Kcal)"
          className="w-full mt-3 bg-sp-surface border border-sp-border rounded-xl px-3 py-2 text-sm text-sp-text placeholder-sp-muted/50 focus:outline-none focus:border-sp-accent transition-colors"
        />

        {/* 버튼 */}
        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-sp-muted hover:text-sp-text rounded-lg transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 text-sm bg-sp-accent text-white rounded-lg hover:bg-sp-accent/80 transition-colors"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
