window.CARD_DATA = {
  brand: {
    name: '쌤핀',
    tagline: '선생님의 학급 운영 대시보드',
    mascot: 'pin.png',
  },
  cards: [
    {
      eyebrow: '2학기 수업 준비',
      h: '새 학기 수업 반,<br>여기 한 곳에서 끝냅니다',
      sub: '명렬 관리 · 수업 기록 · 좌석배치<br>진도 관리 · 설문/체크 · 과제 수합',
      stage: {
        layout: 'column',
        items: [
          {
            type: 'mascot',
            size: 176,
          },
          {
            type: 'shot',
            img: 'tabs',
            w: 944,
          },
        ],
      },
    },
    {
      eyebrow: '명렬 관리',
      h: '나이스 엑셀 그대로<br>올리면 명단이 완성',
      bullets: [
        '나이스에서 받은 <b>엑셀(.xlsx)</b>을 그대로 가져오기',
        '표를 <b>복사해 붙여넣어도</b> 번호·이름이 알아서 들어감',
        '<b>사진 명렬표</b>를 넣으면 학생 얼굴까지 한 번에',
        '만든 명단은 다시 <b>엑셀로 내보내기</b>',
      ],
      stage: {
        layout: 'column',
        items: [
          {
            type: 'shot',
            img: 'roster',
            w: 980,
            overlay: {
              img: 'toast',
              w: 392,
              right: 22,
              bottom: 22,
            },
          },
        ],
      },
    },
    {
      eyebrow: '수업 기록',
      h: '출결은 한 번 누르고<br>특기사항은 그 자리에서',
      bullets: [
        '출석 · 결석 · 지각 · 조퇴 · <b>결과</b>를 눌러 바로 저장',
        '특기사항에 <b>분류와 태그</b>를 붙여 두면 나중에 찾기 쉬움',
        '쌓인 특기사항을 <b>근거로 삼아 생기부 초안</b> 작성',
        '초안은 <b>한글 · 엑셀 · 나이스 붙여넣기</b>로 내보내기',
      ],
      stage: {
        layout: 'column',
        items: [
          {
            type: 'shot',
            img: 'record',
            w: 880,
          },
        ],
      },
    },
    {
      eyebrow: '좌석배치 · 이름 학습',
      h: '자리를 짜고<br>얼굴과 이름을 외웁니다',
      bullets: [
        '<b>랜덤 배치 · 짝꿍 · 1인 따로 · 교사 시점</b>이 버튼 하나',
        '짠 자리 <b>그대로 수업 기록</b>으로 넘기기',
        '자리배치도를 <b>한글(.hwpx) · 엑셀(.xlsx)</b>로 내보내기',
        '이름 학습 — <b>맞혀보기 · 매칭하기 · 이름 쓰기</b>',
      ],
      stage: {
        layout: 'row',
        items: [
          {
            type: 'shot',
            img: 'seats',
            w: 428,
            label: '좌석배치',
          },
          {
            type: 'shot',
            img: 'faces4',
            w: 480,
            label: '이름 학습',
          },
        ],
      },
    },
    {
      eyebrow: '진도 관리 · 과제 수합',
      h: '진도는 쌓이고<br>제출물은 모입니다',
      bullets: [
        '차시별 진도를 <b>반마다 따로</b> 기록 · 남은 수업일에 <b>계획 한 번에 깔기</b>',
        '같은 과목 <b>다른 반에서 진도 불러오기</b>',
        '과제는 <b>마감일시 · 제출 방식(파일 / 텍스트)</b>을 정해 배포',
        '제출물은 <b>구글 드라이브</b> 「쌤핀 과제」 폴더에 자동 정리',
      ],
      stage: {
        layout: 'column',
        items: [
          {
            type: 'shot',
            img: 'progress',
            w: 932,
            label: '진도 관리',
          },
          {
            type: 'shot',
            img: 'assign',
            w: 836,
            label: '과제 수합',
          },
        ],
      },
    },
    {
      center: true,
      eyebrow: '무료 · 광고 없음',
      h: '댓글에 <em>‘쌤핀’</em><br>남겨 주세요',
      sub: '팔로우와 좋아요를 눌러 주신 뒤 댓글을 남겨 주시면<br>다운로드 링크를 보내 드려요',
      steps: ['① 팔로우', '② 좋아요', "③ 댓글 '쌤핀'"],
      stage: {
        layout: 'column',
        items: [
          {
            type: 'mascot',
            size: 300,
          },
        ],
      },
    },
  ],
  sizes: {
    assign: [890, 392],
    faces4: [632, 474],
    progress: [990, 128],
    record: [710, 404],
    roster: [990, 400],
    seats: [564, 474],
    tabs: [690, 56],
    toast: [320, 56],
  },
};
