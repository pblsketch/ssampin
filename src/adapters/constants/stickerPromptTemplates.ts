/**
 * 이모티콘 제작 가이드 프롬프트 템플릿 (PRD §3.4.4)
 *
 * 코드 하드코딩이 아닌 데이터로 분리하여 업데이트 용이.
 * `StickerGuidePanel`의 프롬프트 카드 UI에서 소비됨.
 */

export type PromptTool = 'chatgpt' | 'nano-banana' | 'designer' | 'wrtn' | 'any';
export type PromptTheme = 'emotion' | 'classroom' | 'text' | 'reaction' | 'season';

export interface PromptTemplate {
  readonly id: string;
  readonly title: string;
  readonly emoji: string;
  readonly description: string;
  readonly prompt: string;          // full multi-line prompt for one-click copy
  readonly tip?: string;            // short usage tip shown via "💡 팁" button
  readonly tool: PromptTool;
  readonly resultCount: number;     // 16 for 4x4 sheets, 1 for individual
  readonly isSheetPrompt: boolean;
  readonly tags: readonly string[];
  readonly theme: PromptTheme;
}

export const STICKER_PROMPT_TEMPLATES: readonly PromptTemplate[] = [
  {
    id: 'emotion-set-16',
    title: '감정 세트 (16종)',
    emoji: '😊',
    description: '같은 캐릭터의 16가지 감정 표현을 한 장의 4x4 시트로 생성',
    prompt: `Create a 4x4 grid of 16 cute sticker-style illustrations
of the same character showing different emotions.
Each sticker should have:
- A different emotion/expression with Korean text
- Transparent background
- Bold outlines, chibi/kawaii style
- Bright pastel colors

The 16 emotions (with text):
1. 기쁨 (joyful, sparkling eyes)
2. 슬픔 (sad, small tears)
3. 화남 (angry, steam from head)
4. 놀람 (surprised, wide eyes)
5. 하트 (in love, heart eyes)
6. 엄지척 (thumbs up, proud)
7. 파이팅 (fist pump, determined)
8. 감사 (bowing, hands together)
9. 졸림 (sleepy, zzz)
10. 생각중 (thinking, finger on chin)
11. 울음 (crying, big tears)
12. 부끄러움 (shy, blushing)
13. 배고픔 (hungry, drooling)
14. 신남 (excited, jumping)
15. 당황 (panicked, sweat drop)
16. 멍때림 (spaced out, blank eyes)

Arrange in a neat 4×4 grid with small gaps.
Output as a single square image.`,
    tip: '같은 캐릭터로 통일감 있게 만들려면 첫 줄에 "the same character"를 꼭 적어주세요. 내 사진을 첨부하면 더 잘 닮은 캐릭터가 나와요.',
    tool: 'chatgpt',
    resultCount: 16,
    isSheetPrompt: true,
    tags: ['감정', '캐릭터', '기본'],
    theme: 'emotion',
  },
  {
    id: 'classroom-set-16',
    title: '수업용 세트 (16종)',
    emoji: '🏫',
    description: '선생님 캐릭터의 수업 상황 16가지 — 칭찬, 주의, 안내 등',
    prompt: `Create a 4x4 grid of 16 cute sticker-style illustrations
of a Korean teacher character in classroom situations.
Each sticker should have:
- A different classroom situation with Korean text
- Transparent background
- Bold outlines, chibi/kawaii style
- Bright pastel colors

The 16 classroom situations (with text):
1. 잘했어요! (clapping, stars)
2. 조용히~ (finger on lips, shh)
3. 손들어! (raising hand, encouraging)
4. 모둠활동 (pointing to a small group)
5. 쉬는시간 (stretching, relaxed)
6. 칭찬해요 (giving a thumbs up, hearts)
7. 숙제! (holding a notebook, reminder)
8. 화이팅! (fist pump, cheering)
9. 집중! (pointing at the board, focused)
10. 발표해요 (with a microphone, smiling)
11. 정답! (pointing up, checkmark sparkle)
12. 다시 한번 (gentle gesture, retry)
13. 줄서기 (lining up, orderly)
14. 청소시간 (holding a broom, working)
15. 급식시간 (with a tray, happy)
16. 하교길~ (waving, backpack)

Arrange in a neat 4×4 grid with small gaps.
Output as a single square image.`,
    tip: '"Korean teacher character" 대신 "female teacher with glasses" 등 외형을 구체화하면 더 일관된 결과가 나옵니다.',
    tool: 'chatgpt',
    resultCount: 16,
    isSheetPrompt: true,
    tags: ['수업', '교실', '선생님'],
    theme: 'classroom',
  },
  {
    id: 'text-set-16',
    title: '텍스트 이모티콘 (16종)',
    emoji: '📝',
    description: '"최고!", "화이팅!", "감사해요" 등 한글 텍스트 위주의 16종',
    prompt: `Create a 4x4 grid of 16 cute sticker-style text emoticons
with bold Korean text and minimal decoration.
Each sticker should have:
- A short Korean phrase as the main element
- Transparent background
- Bold outlined Korean typography
- Pastel decorative elements (stars, sparkles, hearts)

The 16 text phrases:
1. "최고!" (with sparkles)
2. "화이팅!" (with fist illustration)
3. "감사해요" (with bowing hearts)
4. "사랑해요" (with floating hearts)
5. "축하해요" (with confetti)
6. "잘했어요" (with stars)
7. "고마워" (with a small bow)
8. "미안해" (with droplet)
9. "괜찮아" (with a smile mark)
10. "오케이!" (with OK hand)
11. "굿잡!" (with thumbs up)
12. "대박!" (with explosion sparkles)
13. "헐~" (with surprised mark)
14. "ㅇㅋ" (simple, with check)
15. "ㄱㄱ" (with arrow)
16. "ㅎㅎ" (with smile)

Arrange in a neat 4×4 grid with small gaps.
Output as a single square image.`,
    tip: '한글이 깨질 때는 한국어 단어를 영어 프롬프트 안에 큰따옴표로 감싸세요. 예: "감사해요" (Korean text "thank you")',
    tool: 'chatgpt',
    resultCount: 16,
    isSheetPrompt: true,
    tags: ['텍스트', '한글', '문구'],
    theme: 'text',
  },
  {
    id: 'reaction-set-16',
    title: '리액션 세트 (16종)',
    emoji: '🎉',
    description: '대화방에서 자주 쓰는 "좋아요", "박수", "OK" 같은 리액션 16종',
    prompt: `Create a 4x4 grid of 16 cute sticker-style reaction illustrations
for messenger conversations.
Each sticker should have:
- A clear reaction gesture or symbol with Korean text
- Transparent background
- Bold outlines, chibi/kawaii style
- Bright pastel colors

The 16 reactions (with text):
1. 좋아요 (thumbs up, heart)
2. 박수 (clapping hands, sparkles)
3. OK! (OK hand sign, winking)
4. 굿! (thumbs up, smiling)
5. 환영해요 (waving with both hands)
6. 축하해 (party popper)
7. 사랑해 (heart hands)
8. 고마워 (small bow with hearts)
9. 응원해 (cheerleader pompom)
10. 굿모닝 (sun rising, stretching)
11. 굿나잇 (moon, sleeping)
12. 수고했어 (pat on the back gesture)
13. 화이팅 (running fist pump)
14. 헐 (jaw drop, shocked)
15. ㅋㅋㅋ (laughing rolling)
16. 안녕! (waving goodbye, happy)

Arrange in a neat 4×4 grid with small gaps.
Output as a single square image.`,
    tip: '리액션은 손짓·표정이 핵심이에요. 텍스트보다 동작이 잘 보이게 "clear gesture"를 강조하세요.',
    tool: 'chatgpt',
    resultCount: 16,
    isSheetPrompt: true,
    tags: ['리액션', '대화', '메신저'],
    theme: 'reaction',
  },
  {
    id: 'season-set-16',
    title: '계절/행사 세트 (16종)',
    emoji: '🌸',
    description: '봄소풍, 운동회, 방학, 졸업식 등 학교 계절 행사 16종',
    prompt: `Create a 4x4 grid of 16 cute sticker-style illustrations
for Korean school seasonal events and holidays.
Each sticker should have:
- A different seasonal/event scene with Korean text
- Transparent background
- Bold outlines, chibi/kawaii style
- Bright pastel colors matching each season

The 16 seasonal events (with text):
1. 봄소풍 (cherry blossoms, picnic basket)
2. 운동회 (running, headband)
3. 어버이날 (carnation flower)
4. 스승의 날 (apple, thank you card)
5. 여름방학 (watermelon, sun)
6. 캠핑 (tent, campfire)
7. 가을소풍 (maple leaves, lunchbox)
8. 추석 (full moon, songpyeon)
9. 운동장 (track and field, cheer)
10. 학예회 (microphone, stage curtain)
11. 겨울방학 (snowman, mittens)
12. 크리스마스 (Christmas tree, gift)
13. 새해 (fireworks, calendar)
14. 졸업식 (graduation cap, diploma)
15. 입학식 (school bag, ribbon)
16. 시험기간 (books, pencil, sparkle)

Arrange in a neat 4×4 grid with small gaps.
Output as a single square image.`,
    tip: '계절감은 색감이 좌우해요. "spring=pink/green, summer=blue/yellow, autumn=orange/brown, winter=white/blue" 같이 색을 지정해주면 더 좋아요.',
    tool: 'chatgpt',
    resultCount: 16,
    isSheetPrompt: true,
    tags: ['계절', '행사', '학교'],
    theme: 'season',
  },
];

export const PROMPT_THEMES: Array<{ id: PromptTheme | 'all'; label: string }> = [
  { id: 'all', label: '전체' },
  { id: 'emotion', label: '감정' },
  { id: 'classroom', label: '수업' },
  { id: 'text', label: '텍스트' },
  { id: 'reaction', label: '리액션' },
  { id: 'season', label: '계절' },
];
