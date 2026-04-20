function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export interface MultiSurveyQuestionForHTML {
  id: string;
  type: 'single-choice' | 'multi-choice' | 'text' | 'scale';
  question: string;
  required: boolean;
  options?: { id: string; text: string }[];
  scaleMin?: number;
  scaleMax?: number;
  scaleMinLabel?: string;
  scaleMaxLabel?: string;
  maxLength?: number;
}

export function generateMultiSurveyHTML(questions: MultiSurveyQuestionForHTML[], stepMode: boolean = false): string {
  const questionsJson = JSON.stringify(questions.map(q => ({
    id: escapeHtml(q.id),
    type: q.type,
    question: escapeHtml(q.question),
    required: q.required,
    options: q.options ? q.options.map(o => ({ id: escapeHtml(o.id), text: escapeHtml(o.text) })) : undefined,
    scaleMin: q.scaleMin,
    scaleMax: q.scaleMax,
    scaleMinLabel: q.scaleMinLabel ? escapeHtml(q.scaleMinLabel) : undefined,
    scaleMaxLabel: q.scaleMaxLabel ? escapeHtml(q.scaleMaxLabel) : undefined,
    maxLength: q.maxLength,
  })));

  const stepModeJson = JSON.stringify(stepMode);

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>📋 쌤핀 복수 설문</title>
  <style>
    [hidden] { display: none !important; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      min-height: 100vh;
      background: #0a0e17;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: flex-start;
    }

    #app {
      max-width: 480px;
      width: 100%;
      padding: 20px 16px 100px;
    }

    #header {
      text-align: center;
      padding: 12px 0 8px;
    }

    .logo {
      font-size: 14px;
      color: #94a3b8;
    }

    /* ── scroll mode ── */
    .question-card {
      background: #1a2332;
      border: 1px solid #2a3548;
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 12px;
    }

    .question-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
    }

    .question-num {
      font-size: 12px;
      color: #94a3b8;
      font-weight: 500;
    }

    .required-badge {
      font-size: 11px;
      color: #ef4444;
      font-weight: 700;
    }

    .question-text {
      font-size: 16px;
      font-weight: 600;
      color: #e2e8f0;
      line-height: 1.5;
      margin-bottom: 16px;
    }

    /* Radio / Checkbox options */
    .options-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .option-label {
      display: flex;
      align-items: center;
      gap: 12px;
      background: #0a0e17;
      border: 1px solid #2a3548;
      border-radius: 10px;
      padding: 12px 14px;
      cursor: pointer;
      transition: border-color 0.15s ease, background 0.15s ease;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
      font-size: 15px;
      color: #e2e8f0;
      user-select: none;
    }

    .option-label:active {
      background: #131e30;
    }

    .option-label.selected {
      border-color: #3b82f6;
      background: rgba(59,130,246,0.08);
    }

    .option-label input[type="radio"],
    .option-label input[type="checkbox"] {
      width: 18px;
      height: 18px;
      accent-color: #3b82f6;
      flex-shrink: 0;
      cursor: pointer;
    }

    /* Textarea */
    textarea {
      width: 100%;
      min-height: 100px;
      background: #0a0e17;
      border: 1px solid #2a3548;
      border-radius: 12px;
      color: #e2e8f0;
      font-family: inherit;
      font-size: 15px;
      line-height: 1.6;
      padding: 12px 14px;
      resize: vertical;
      outline: none;
      transition: border-color 0.2s ease;
      -webkit-tap-highlight-color: transparent;
    }

    textarea::placeholder {
      color: #94a3b8;
    }

    textarea:focus {
      border-color: #3b82f6;
    }

    textarea:disabled {
      opacity: 0.5;
      pointer-events: none;
    }

    .char-counter {
      text-align: right;
      font-size: 12px;
      color: #94a3b8;
      margin-top: 5px;
    }

    .char-counter.over {
      color: #ef4444;
    }

    /* Scale */
    .scale-wrapper {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .scale-buttons {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .scale-btn {
      flex: 1;
      min-width: 36px;
      height: 44px;
      background: #0a0e17;
      border: 1px solid #2a3548;
      border-radius: 10px;
      color: #e2e8f0;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }

    .scale-btn:active {
      background: #131e30;
    }

    .scale-btn.selected {
      border-color: #3b82f6;
      background: #3b82f6;
      color: #fff;
    }

    .scale-btn:disabled {
      opacity: 0.5;
      pointer-events: none;
    }

    .scale-labels {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #94a3b8;
      padding: 0 2px;
    }

    /* Sticky submit (scroll mode) */
    #submit-bar {
      position: fixed;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 100%;
      max-width: 480px;
      padding: 12px 16px;
      background: linear-gradient(to top, #0a0e17 60%, transparent);
    }

    .submit-btn {
      width: 100%;
      height: 52px;
      background: #3b82f6;
      color: #fff;
      border: none;
      border-radius: 14px;
      font-size: 17px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s ease, transform 0.1s ease;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }

    .submit-btn:active {
      transform: scale(0.97);
    }

    .submit-btn:disabled {
      opacity: 0.4;
      pointer-events: none;
    }

    /* ── state views (shared) ── */
    .state-view {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      min-height: 60vh;
      gap: 12px;
    }

    #connecting {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 60vh;
      color: #94a3b8;
      font-size: 16px;
    }

    .check {
      font-size: 80px;
      animation: scaleIn 0.5s ease-out;
      line-height: 1;
    }

    h2 {
      font-size: 20px;
      font-weight: 700;
      color: #e2e8f0;
    }

    p {
      color: #94a3b8;
      font-size: 15px;
    }

    @keyframes scaleIn {
      from { transform: scale(0); opacity: 0; }
      to   { transform: scale(1); opacity: 1; }
    }

    /* ── step mode 6 views ── */
    .sm-card {
      background: #1a2332;
      border: 1px solid #2a3548;
      border-radius: 16px;
      padding: 24px 20px;
    }

    /* nickname view */
    #nickname-view {
      min-height: 60vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 16px;
    }

    .sm-title {
      font-size: 22px;
      font-weight: 700;
      color: #e2e8f0;
      text-align: center;
      margin-bottom: 8px;
    }

    .sm-subtitle {
      font-size: 14px;
      color: #94a3b8;
      text-align: center;
    }

    #nickname-input {
      width: 100%;
      height: 52px;
      background: #0a0e17;
      border: 1px solid #2a3548;
      border-radius: 12px;
      color: #e2e8f0;
      font-size: 16px;
      padding: 0 16px;
      outline: none;
      transition: border-color 0.2s ease;
      -webkit-tap-highlight-color: transparent;
      font-family: inherit;
    }

    #nickname-input::placeholder {
      color: #94a3b8;
    }

    #nickname-input:focus {
      border-color: #3b82f6;
    }

    #nickname-submit {
      width: 100%;
      height: 52px;
      background: #3b82f6;
      color: #fff;
      border: none;
      border-radius: 14px;
      font-size: 17px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s ease, transform 0.1s ease;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }

    #nickname-submit:active {
      transform: scale(0.97);
    }

    #nickname-submit:disabled {
      opacity: 0.4;
      pointer-events: none;
    }

    #nickname-error {
      color: #ef4444;
      font-size: 13px;
      text-align: center;
      min-height: 18px;
    }

    #nickname-hint {
      text-align: center;
      color: #94a3b8;
      font-size: 13px;
      margin-top: 12px;
    }

    /* lobby spinner */
    .sm-spinner {
      width: 48px;
      height: 48px;
      border: 3px solid #2a3548;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 0.9s linear infinite;
      margin: 12px auto;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* progress header */
    .sm-progress {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 16px;
    }

    .sm-progress-text {
      text-align: center;
      font-size: 13px;
      color: #94a3b8;
      font-weight: 500;
    }

    .sm-progress-bar-bg {
      height: 3px;
      background: #2a3548;
      border-radius: 99px;
      overflow: hidden;
    }

    .sm-progress-bar-fill {
      height: 100%;
      background: #3b82f6;
      border-radius: 99px;
      transition: width 0.3s ease;
    }

    /* open view */
    .sm-question-text {
      font-size: 17px;
      font-weight: 600;
      color: #e2e8f0;
      line-height: 1.5;
      margin-bottom: 16px;
    }

    .sm-multi-hint {
      font-size: 12px;
      color: #94a3b8;
      margin-bottom: 8px;
    }

    #sm-submit-bar {
      position: fixed;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 100%;
      max-width: 480px;
      padding: 12px 16px;
      background: linear-gradient(to top, #0a0e17 60%, transparent);
    }

    #sm-answer-submit {
      width: 100%;
      height: 52px;
      background: #3b82f6;
      color: #fff;
      border: none;
      border-radius: 14px;
      font-size: 17px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s ease, transform 0.1s ease;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }

    #sm-answer-submit:active {
      transform: scale(0.97);
    }

    #sm-answer-submit:disabled {
      opacity: 0.4;
      pointer-events: none;
    }

    .sm-meta-row {
      text-align: center;
      font-size: 13px;
      color: #94a3b8;
      margin-top: 16px;
    }

    /* waiting view */
    #waiting-view {
      min-height: 60vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      text-align: center;
      gap: 12px;
    }

    .sm-my-answer-summary {
      background: #1a2332;
      border: 1px solid #2a3548;
      border-radius: 12px;
      padding: 12px 16px;
      color: #94a3b8;
      font-size: 13px;
      margin-top: 12px;
      text-align: left;
    }

    .sm-my-answer-summary strong {
      color: #e2e8f0;
      font-weight: 600;
    }

    #sm-edit-answer-btn {
      align-self: center;
      background: transparent;
      color: #3b82f6;
      border: 1px solid #3b82f6;
      border-radius: 10px;
      padding: 10px 18px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 8px;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
      transition: background 0.15s ease;
    }

    #sm-edit-answer-btn:active {
      background: rgba(59,130,246,0.1);
    }

    /* revealed view */
    .sm-reveal-bar-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 10px;
    }

    .sm-reveal-bar-label {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 14px;
      color: #e2e8f0;
      gap: 8px;
    }

    .sm-reveal-bar-label-text {
      flex: 1;
      word-break: break-word;
    }

    .sm-reveal-bar-count {
      font-size: 12px;
      color: #94a3b8;
      flex-shrink: 0;
    }

    .sm-reveal-bar-bg {
      height: 10px;
      background: #0a0e17;
      border: 1px solid #2a3548;
      border-radius: 99px;
      overflow: hidden;
    }

    .sm-reveal-bar-fill {
      height: 100%;
      background: #3b82f6;
      border-radius: 99px;
      transition: width 0.4s ease;
    }

    .sm-reveal-choice-row.is-mine .sm-reveal-bar-bg {
      border-color: #3b82f6;
      box-shadow: 0 0 0 1px #3b82f6;
    }

    .sm-reveal-choice-row.is-mine .sm-reveal-bar-label-text::before {
      content: '🌸 ';
    }

    .sm-reveal-scale-avg {
      text-align: center;
      margin: 8px 0 16px;
    }

    .sm-reveal-scale-avg-num {
      font-size: 44px;
      font-weight: 700;
      color: #f59e0b;
      line-height: 1.1;
    }

    .sm-reveal-scale-avg-label {
      font-size: 12px;
      color: #94a3b8;
      margin-top: 4px;
    }

    .sm-reveal-scale-hist {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 4px;
      height: 120px;
      margin-top: 8px;
      padding: 0 2px;
    }

    .sm-reveal-scale-col {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      height: 100%;
    }

    .sm-reveal-scale-bar-wrap {
      flex: 1;
      width: 100%;
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }

    .sm-reveal-scale-bar {
      width: 100%;
      min-height: 2px;
      background: #3b82f6;
      border-radius: 6px 6px 0 0;
      transition: height 0.4s ease;
      position: relative;
    }

    .sm-reveal-scale-marker {
      position: absolute;
      top: -22px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 14px;
    }

    .sm-reveal-scale-val {
      font-size: 11px;
      color: #94a3b8;
    }

    .sm-reveal-scale-col.is-mine .sm-reveal-scale-val {
      color: #f59e0b;
      font-weight: 700;
    }

    .sm-reveal-text-list {
      max-height: 280px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 8px;
    }

    .sm-reveal-text-item {
      background: #0a0e17;
      border: 1px solid #2a3548;
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 14px;
      color: #e2e8f0;
      line-height: 1.5;
      word-break: break-word;
    }

    .sm-reveal-text-item.is-mine {
      background: rgba(59,130,246,0.12);
      border-color: #3b82f6;
    }

    .sm-reveal-text-mine-label {
      font-size: 11px;
      color: #3b82f6;
      font-weight: 700;
      margin-bottom: 4px;
    }

    .sm-reveal-empty {
      text-align: center;
      color: #94a3b8;
      font-size: 13px;
      padding: 20px 0;
    }

    .sm-reveal-wait-hint {
      text-align: center;
      color: #94a3b8;
      font-size: 13px;
      margin-top: 16px;
    }

    /* ended view */
    #ended-view {
      min-height: 60vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      text-align: center;
      gap: 12px;
    }

    .sm-ended-emoji {
      font-size: 64px;
      line-height: 1;
    }
  </style>
</head>
<body>
  <div id="app">
    <div id="header">
      <div class="logo">📋 쌤핀 복수 설문</div>
    </div>

    <div id="connecting">연결 중...</div>

    <!-- scroll mode (stepMode=false) -->
    <div id="survey-scroll" hidden>
      <div id="questions-container"></div>
    </div>

    <!-- stepMode=true — 6 views -->
    <div id="nickname-view" hidden>
      <div class="sm-title">📌 쌤핀 라이브 참여</div>
      <div class="sm-card">
        <input type="text" id="nickname-input" placeholder="이름 또는 닉네임" maxlength="20" autocomplete="off" />
        <div id="nickname-error"></div>
        <button id="nickname-submit" disabled>참가하기</button>
      </div>
      <div id="nickname-hint">선생님이 시작하기를 기다립니다</div>
    </div>

    <div id="lobby-view" hidden class="state-view">
      <div class="sm-title" id="lobby-greeting">📌 선생님이 시작하기를 기다리는 중…</div>
      <div class="sm-spinner"></div>
      <div class="sm-subtitle" id="lobby-count">연결된 친구들: 0명</div>
    </div>

    <div id="open-view" hidden>
      <div class="sm-progress">
        <div class="sm-progress-text" id="open-progress-text">문항 1 / 1</div>
        <div class="sm-progress-bar-bg">
          <div class="sm-progress-bar-fill" id="open-progress-fill" style="width:0%"></div>
        </div>
      </div>
      <div class="sm-card">
        <div class="sm-question-text" id="open-question-text"></div>
        <div id="open-input-container"></div>
      </div>
      <div class="sm-meta-row" id="open-meta"></div>
    </div>

    <div id="waiting-view" hidden>
      <div class="check">✅</div>
      <h2>답변을 받았어요</h2>
      <p>선생님이 결과를 공개하면 이어서 진행됩니다</p>
      <div class="sm-my-answer-summary" id="waiting-my-answer"></div>
      <button id="sm-edit-answer-btn">답변 수정</button>
      <div class="sm-meta-row" id="waiting-meta"></div>
    </div>

    <div id="revealed-view" hidden>
      <div class="sm-progress">
        <div class="sm-progress-text" id="revealed-progress-text">문항 1 / 1</div>
        <div class="sm-progress-bar-bg">
          <div class="sm-progress-bar-fill" id="revealed-progress-fill" style="width:0%"></div>
        </div>
      </div>
      <div class="sm-card">
        <div class="sm-question-text" id="revealed-question-text"></div>
        <div id="revealed-aggregate-container"></div>
      </div>
      <div class="sm-reveal-wait-hint">선생님이 다음 문항으로 진행합니다</div>
    </div>

    <div id="ended-view" hidden>
      <div class="sm-ended-emoji">🌸</div>
      <h2>수고했어요!</h2>
      <p>설문에 참여해 주셔서 감사합니다</p>
      <div class="sm-subtitle" id="ended-summary"></div>
    </div>

    <!-- scroll-mode submitted / closed / disconnected -->
    <div id="submitted" class="state-view" hidden>
      <div class="check">✓</div>
      <h2>제출 완료!</h2>
      <p>답변해 주셔서 감사합니다</p>
    </div>

    <div id="closed" class="state-view" hidden>
      <h2>설문이 종료되었습니다</h2>
    </div>

    <div id="disconnected" class="state-view" hidden>
      <h2>연결이 끊어졌습니다</h2>
      <p>다시 연결 중...</p>
    </div>
  </div>

  <!-- scroll mode: sticky submit bar -->
  <div id="submit-bar" hidden>
    <button class="submit-btn" id="submit-btn">답변 제출</button>
  </div>

  <!-- step mode (open view): sticky submit bar -->
  <div id="sm-submit-bar" hidden>
    <button id="sm-answer-submit" disabled>제출</button>
  </div>

  <script>
    (function () {
      'use strict';

      var QUESTIONS = ${questionsJson};
      var STEP_MODE = ${stepModeJson};
      var totalCount = QUESTIONS.length;

      /* ── DOM show helpers ── */
      var ALL_VIEW_IDS = [
        'connecting',
        'survey-scroll',
        'nickname-view',
        'lobby-view',
        'open-view',
        'waiting-view',
        'revealed-view',
        'ended-view',
        'submitted',
        'closed',
        'disconnected'
      ];

      function show(id) {
        for (var i = 0; i < ALL_VIEW_IDS.length; i++) {
          var el = document.getElementById(ALL_VIEW_IDS[i]);
          if (el) el.hidden = ALL_VIEW_IDS[i] !== id;
        }
        var submitBar = document.getElementById('submit-bar');
        if (submitBar) submitBar.hidden = id !== 'survey-scroll';
        var smSubmitBar = document.getElementById('sm-submit-bar');
        if (smSubmitBar) smSubmitBar.hidden = id !== 'open-view';
      }

      /* ── render helpers (shared) ── */
      function renderSingleChoice(q, onChange) {
        var list = document.createElement('div');
        list.className = 'options-list';
        var options = q.options || [];
        for (var i = 0; i < options.length; i++) {
          var opt = options[i];
          var lbl = document.createElement('label');
          lbl.className = 'option-label';
          lbl.setAttribute('data-optid', opt.id);

          var radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = 'q_' + q.id;
          radio.value = opt.id;

          var span = document.createElement('span');
          span.textContent = opt.text;

          lbl.appendChild(radio);
          lbl.appendChild(span);

          (function (label, radioInput) {
            radioInput.addEventListener('change', function () {
              var siblings = label.parentElement
                ? label.parentElement.querySelectorAll('.option-label')
                : [];
              for (var s = 0; s < siblings.length; s++) {
                siblings[s].classList.remove('selected');
              }
              if (radioInput.checked) label.classList.add('selected');
              if (onChange) onChange();
            });
          })(lbl, radio);

          list.appendChild(lbl);
        }
        return list;
      }

      function renderMultiChoice(q, onChange) {
        var list = document.createElement('div');
        list.className = 'options-list';
        var options = q.options || [];
        for (var i = 0; i < options.length; i++) {
          var opt = options[i];
          var lbl = document.createElement('label');
          lbl.className = 'option-label';

          var chk = document.createElement('input');
          chk.type = 'checkbox';
          chk.name = 'q_' + q.id;
          chk.value = opt.id;

          var span = document.createElement('span');
          span.textContent = opt.text;

          lbl.appendChild(chk);
          lbl.appendChild(span);

          (function (label, checkbox) {
            checkbox.addEventListener('change', function () {
              if (checkbox.checked) {
                label.classList.add('selected');
              } else {
                label.classList.remove('selected');
              }
              if (onChange) onChange();
            });
          })(lbl, chk);

          list.appendChild(lbl);
        }
        return list;
      }

      function renderText(q, onChange) {
        var wrap = document.createElement('div');
        var maxLen = q.maxLength || 200;

        var ta = document.createElement('textarea');
        ta.placeholder = '답변을 입력하세요...';
        ta.maxLength = maxLen;
        ta.setAttribute('data-qid', q.id);

        var counter = document.createElement('div');
        counter.className = 'char-counter';
        counter.innerHTML = '<span class="cc">0</span>/' + maxLen + '자';

        ta.addEventListener('input', function () {
          var len = ta.value.length;
          var cc = counter.querySelector('.cc');
          if (cc) cc.textContent = String(len);
          if (len >= maxLen) {
            counter.classList.add('over');
          } else {
            counter.classList.remove('over');
          }
          if (onChange) onChange();
        });

        wrap.appendChild(ta);
        wrap.appendChild(counter);
        return wrap;
      }

      function renderScale(q, onChange) {
        var min = typeof q.scaleMin === 'number' ? q.scaleMin : 1;
        var max = typeof q.scaleMax === 'number' ? q.scaleMax : 5;

        var wrap = document.createElement('div');
        wrap.className = 'scale-wrapper';

        var btnRow = document.createElement('div');
        btnRow.className = 'scale-buttons';
        btnRow.setAttribute('data-qid', q.id);

        for (var v = min; v <= max; v++) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'scale-btn';
          btn.textContent = String(v);
          btn.setAttribute('data-val', String(v));

          (function (b) {
            b.addEventListener('click', function () {
              var allBtns = btnRow.querySelectorAll('.scale-btn');
              for (var k = 0; k < allBtns.length; k++) {
                allBtns[k].classList.remove('selected');
              }
              b.classList.add('selected');
              if (onChange) onChange();
            });
          })(btn);

          btnRow.appendChild(btn);
        }

        wrap.appendChild(btnRow);

        if (q.scaleMinLabel || q.scaleMaxLabel) {
          var lblRow = document.createElement('div');
          lblRow.className = 'scale-labels';
          var minLbl = document.createElement('span');
          minLbl.textContent = q.scaleMinLabel || '';
          var maxLbl = document.createElement('span');
          maxLbl.textContent = q.scaleMaxLabel || '';
          lblRow.appendChild(minLbl);
          lblRow.appendChild(maxLbl);
          wrap.appendChild(lblRow);
        }

        return wrap;
      }

      function collectAnswerFromDOM(q, container) {
        if (q.type === 'single-choice') {
          var checked = container.querySelector('input[name="q_' + q.id + '"]:checked');
          return checked ? checked.value : null;
        } else if (q.type === 'multi-choice') {
          var checkboxes = container.querySelectorAll('input[name="q_' + q.id + '"]:checked');
          var vals = [];
          for (var ci = 0; ci < checkboxes.length; ci++) {
            vals.push(checkboxes[ci].value);
          }
          return vals.length > 0 ? vals : null;
        } else if (q.type === 'text') {
          var ta = container.querySelector('textarea[data-qid="' + q.id + '"]');
          var text = ta ? ta.value.trim() : '';
          return text.length > 0 ? text : null;
        } else if (q.type === 'scale') {
          var selBtn = container.querySelector('.scale-buttons[data-qid="' + q.id + '"] .scale-btn.selected');
          return selBtn ? Number(selBtn.getAttribute('data-val')) : null;
        }
        return null;
      }

      /* ════════════════════════════════════════════════════════
       * STEP MODE (stepMode=true) — state-driven 6-view client
       * ════════════════════════════════════════════════════════ */
      if (STEP_MODE) {
        var sessionId = (function () {
          var id = null;
          try { id = sessionStorage.getItem('ssampin-live-session-id'); } catch (e) {}
          if (!id) {
            id = (typeof crypto !== 'undefined' && crypto.randomUUID)
              ? crypto.randomUUID()
              : Math.random().toString(36).slice(2) + Date.now().toString(36);
            try { sessionStorage.setItem('ssampin-live-session-id', id); } catch (e) {}
          }
          return id;
        })();

        var nickname = null;
        try { nickname = sessionStorage.getItem('ssampin-live-nickname'); } catch (e) {}
        if (nickname !== null) {
          var trimmed = String(nickname).trim();
          nickname = (trimmed.length >= 1 && trimmed.length <= 20) ? trimmed : null;
        }

        /** current server state (null until first 'state' message) */
        var currentState = null;
        /** how many questions this student has answered (counted across 'ack' + initial state) */
        var answeredCountLocal = 0;
        /** set of questionIndexes we have already counted as answered (de-dup ack) */
        var answeredSet = {};

        var ws = null;
        var wasConnected = false;
        var reconnectDelay = 1000;
        var reconnectTimer = null;

        /* ── WS send helpers ── */
        function sendJoin() {
          if (!ws || ws.readyState !== WebSocket.OPEN) return;
          if (nickname === null) return;
          try {
            ws.send(JSON.stringify({
              type: 'join',
              sessionId: sessionId,
              nickname: nickname
            }));
          } catch (e) {}
        }

        function sendAnswer(questionIndex, answer) {
          if (!ws || ws.readyState !== WebSocket.OPEN) return false;
          try {
            ws.send(JSON.stringify({
              type: 'answer',
              sessionId: sessionId,
              questionIndex: questionIndex,
              answer: answer
            }));
            return true;
          } catch (e) {
            return false;
          }
        }

        /* ── Nickname view ── */
        function renderNicknameView(errorMsg) {
          var input = document.getElementById('nickname-input');
          var btn = document.getElementById('nickname-submit');
          var err = document.getElementById('nickname-error');
          if (err) err.textContent = errorMsg || '';
          if (input && !input.dataset.bound) {
            input.dataset.bound = '1';
            input.addEventListener('input', function () {
              var v = input.value.trim();
              if (btn) btn.disabled = !(v.length >= 1 && v.length <= 20);
            });
            input.addEventListener('keydown', function (ev) {
              if (ev.key === 'Enter') {
                ev.preventDefault();
                submitNickname();
              }
            });
          }
          if (btn && !btn.dataset.bound) {
            btn.dataset.bound = '1';
            btn.addEventListener('click', submitNickname);
          }
          show('nickname-view');
          if (input) {
            try { input.focus(); } catch (e) {}
          }
        }

        function submitNickname() {
          var input = document.getElementById('nickname-input');
          var err = document.getElementById('nickname-error');
          if (!input) return;
          var v = input.value.trim();
          if (v.length < 1 || v.length > 20) {
            if (err) err.textContent = '닉네임은 1~20자여야 합니다';
            return;
          }
          nickname = v;
          try { sessionStorage.setItem('ssampin-live-nickname', nickname); } catch (e) {}
          if (err) err.textContent = '';
          sendJoin();
        }

        /* ── Lobby view ── */
        function renderLobbyView(state) {
          var greeting = document.getElementById('lobby-greeting');
          var countEl = document.getElementById('lobby-count');
          var myName = state.myNickname || nickname || '';
          if (greeting) {
            greeting.textContent = '📌 ' + myName + '님, 선생님이 시작하기를 기다리는 중…';
          }
          if (countEl) {
            countEl.textContent = '연결된 친구들: ' + (state.totalConnected || 0) + '명';
          }
          show('lobby-view');
        }

        /* ── Open view (answering) ── */
        function renderOpenView(state) {
          var q = state.question;
          if (!q) return;

          var progText = document.getElementById('open-progress-text');
          var progFill = document.getElementById('open-progress-fill');
          var qText = document.getElementById('open-question-text');
          var container = document.getElementById('open-input-container');
          var metaEl = document.getElementById('open-meta');

          if (progText) {
            progText.textContent = '문항 ' + ((state.questionIndex || 0) + 1) + ' / ' + (state.totalQuestions || totalCount);
          }
          if (progFill) {
            var total = state.totalQuestions || totalCount;
            var pct = total > 0 ? (((state.questionIndex || 0) + 1) / total) * 100 : 0;
            progFill.style.width = pct + '%';
          }
          if (qText) qText.textContent = q.question;

          if (container) {
            container.innerHTML = '';
            if (q.type === 'multi-choice') {
              var hint = document.createElement('div');
              hint.className = 'sm-multi-hint';
              hint.textContent = '여러 개 선택 가능';
              container.appendChild(hint);
              container.appendChild(renderMultiChoice(q, updateOpenSubmitState));
            } else if (q.type === 'single-choice') {
              container.appendChild(renderSingleChoice(q, updateOpenSubmitState));
            } else if (q.type === 'text') {
              container.appendChild(renderText(q, updateOpenSubmitState));
            } else if (q.type === 'scale') {
              container.appendChild(renderScale(q, updateOpenSubmitState));
            }
          }

          if (metaEl) {
            metaEl.textContent = '응답 수: ' + (state.totalAnswered || 0) + ' / ' + (state.totalConnected || 0);
          }

          show('open-view');
          updateOpenSubmitState();
        }

        function collectOpenAnswer() {
          var state = currentState;
          if (!state || !state.question) return null;
          var q = state.question;
          var container = document.getElementById('open-input-container');
          if (!container) return null;
          return collectAnswerFromDOM(q, container);
        }

        function updateOpenSubmitState() {
          var btn = document.getElementById('sm-answer-submit');
          if (!btn) return;
          var val = collectOpenAnswer();
          var valid = (val !== null) && !(Array.isArray(val) && val.length === 0);
          btn.disabled = !valid;
        }

        (function bindOpenSubmitBtn() {
          var btn = document.getElementById('sm-answer-submit');
          if (!btn || btn.dataset.bound) return;
          btn.dataset.bound = '1';
          btn.addEventListener('click', function () {
            var state = currentState;
            if (!state || state.phase !== 'open' || !state.question) return;
            var q = state.question;
            var val = collectOpenAnswer();
            if (val === null || (Array.isArray(val) && val.length === 0)) return;

            var answer = null;
            if (q.type === 'single-choice') {
              answer = { optionIds: [String(val)] };
            } else if (q.type === 'multi-choice') {
              if (!Array.isArray(val)) return;
              answer = { optionIds: val.map(function (x) { return String(x); }) };
            } else if (q.type === 'scale') {
              answer = { scale: Number(val) };
            } else if (q.type === 'text') {
              answer = { text: String(val) };
            }

            if (!answer) return;
            var sent = sendAnswer(state.questionIndex, answer);
            if (sent) {
              btn.disabled = true;
            }
          });
        })();

        /* ── Waiting view (after answer) ── */
        function renderWaitingView(state) {
          var metaEl = document.getElementById('waiting-meta');
          var summaryEl = document.getElementById('waiting-my-answer');
          if (metaEl) {
            metaEl.textContent = '응답 수: ' + (state.totalAnswered || 0) + ' / ' + (state.totalConnected || 0);
          }
          if (summaryEl) {
            summaryEl.innerHTML = '';
            var q = state.question;
            var myAnswer = state.myAnswer;
            if (q && myAnswer) {
              var label = document.createElement('strong');
              label.textContent = '나의 답변: ';
              summaryEl.appendChild(label);

              var answerText = '';
              if ((q.type === 'single-choice' || q.type === 'multi-choice') && Array.isArray(myAnswer.optionIds)) {
                var labels = [];
                var options = q.options || [];
                for (var i = 0; i < myAnswer.optionIds.length; i++) {
                  var optId = myAnswer.optionIds[i];
                  for (var j = 0; j < options.length; j++) {
                    if (options[j].id === optId) { labels.push(options[j].text); break; }
                  }
                }
                answerText = labels.join(', ');
              } else if (q.type === 'scale' && typeof myAnswer.scale === 'number') {
                answerText = String(myAnswer.scale);
              } else if (q.type === 'text' && typeof myAnswer.text === 'string') {
                answerText = myAnswer.text;
              }
              var txtNode = document.createTextNode(answerText);
              summaryEl.appendChild(txtNode);
            }
          }
          show('waiting-view');
        }

        (function bindEditAnswerBtn() {
          var btn = document.getElementById('sm-edit-answer-btn');
          if (!btn || btn.dataset.bound) return;
          btn.dataset.bound = '1';
          btn.addEventListener('click', function () {
            var state = currentState;
            if (!state || state.phase !== 'open') return;
            // switch to open view — user can re-submit and it will overwrite on server
            renderOpenView(state);
            // restore previous answer into DOM so user sees what they had
            if (state.myAnswer && state.question) {
              restoreAnswerIntoOpenView(state.question, state.myAnswer);
              updateOpenSubmitState();
            }
          });
        })();

        function restoreAnswerIntoOpenView(q, myAnswer) {
          var container = document.getElementById('open-input-container');
          if (!container) return;
          if (q.type === 'single-choice' && Array.isArray(myAnswer.optionIds)) {
            var firstId = myAnswer.optionIds[0];
            if (firstId) {
              var radio = container.querySelector('input[name="q_' + q.id + '"][value="' + firstId + '"]');
              if (radio) {
                radio.checked = true;
                var lbl = radio.parentElement;
                if (lbl) lbl.classList.add('selected');
              }
            }
          } else if (q.type === 'multi-choice' && Array.isArray(myAnswer.optionIds)) {
            for (var i = 0; i < myAnswer.optionIds.length; i++) {
              var chk = container.querySelector('input[name="q_' + q.id + '"][value="' + myAnswer.optionIds[i] + '"]');
              if (chk) {
                chk.checked = true;
                var lblc = chk.parentElement;
                if (lblc) lblc.classList.add('selected');
              }
            }
          } else if (q.type === 'text' && typeof myAnswer.text === 'string') {
            var ta = container.querySelector('textarea[data-qid="' + q.id + '"]');
            if (ta) {
              ta.value = myAnswer.text;
              var cc = container.querySelector('.cc');
              if (cc) cc.textContent = String(myAnswer.text.length);
            }
          } else if (q.type === 'scale' && typeof myAnswer.scale === 'number') {
            var btnRow = container.querySelector('.scale-buttons[data-qid="' + q.id + '"]');
            if (btnRow) {
              var allBtns = btnRow.querySelectorAll('.scale-btn');
              for (var b = 0; b < allBtns.length; b++) {
                if (Number(allBtns[b].getAttribute('data-val')) === myAnswer.scale) {
                  allBtns[b].classList.add('selected');
                }
              }
            }
          }
        }

        /* ── Revealed view ── */
        function renderRevealedView(state) {
          var q = state.question;
          var aggregated = state.aggregated;
          if (!q) return;

          var progText = document.getElementById('revealed-progress-text');
          var progFill = document.getElementById('revealed-progress-fill');
          var qText = document.getElementById('revealed-question-text');
          var container = document.getElementById('revealed-aggregate-container');

          if (progText) {
            progText.textContent = '문항 ' + ((state.questionIndex || 0) + 1) + ' / ' + (state.totalQuestions || totalCount);
          }
          if (progFill) {
            var total = state.totalQuestions || totalCount;
            var pct = total > 0 ? (((state.questionIndex || 0) + 1) / total) * 100 : 0;
            progFill.style.width = pct + '%';
          }
          if (qText) qText.textContent = q.question;

          if (!container) { show('revealed-view'); return; }
          container.innerHTML = '';

          if (!aggregated) {
            var empty = document.createElement('div');
            empty.className = 'sm-reveal-empty';
            empty.textContent = '집계 중…';
            container.appendChild(empty);
            show('revealed-view');
            return;
          }

          if (q.type === 'single-choice' || q.type === 'multi-choice') {
            renderChoiceAggregate(container, q, aggregated, state.myAnswer);
          } else if (q.type === 'scale') {
            renderScaleAggregate(container, q, aggregated, state.myAnswer);
          } else if (q.type === 'text') {
            renderTextAggregate(container, aggregated, state.myAnswer);
          }

          show('revealed-view');
        }

        function renderChoiceAggregate(container, q, agg, myAnswer) {
          var counts = (agg && agg.counts) || {};
          var total = (agg && typeof agg.total === 'number') ? agg.total : 0;
          var options = q.options || [];
          var myIds = {};
          if (myAnswer && Array.isArray(myAnswer.optionIds)) {
            for (var m = 0; m < myAnswer.optionIds.length; m++) {
              myIds[myAnswer.optionIds[m]] = true;
            }
          }

          if (options.length === 0) {
            var empty = document.createElement('div');
            empty.className = 'sm-reveal-empty';
            empty.textContent = '옵션이 없습니다';
            container.appendChild(empty);
            return;
          }

          for (var i = 0; i < options.length; i++) {
            var opt = options[i];
            var c = counts[opt.id] || 0;
            var pct = total > 0 ? (c / total) * 100 : 0;
            var isMine = !!myIds[opt.id];

            var row = document.createElement('div');
            row.className = 'sm-reveal-bar-row sm-reveal-choice-row';
            if (isMine) row.classList.add('is-mine');

            var labelRow = document.createElement('div');
            labelRow.className = 'sm-reveal-bar-label';
            var labelText = document.createElement('span');
            labelText.className = 'sm-reveal-bar-label-text';
            labelText.textContent = opt.text;
            var countSpan = document.createElement('span');
            countSpan.className = 'sm-reveal-bar-count';
            countSpan.textContent = c + '표 (' + Math.round(pct) + '%)';
            labelRow.appendChild(labelText);
            labelRow.appendChild(countSpan);

            var bg = document.createElement('div');
            bg.className = 'sm-reveal-bar-bg';
            var fill = document.createElement('div');
            fill.className = 'sm-reveal-bar-fill';
            fill.style.width = pct + '%';
            bg.appendChild(fill);

            row.appendChild(labelRow);
            row.appendChild(bg);
            container.appendChild(row);
          }
        }

        function renderScaleAggregate(container, q, agg, myAnswer) {
          var avg = (agg && typeof agg.avg === 'number') ? agg.avg : 0;
          var distribution = (agg && agg.distribution) || {};
          var min = typeof q.scaleMin === 'number' ? q.scaleMin : 1;
          var max = typeof q.scaleMax === 'number' ? q.scaleMax : 5;
          var myScale = (myAnswer && typeof myAnswer.scale === 'number') ? myAnswer.scale : null;

          var avgWrap = document.createElement('div');
          avgWrap.className = 'sm-reveal-scale-avg';
          var avgNum = document.createElement('div');
          avgNum.className = 'sm-reveal-scale-avg-num';
          avgNum.textContent = avg.toFixed(1);
          var avgLbl = document.createElement('div');
          avgLbl.className = 'sm-reveal-scale-avg-label';
          avgLbl.textContent = '평균';
          avgWrap.appendChild(avgNum);
          avgWrap.appendChild(avgLbl);
          container.appendChild(avgWrap);

          var maxCount = 0;
          for (var v = min; v <= max; v++) {
            var n = distribution[v] || 0;
            if (n > maxCount) maxCount = n;
          }

          var hist = document.createElement('div');
          hist.className = 'sm-reveal-scale-hist';
          for (var sv = min; sv <= max; sv++) {
            var count = distribution[sv] || 0;
            var h = maxCount > 0 ? (count / maxCount) * 100 : 0;
            var isMine = (myScale === sv);

            var col = document.createElement('div');
            col.className = 'sm-reveal-scale-col';
            if (isMine) col.classList.add('is-mine');

            var barWrap = document.createElement('div');
            barWrap.className = 'sm-reveal-scale-bar-wrap';

            var bar = document.createElement('div');
            bar.className = 'sm-reveal-scale-bar';
            bar.style.height = h + '%';

            if (isMine) {
              var marker = document.createElement('div');
              marker.className = 'sm-reveal-scale-marker';
              marker.textContent = '🌸';
              bar.appendChild(marker);
            }

            barWrap.appendChild(bar);
            col.appendChild(barWrap);

            var valLbl = document.createElement('div');
            valLbl.className = 'sm-reveal-scale-val';
            valLbl.textContent = String(sv);
            col.appendChild(valLbl);

            hist.appendChild(col);
          }
          container.appendChild(hist);
        }

        function renderTextAggregate(container, agg, myAnswer) {
          var answers = (agg && Array.isArray(agg.answers)) ? agg.answers : [];
          var myText = (myAnswer && typeof myAnswer.text === 'string') ? myAnswer.text : null;

          if (answers.length === 0 && myText === null) {
            var empty = document.createElement('div');
            empty.className = 'sm-reveal-empty';
            empty.textContent = '아직 응답이 없습니다';
            container.appendChild(empty);
            return;
          }

          var list = document.createElement('div');
          list.className = 'sm-reveal-text-list';

          // Mine first
          if (myText !== null && myText.length > 0) {
            var mineItem = document.createElement('div');
            mineItem.className = 'sm-reveal-text-item is-mine';
            var mineLbl = document.createElement('div');
            mineLbl.className = 'sm-reveal-text-mine-label';
            mineLbl.textContent = '🌸 나';
            var mineBody = document.createElement('div');
            mineBody.textContent = myText;
            mineItem.appendChild(mineLbl);
            mineItem.appendChild(mineBody);
            list.appendChild(mineItem);
          }

          // Others (anonymous)
          var skippedMineOnce = false;
          for (var i = 0; i < answers.length; i++) {
            var a = answers[i];
            // if my own text also appears in the anonymous list, skip one occurrence to avoid duplication
            if (!skippedMineOnce && myText !== null && a === myText) {
              skippedMineOnce = true;
              continue;
            }
            var item = document.createElement('div');
            item.className = 'sm-reveal-text-item';
            item.textContent = a;
            list.appendChild(item);
          }

          container.appendChild(list);
        }

        /* ── Ended view ── */
        function renderEndedView() {
          var summaryEl = document.getElementById('ended-summary');
          if (summaryEl) {
            summaryEl.textContent = '답변한 문항 수: ' + answeredCountLocal + ' / ' + totalCount;
          }
          show('ended-view');
        }

        /* ── Main state dispatcher ── */
        function render() {
          var state = currentState;
          if (nickname === null) {
            renderNicknameView(null);
            return;
          }
          if (!state) {
            show('connecting');
            return;
          }
          var phase = state.phase;
          if (phase === 'lobby') {
            renderLobbyView(state);
          } else if (phase === 'open') {
            if (state.myAnswer) {
              renderWaitingView(state);
            } else {
              renderOpenView(state);
            }
          } else if (phase === 'revealed') {
            renderRevealedView(state);
          } else if (phase === 'ended') {
            renderEndedView();
          }
        }

        /* ── WebSocket handlers ── */
        function connect() {
          if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
          }
          try {
            var wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
            ws = new WebSocket(wsProto + '//' + location.host);
          } catch (e) {
            scheduleReconnect();
            return;
          }

          ws.onopen = function () {
            wasConnected = true;
            reconnectDelay = 1000;
            if (nickname !== null) {
              sendJoin();
            } else {
              renderNicknameView(null);
            }
          };

          ws.onmessage = function (event) {
            var msg;
            try {
              msg = JSON.parse(event.data);
            } catch (e) {
              return;
            }
            if (!msg || typeof msg !== 'object') return;

            if (msg.type === 'state') {
              currentState = {
                phase: msg.phase,
                questionIndex: msg.questionIndex,
                totalQuestions: msg.totalQuestions,
                totalConnected: msg.totalConnected,
                totalAnswered: msg.totalAnswered,
                myNickname: msg.myNickname,
                question: msg.question || null,
                myAnswer: msg.myAnswer || null,
                aggregated: msg.aggregated || null
              };
              // If server knows my nickname, sync it (survives refresh)
              if (typeof msg.myNickname === 'string' && msg.myNickname.length > 0) {
                nickname = msg.myNickname;
                try { sessionStorage.setItem('ssampin-live-nickname', nickname); } catch (e) {}
              }
              // track answered questions for ended summary
              if (currentState.myAnswer && typeof currentState.questionIndex === 'number') {
                if (!answeredSet[currentState.questionIndex]) {
                  answeredSet[currentState.questionIndex] = true;
                  answeredCountLocal = Object.keys(answeredSet).length;
                }
              }
              render();
            } else if (msg.type === 'joined') {
              if (typeof msg.nickname === 'string') {
                nickname = msg.nickname;
                try { sessionStorage.setItem('ssampin-live-nickname', nickname); } catch (e) {}
              }
              if (typeof msg.sessionId === 'string' && msg.sessionId.length > 0) {
                sessionId = msg.sessionId;
                try { sessionStorage.setItem('ssampin-live-session-id', sessionId); } catch (e) {}
              }
              // state will be sent immediately after by server
            } else if (msg.type === 'ack') {
              if (typeof msg.questionIndex === 'number') {
                if (!answeredSet[msg.questionIndex]) {
                  answeredSet[msg.questionIndex] = true;
                  answeredCountLocal = Object.keys(answeredSet).length;
                }
              }
            } else if (msg.type === 'error') {
              if (msg.code === 'nickname_required' || msg.code === 'nickname_invalid') {
                nickname = null;
                try { sessionStorage.removeItem('ssampin-live-nickname'); } catch (e) {}
                renderNicknameView(typeof msg.message === 'string' ? msg.message : '닉네임을 다시 입력해주세요');
              }
            } else if (msg.type === 'closed') {
              show('closed');
            }
          };

          ws.onclose = function () {
            ws = null;
            if (wasConnected && currentState && currentState.phase !== 'ended') {
              show('disconnected');
            }
            scheduleReconnect();
          };

          ws.onerror = function () {
            // onclose also fires
          };
        }

        function scheduleReconnect() {
          reconnectTimer = setTimeout(function () {
            reconnectTimer = null;
            connect();
          }, 2000);
          reconnectDelay = Math.min(reconnectDelay * 1.5, 10000);
        }

        // Initial view
        if (nickname === null) {
          renderNicknameView(null);
        }
        connect();
        return;
      }

      /* ════════════════════════════════════════════════════════
       * SCROLL MODE (stepMode=false) — legacy, preserved verbatim
       * ════════════════════════════════════════════════════════ */
      var sessionToken = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);

      var hasSubmitted = false;
      var wasConnected = false;
      var ws = null;
      var reconnectDelay = 1000;
      var reconnectTimer = null;

      function disableAll() {
        var inputs = document.querySelectorAll(
          '#questions-container input, #questions-container textarea, #questions-container button'
        );
        for (var i = 0; i < inputs.length; i++) {
          inputs[i].disabled = true;
        }
        var btn = document.getElementById('submit-btn');
        if (btn) btn.disabled = true;
      }

      /* ── scroll mode ── */
      function renderScrollMode() {
        var container = document.getElementById('questions-container');
        if (!container) return;
        container.innerHTML = '';

        for (var qi = 0; qi < QUESTIONS.length; qi++) {
          var q = QUESTIONS[qi];
          var card = document.createElement('div');
          card.className = 'question-card';
          card.setAttribute('data-qid', q.id);

          var meta = document.createElement('div');
          meta.className = 'question-meta';

          var numSpan = document.createElement('span');
          numSpan.className = 'question-num';
          numSpan.textContent = (qi + 1) + ' / ' + totalCount;
          meta.appendChild(numSpan);

          if (q.required) {
            var req = document.createElement('span');
            req.className = 'required-badge';
            req.textContent = '* 필수';
            meta.appendChild(req);
          }
          card.appendChild(meta);

          var qText = document.createElement('div');
          qText.className = 'question-text';
          qText.textContent = q.question;
          card.appendChild(qText);

          if (q.type === 'single-choice') {
            card.appendChild(renderSingleChoice(q, onScrollInputChange));
          } else if (q.type === 'multi-choice') {
            card.appendChild(renderMultiChoice(q, onScrollInputChange));
          } else if (q.type === 'text') {
            card.appendChild(renderText(q, onScrollInputChange));
          } else if (q.type === 'scale') {
            card.appendChild(renderScale(q, onScrollInputChange));
          }

          container.appendChild(card);
        }
      }

      function collectScrollAnswers() {
        var container = document.getElementById('questions-container');
        if (!container) return [];
        var answers = [];
        for (var qi = 0; qi < QUESTIONS.length; qi++) {
          var q = QUESTIONS[qi];
          var value = collectAnswerFromDOM(q, container);
          answers.push({ questionId: q.id, value: value });
        }
        return answers;
      }

      function isScrollValid(answers) {
        for (var i = 0; i < QUESTIONS.length; i++) {
          var q = QUESTIONS[i];
          if (!q.required) continue;
          var ans = answers[i];
          if (ans.value === null || ans.value === undefined) return false;
          if (Array.isArray(ans.value) && ans.value.length === 0) return false;
        }
        return true;
      }

      function onScrollInputChange() {
        var btn = document.getElementById('submit-btn');
        if (!btn) return;
        var answers = collectScrollAnswers();
        btn.disabled = !isScrollValid(answers);
      }

      /* ── scroll mode: submit ── */
      var submitBtn = document.getElementById('submit-btn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.addEventListener('click', function () {
          if (hasSubmitted) return;
          var answers = collectScrollAnswers();
          if (!isScrollValid(answers)) return;

          disableAll();

          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'submit',
              answers: answers,
              sessionToken: sessionToken,
            }));
          }
        });
      }

      /* ── WebSocket (scroll mode) ── */
      function connect() {
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }

        try {
          var wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
          ws = new WebSocket(wsProto + '//' + location.host);
        } catch (e) {
          scheduleReconnect();
          return;
        }

        ws.onopen = function () {
          wasConnected = true;
          reconnectDelay = 1000;
          ws.send(JSON.stringify({ type: 'join', sessionToken: sessionToken }));
          if (hasSubmitted) {
            show('submitted');
          }
        };

        ws.onmessage = function (event) {
          var msg;
          try {
            msg = JSON.parse(event.data);
          } catch (e) {
            return;
          }

          if (msg.type === 'survey') {
            if (!hasSubmitted) {
              renderScrollMode();
              onScrollInputChange();
              show('survey-scroll');
            }
          } else if (msg.type === 'submitted') {
            hasSubmitted = true;
            disableAll();
            show('submitted');
          } else if (msg.type === 'already_submitted') {
            hasSubmitted = true;
            disableAll();
            show('submitted');
          } else if (msg.type === 'closed') {
            show('closed');
          }
        };

        ws.onclose = function () {
          ws = null;
          if (!hasSubmitted && wasConnected) {
            show('disconnected');
          }
          scheduleReconnect();
        };

        ws.onerror = function () {
          // onclose will also fire
        };
      }

      function scheduleReconnect() {
        reconnectTimer = setTimeout(function () {
          reconnectTimer = null;
          connect();
        }, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 1.5, 10000);
      }

      connect();
    })();
  </script>
</body>
</html>`;
}
