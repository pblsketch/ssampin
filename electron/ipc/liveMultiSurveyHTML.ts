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

    /* ── step mode ── */
    #step-progress {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 20px;
    }

    .step-progress-text {
      text-align: center;
      font-size: 13px;
      color: #94a3b8;
      font-weight: 500;
    }

    .step-progress-bar-bg {
      height: 3px;
      background: #2a3548;
      border-radius: 99px;
      overflow: hidden;
    }

    .step-progress-bar-fill {
      height: 100%;
      background: #3b82f6;
      border-radius: 99px;
      transition: width 0.3s ease;
    }

    #step-viewport {
      overflow: hidden;
      position: relative;
    }

    #step-track {
      display: flex;
      transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
      will-change: transform;
    }

    .step-slide {
      flex: 0 0 100%;
      width: 100%;
    }

    /* error message under question */
    .step-error {
      margin-top: 10px;
      font-size: 13px;
      color: #ef4444;
      display: none;
    }

    .step-error.visible {
      display: block;
    }

    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      20%       { transform: translateX(-6px); }
      40%       { transform: translateX(6px); }
      60%       { transform: translateX(-4px); }
      80%       { transform: translateX(4px); }
    }

    .shake {
      animation: shake 0.4s ease;
    }

    /* step nav bar */
    #step-nav {
      position: fixed;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 100%;
      max-width: 480px;
      padding: 12px 16px;
      background: linear-gradient(to top, #0a0e17 60%, transparent);
      display: flex;
      gap: 10px;
    }

    .step-back-btn {
      height: 52px;
      width: 52px;
      flex-shrink: 0;
      background: #1a2332;
      color: #e2e8f0;
      border: 1px solid #2a3548;
      border-radius: 14px;
      font-size: 18px;
      cursor: pointer;
      transition: opacity 0.2s ease, transform 0.1s ease;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .step-back-btn:active {
      transform: scale(0.97);
    }

    .step-back-btn:disabled {
      opacity: 0.25;
      pointer-events: none;
    }

    .step-next-btn {
      flex: 1;
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

    .step-next-btn:active {
      transform: scale(0.97);
    }

    .step-next-btn:disabled {
      opacity: 0.4;
      pointer-events: none;
    }

    /* State views */
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
  </style>
</head>
<body>
  <div id="app">
    <div id="header">
      <div class="logo">📋 쌤핀 복수 설문</div>
    </div>

    <div id="connecting">연결 중...</div>

    <!-- scroll mode -->
    <div id="survey-scroll" hidden>
      <div id="questions-container"></div>
    </div>

    <!-- step mode -->
    <div id="survey-step" hidden>
      <div id="step-progress">
        <div class="step-progress-text" id="step-progress-text">1 / 1</div>
        <div class="step-progress-bar-bg">
          <div class="step-progress-bar-fill" id="step-progress-fill" style="width:0%"></div>
        </div>
      </div>
      <div id="step-viewport">
        <div id="step-track"></div>
      </div>
    </div>

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

  <!-- step mode: nav bar -->
  <div id="step-nav" hidden>
    <button class="step-back-btn" id="step-back-btn" disabled>⟵</button>
    <button class="step-next-btn" id="step-next-btn">다음</button>
  </div>

  <script>
    (function () {
      'use strict';

      var QUESTIONS = ${questionsJson};
      var STEP_MODE = ${stepModeJson};
      var totalCount = QUESTIONS.length;

      var sessionToken = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);

      var hasSubmitted = false;
      var wasConnected = false;
      var ws = null;
      var reconnectDelay = 1000;
      var reconnectTimer = null;

      // step mode state
      var currentStep = 0;
      var stepAnswers = {};

      /* ── helpers ── */
      function show(id) {
        var ids = ['connecting', 'survey-scroll', 'survey-step', 'submitted', 'closed', 'disconnected'];
        for (var i = 0; i < ids.length; i++) {
          var el = document.getElementById(ids[i]);
          if (el) el.hidden = ids[i] !== id;
        }
        var submitBar = document.getElementById('submit-bar');
        var stepNav = document.getElementById('step-nav');
        if (submitBar) submitBar.hidden = !(id === 'survey-scroll');
        if (stepNav)   stepNav.hidden   = !(id === 'survey-step');
      }

      function disableAll() {
        var inputs = document.querySelectorAll(
          '#questions-container input, #questions-container textarea, #questions-container button,' +
          '#step-track input, #step-track textarea, #step-track button'
        );
        for (var i = 0; i < inputs.length; i++) {
          inputs[i].disabled = true;
        }
        var btn = document.getElementById('submit-btn');
        if (btn) btn.disabled = true;
        var nextBtn = document.getElementById('step-next-btn');
        if (nextBtn) nextBtn.disabled = true;
        var backBtn = document.getElementById('step-back-btn');
        if (backBtn) backBtn.disabled = true;
      }

      /* ── render helpers (shared between modes) ── */
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

      /* ── collect answer for a single question from DOM ── */
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

      /* ── step mode ── */
      function renderStepMode() {
        var track = document.getElementById('step-track');
        if (!track) return;
        track.innerHTML = '';

        for (var qi = 0; qi < QUESTIONS.length; qi++) {
          var q = QUESTIONS[qi];
          var slide = document.createElement('div');
          slide.className = 'step-slide';
          slide.setAttribute('data-step', String(qi));

          var card = document.createElement('div');
          card.className = 'question-card';
          card.setAttribute('data-qid', q.id);
          card.style.marginBottom = '0';

          var meta = document.createElement('div');
          meta.className = 'question-meta';

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
            card.appendChild(renderSingleChoice(q, null));
          } else if (q.type === 'multi-choice') {
            card.appendChild(renderMultiChoice(q, null));
          } else if (q.type === 'text') {
            card.appendChild(renderText(q, null));
          } else if (q.type === 'scale') {
            card.appendChild(renderScale(q, null));
          }

          var errMsg = document.createElement('div');
          errMsg.className = 'step-error';
          errMsg.setAttribute('id', 'step-error-' + qi);
          errMsg.textContent = '필수 응답입니다';
          card.appendChild(errMsg);

          slide.appendChild(card);
          track.appendChild(slide);
        }

        updateStepUI();
      }

      function getStepSlide(idx) {
        var track = document.getElementById('step-track');
        if (!track) return null;
        return track.querySelector('[data-step="' + idx + '"]');
      }

      function updateStepUI() {
        var progressText = document.getElementById('step-progress-text');
        var progressFill = document.getElementById('step-progress-fill');
        var backBtn = document.getElementById('step-back-btn');
        var nextBtn = document.getElementById('step-next-btn');
        var track = document.getElementById('step-track');

        if (progressText) {
          progressText.textContent = (currentStep + 1) + ' / ' + totalCount;
        }
        if (progressFill) {
          var pct = totalCount > 1 ? (currentStep / (totalCount - 1)) * 100 : 100;
          progressFill.style.width = pct + '%';
        }
        if (backBtn) {
          backBtn.disabled = currentStep === 0;
        }
        if (nextBtn) {
          if (currentStep === totalCount - 1) {
            nextBtn.textContent = '제출하기';
          } else {
            nextBtn.textContent = '다음';
          }
          nextBtn.disabled = false;
        }
        if (track) {
          track.style.transform = 'translateX(-' + (currentStep * 100) + '%)';
        }
      }

      function saveCurrentStepAnswer() {
        var q = QUESTIONS[currentStep];
        if (!q) return;
        var slide = getStepSlide(currentStep);
        if (!slide) return;
        var value = collectAnswerFromDOM(q, slide);
        stepAnswers[q.id] = value;
      }

      function restoreStepAnswer(stepIdx) {
        var q = QUESTIONS[stepIdx];
        if (!q) return;
        var slide = getStepSlide(stepIdx);
        if (!slide) return;
        var savedValue = stepAnswers[q.id];
        if (savedValue === undefined || savedValue === null) return;

        if (q.type === 'single-choice') {
          var radio = slide.querySelector('input[name="q_' + q.id + '"][value="' + savedValue + '"]');
          if (radio) {
            radio.checked = true;
            var lbl = radio.parentElement;
            if (lbl) lbl.classList.add('selected');
          }
        } else if (q.type === 'multi-choice') {
          if (Array.isArray(savedValue)) {
            for (var vi = 0; vi < savedValue.length; vi++) {
              var chk = slide.querySelector('input[name="q_' + q.id + '"][value="' + savedValue[vi] + '"]');
              if (chk) {
                chk.checked = true;
                var lblc = chk.parentElement;
                if (lblc) lblc.classList.add('selected');
              }
            }
          }
        } else if (q.type === 'text') {
          var ta = slide.querySelector('textarea[data-qid="' + q.id + '"]');
          if (ta) {
            ta.value = String(savedValue);
            var cc = slide.querySelector('.cc');
            if (cc) cc.textContent = String(savedValue.length);
          }
        } else if (q.type === 'scale') {
          var btnRow = slide.querySelector('.scale-buttons[data-qid="' + q.id + '"]');
          if (btnRow) {
            var allBtns = btnRow.querySelectorAll('.scale-btn');
            for (var bi = 0; bi < allBtns.length; bi++) {
              if (Number(allBtns[bi].getAttribute('data-val')) === savedValue) {
                allBtns[bi].classList.add('selected');
              }
            }
          }
        }
      }

      function isStepAnswerValid(stepIdx) {
        var q = QUESTIONS[stepIdx];
        if (!q || !q.required) return true;
        var value = stepAnswers[q.id];
        if (value === null || value === undefined) return false;
        if (Array.isArray(value) && value.length === 0) return false;
        return true;
      }

      function goToStep(nextIdx) {
        saveCurrentStepAnswer();

        if (nextIdx > currentStep) {
          if (!isStepAnswerValid(currentStep)) {
            var errEl = document.getElementById('step-error-' + currentStep);
            if (errEl) errEl.classList.add('visible');
            var slide = getStepSlide(currentStep);
            if (slide) {
              var card = slide.querySelector('.question-card');
              if (card) {
                card.classList.remove('shake');
                void card.offsetWidth;
                card.classList.add('shake');
              }
            }
            return;
          }
        }

        var prevErr = document.getElementById('step-error-' + currentStep);
        if (prevErr) prevErr.classList.remove('visible');

        currentStep = nextIdx;
        restoreStepAnswer(currentStep);
        updateStepUI();
      }

      function collectAllStepAnswers() {
        saveCurrentStepAnswer();
        var answers = [];
        for (var qi = 0; qi < QUESTIONS.length; qi++) {
          var q = QUESTIONS[qi];
          var value = (stepAnswers[q.id] !== undefined) ? stepAnswers[q.id] : null;
          answers.push({ questionId: q.id, value: value });
        }
        return answers;
      }

      function isAllStepAnswersValid() {
        for (var i = 0; i < QUESTIONS.length; i++) {
          var q = QUESTIONS[i];
          if (!q.required) continue;
          var value = stepAnswers[q.id];
          if (value === null || value === undefined) return false;
          if (Array.isArray(value) && value.length === 0) return false;
        }
        return true;
      }

      /* ── step nav button handlers ── */
      var stepBackBtn = document.getElementById('step-back-btn');
      if (stepBackBtn) {
        stepBackBtn.addEventListener('click', function () {
          if (currentStep > 0) {
            saveCurrentStepAnswer();
            var prevErr = document.getElementById('step-error-' + currentStep);
            if (prevErr) prevErr.classList.remove('visible');
            currentStep--;
            restoreStepAnswer(currentStep);
            updateStepUI();
          }
        });
      }

      var stepNextBtn = document.getElementById('step-next-btn');
      if (stepNextBtn) {
        stepNextBtn.addEventListener('click', function () {
          if (hasSubmitted) return;

          if (currentStep < totalCount - 1) {
            goToStep(currentStep + 1);
          } else {
            saveCurrentStepAnswer();
            if (!isAllStepAnswersValid()) {
              for (var i = 0; i < QUESTIONS.length; i++) {
                var q = QUESTIONS[i];
                if (q.required) {
                  var value = stepAnswers[q.id];
                  if (value === null || value === undefined ||
                      (Array.isArray(value) && value.length === 0)) {
                    currentStep = i;
                    restoreStepAnswer(currentStep);
                    updateStepUI();
                    var errEl = document.getElementById('step-error-' + i);
                    if (errEl) errEl.classList.add('visible');
                    var slide = getStepSlide(i);
                    if (slide) {
                      var card = slide.querySelector('.question-card');
                      if (card) {
                        card.classList.remove('shake');
                        void card.offsetWidth;
                        card.classList.add('shake');
                      }
                    }
                    return;
                  }
                }
              }
              return;
            }
            var answers = collectAllStepAnswers();
            disableAll();
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'submit',
                answers: answers,
                sessionToken: sessionToken,
              }));
            }
          }
        });
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

      /* ── WebSocket ── */
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
              if (STEP_MODE) {
                renderStepMode();
                show('survey-step');
              } else {
                renderScrollMode();
                onScrollInputChange();
                show('survey-scroll');
              }
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
