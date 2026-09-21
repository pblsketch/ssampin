import { advancedStudentCSS, advancedStudentInputScript } from './advancedStudentInput';
import type { ParticipationConfig } from '@domain/entities/multiSurvey/ParticipationProtocol';
import type { LiveHTMLQuestion } from './live/liveBridge';
import { PARTICIPATION_TOOL_NAME } from './participationBranding';

function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** 미리보기와 학생 HTTP 응답이 같은 문서·입력 동작을 사용한다. */
export function generateParticipationStudentPage(
  config: ParticipationConfig,
  previewQuestion?: LiveHTMLQuestion,
): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>${PARTICIPATION_TOOL_NAME}</title>
<style>
:root{color-scheme:light;--sps-bg:#f5f4ef;--sps-card:#fff;--sps-text:#243247;--sps-muted:#596579;--sps-accent:#375bd2;--sps-soft:#e8edff;--sps-border:#d6dce7;--sps-good:#20714d;--sps-warm:#95600d;--sps-no:#b03949}
*{box-sizing:border-box}body{margin:0;background:var(--sps-bg);color:var(--sps-text);font:16px/1.6 system-ui,'Noto Sans KR',sans-serif}body.discussion{--sps-accent:#256d62;--sps-soft:#e0f1eb}main{max-width:620px;margin:auto;padding:24px 20px calc(32px + env(safe-area-inset-bottom))}header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:28px}.brand{font-weight:800}small,.muted{color:var(--sps-muted)}#connection{font-size:12px}h1{font-size:clamp(24px,6vw,34px);line-height:1.45;margin:8px 0 20px;overflow-wrap:anywhere}h2{font-size:20px}.card{padding:24px;background:var(--sps-card);border:1px solid var(--sps-border);border-radius:24px;margin:16px 0;overflow-wrap:anywhere}button,input,textarea{font:inherit}button{min-height:48px;border-radius:14px;cursor:pointer;padding:12px 16px;border:1px solid var(--sps-border);background:var(--sps-card);color:var(--sps-text)}button:disabled{opacity:.55;cursor:default}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid var(--sps-accent);outline-offset:3px}.primary{background:var(--sps-accent);color:white;border:0;width:100%;font-weight:750}.options{display:grid;gap:12px}.choice{text-align:left;display:flex;align-items:center;gap:14px;width:100%;min-height:64px}.choice b{display:grid;place-items:center;width:32px;height:32px;flex-shrink:0;border-radius:10px;background:var(--sps-soft);color:var(--sps-accent)}.choice[aria-pressed=true]{background:var(--sps-soft);border:2px solid var(--sps-accent)}input:not([type=range]),textarea{width:100%;padding:14px;border:1px solid var(--sps-border);border-radius:12px;background:var(--sps-card);color:var(--sps-text)}textarea{min-height:120px;resize:vertical}label{display:block;font-weight:650;margin:16px 0 8px}input[type=range]{width:100%;min-height:48px;accent-color:var(--sps-accent)}.ends{display:flex;justify-content:space-between;gap:16px;font-size:14px}output{display:block;text-align:center;font-size:36px;font-weight:800;color:var(--sps-accent)}.pill{display:inline-block;background:var(--sps-soft);color:var(--sps-accent);padding:4px 12px;border-radius:30px;font-size:13px;font-weight:700}.score{display:flex;flex-wrap:wrap;gap:8px 24px;margin:16px 0}.score strong{font-size:24px;color:var(--sps-accent)}progress{width:100%;height:8px;accent-color:var(--sps-accent)}.success{color:var(--sps-good);font-weight:750}#notice{min-height:24px;color:var(--sps-no)}.bar{height:10px;background:var(--sps-soft);border-radius:9px;margin:4px 0 16px}.bar span{display:block;height:100%;background:var(--sps-accent);border-radius:9px}.signal-0 b{color:var(--sps-good)}.signal-1 b{color:var(--sps-warm)}.signal-2 b{color:var(--sps-no)}[hidden]{display:none!important}.card{animation:appear .2s ease-out}@keyframes appear{from{opacity:.5;transform:translateY(5px)}to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
body.scored{--sps-accent:#375bd2;--sps-soft:#e8edff}body.opinion{--sps-accent:#1f6f63;--sps-soft:#dff0ea}.steps{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 18px}.steps i{display:block;width:9px;height:9px;border-radius:50%;background:var(--sps-border)}.steps i.done{background:var(--sps-accent)}.steps i.now{background:var(--sps-accent);box-shadow:0 0 0 4px var(--sps-soft)}.kind{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:750;color:var(--sps-accent)}.sent{border:2px solid var(--sps-good);text-align:center}.sent h2{color:var(--sps-good);margin:0 0 6px}.tick{display:grid;place-items:center;width:64px;height:64px;margin:0 auto 14px;border-radius:50%;background:var(--sps-good);color:#fff;font-size:34px;line-height:1}.vote{display:flex;align-items:center;gap:14px;width:100%;min-height:68px;margin:10px 0;text-align:left}.vote b{display:grid;place-items:center;min-width:48px;height:48px;flex-shrink:0;border-radius:16px;background:var(--sps-soft);color:var(--sps-accent);font-size:19px;font-weight:800}.vote[aria-pressed=true]{border:2px solid var(--sps-accent);background:var(--sps-soft)}.vote span{flex:1}.tally{display:flex;justify-content:space-between;gap:12px;font-weight:700;margin:14px 0 2px}.mine{border:2px solid var(--sps-accent)}.howto{margin:0 0 14px;color:var(--sps-muted);font-size:14px;font-weight:650}.mine-answer{border:2px solid var(--sps-good)}.done-line{display:flex;align-items:center;gap:10px;margin:0 0 12px}.done-line b{font-size:20px;color:var(--sps-good)}.tick-sm{display:grid;place-items:center;width:28px;height:28px;flex-shrink:0;border-radius:50%;background:var(--sps-good);color:#fff;font-size:16px;line-height:1}.label-sm{margin:12px 0 2px;font-size:13px;font-weight:700;color:var(--sps-muted)}.answer-body{margin:0 0 6px;font-size:18px;font-weight:700}input[type=range].untouched{accent-color:var(--sps-border)}${advancedStudentCSS}</style></head><body><main><header><span class="brand">${PARTICIPATION_TOOL_NAME}</span><span id="connection" role="status">연결 중…</span></header><div id="app"></div><p id="notice" role="alert"></p></main><script>
(function(){'use strict';
var config=${scriptJson(config)},preview=${scriptJson(previewQuestion ?? null)},ws=null,state=null,viewKey='',pending=false,retryTimer=null;
var app=document.getElementById('app'),notice=document.getElementById('notice'),connection=document.getElementById('connection');
document.body.className=config.purpose;
var storageKey='participation:'+config.roomId,sid='',nickname='',joined=false;
try{var saved=JSON.parse(sessionStorage.getItem(storageKey)||'{}');sid=saved.sid||'';nickname=saved.nickname||'';}catch(e){}
function el(tag,text,cls){var n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function send(data){if(preview){if(data.type==='vote'){state.myVotes=data.selected===false?[]:[data.target];state.voteCandidates=state.voteCandidates.map(function(c){return {...c,count:c.id===data.target&&data.selected!==false?1:0};});render();}return true;}if(!ws||ws.readyState!==1){notice.textContent='연결을 확인하고 다시 제출해 주세요.';return false;}ws.send(JSON.stringify(data));return true;}
function card(){var n=el('section',undefined,'card');app.appendChild(n);return n;}
function status(text){notice.textContent=text;}
function personal(parent,result,final){if(!result||!result.completedCount)return;var panel=el('div',undefined,'score');panel.appendChild(el('span',result.completedCount+'문항 중 '+result.correctCount+'문항 정답'));panel.appendChild(el('strong',result.score+'점'));if(config.competitionMode&&result.rank){var change=result.rankChange||0;panel.appendChild(el('span','현재 '+result.rank+'위'+(change>0?' ↑'+change:change<0?' ↓'+Math.abs(change):'')));}parent.appendChild(panel);if(!final&&typeof result.isCorrect==='boolean'){parent.appendChild(el('p',result.isCorrect?'정답이에요!':'정답을 함께 살펴봐요.',result.isCorrect?'success':'muted'));if(result.answer)parent.appendChild(el('p','정답: '+result.answer));if(result.explanation)parent.appendChild(el('p',result.explanation));}}
function join(){joined=false;viewKey='';app.replaceChildren();app.appendChild(el('span','함께하는 활동','pill'));app.appendChild(el('h1',config.title));var c=card();c.appendChild(el('p','선생님이 연 활동이에요. 별명을 적고 들어오세요.'));var label=el('label','활동에 사용할 별명');label.htmlFor='nickname';c.appendChild(label);var input=el('input');input.id='nickname';input.maxLength=20;input.value=nickname;input.autocomplete='off';c.appendChild(input);
// 실제 설정을 그대로 적는다. 익명이 아니므로 '익명'이라고 쓰지 않는다.
c.appendChild(el('p','별명은 선생님 화면에 보여요. 교실 화면과 다른 친구 화면에는 나오지 않아요.','howto'));
var b=el('button','참여하기','primary');c.appendChild(b);
input.onkeydown=function(e){if(e.key==='Enter')b.click();};
b.onclick=function(){nickname=input.value.trim();if(!nickname){status('별명을 입력해 주세요.');input.focus();return;}status('');send({type:'join',nickname:nickname,sessionId:sid||undefined});};}
function draftKey(){return 'participation-draft:'+config.roomId+':'+(state&&state.question?state.question.id:'')+':'+(state?state.attempt:1);}
function saveDraft(value){try{if(value===null)sessionStorage.removeItem(draftKey());else sessionStorage.setItem(draftKey(),JSON.stringify(value));}catch(e){}}
function readDraft(){try{var raw=sessionStorage.getItem(draftKey());return raw?JSON.parse(raw):null;}catch(e){return null;}}
/** 응답 방식 안내 — "무엇을 어떻게 내면 되는지"를 문항마다 한 줄로 적는다. */
function howToAnswer(q){
 var parts=[];
 if(q.interaction){var t=q.interaction.type;
  parts.push(t==='order'?'순서대로 배열':t==='ranking'?'중요한 순서대로 배열':t==='allocation'?'점수를 나눠 배분':t==='numeric'?'숫자 입력':t==='pin'?'이미지에서 위치 고르기':t==='valueline'?'막대를 움직여 자리 고르기':t==='quadrant'?'판에서 자리 고르기':t==='brainstorm'?'생각을 적기':'답하기');}
 else if(q.type==='single-choice')parts.push(q.presentation==='trafficlight'?'하나 선택':'하나 선택');
 else if(q.type==='multi-choice')parts.push('여러 개 선택');
 else if(q.type==='scale')parts.push('막대를 움직여 자리 고르기');
 else parts.push('글로 답하기');
 if(q.collectReason)parts.push('이유도 작성');
 return parts.join(' · ');
}
function answerText(q,a){
 if(!a)return '';
 if(a.optionIds&&a.optionIds.length){var names=a.optionIds.map(function(id){var o=(q.options||[]).find(function(x){return x.id===id;});return o?o.text:id;});return names.join(', ');}
 if(typeof a.scale==='number')return String(a.scale);
 if(typeof a.text==='string'){if(q.interaction){try{JSON.parse(a.text);return '내가 표시한 대로 냈어요';}catch(e){return a.text;}}return a.text;}
 return '';
}
/** 제출·마감 뒤에 내 답과 다음 안내를 보여 준다. 큰 체크 하나로 화면을 덮지 않는다. */
function myAnswerCard(q,a,heading,next){
 var c=card();c.className='card mine-answer';
 var head=el('p',undefined,'done-line');head.appendChild(el('span','✓','tick-sm'));head.appendChild(el('b',heading));c.appendChild(head);
 var text=answerText(q,a);
 if(text){c.appendChild(el('p','내 답','label-sm'));c.appendChild(el('p',text,'answer-body'));}
 if(a&&a.reason){c.appendChild(el('p','내가 쓴 이유','label-sm'));c.appendChild(el('p',a.reason,'answer-body'));}
 c.appendChild(el('p',next,'muted'));
 return c;
}
function render(){if(!state)return;var key=state.phase+':'+state.questionIndex+':'+state.attempt+':'+!!state.myAnswer;
if(state.phase==='open'&&key===viewKey){return;}viewKey=key;pending=false;app.replaceChildren();status('');
app.appendChild(el('span',config.competitionMode?'함께하는 도전':'함께하는 활동','pill'));
if(state.phase==='lobby'){app.appendChild(el('h1',config.title));var c=card();c.appendChild(el('h2',nickname+'님, 준비됐어요!'));c.appendChild(el('p','선생님이 시작하면 첫 문항이 나타나요.','muted'));c.appendChild(el('p','현재 '+state.totalConnected+'명 참여 중'));return;}
if(state.phase==='ended'){app.appendChild(el('h1','함께해서 즐거웠어요!'));var c=card();personal(c,state.personal,true);if(config.purpose==='discussion')c.appendChild(el('p','오늘 나눈 생각과 근거를 돌아보세요.'));(state.personal&&state.personal.review||[]).forEach(function(r,i){var item=el('details');item.appendChild(el('summary',(i+1)+'. '+r.question+' · '+(r.isCorrect?'정답':'다시 살펴보기')));if(r.mine)item.appendChild(el('p','내 답: '+r.mine));if(r.myReason)item.appendChild(el('p','내가 쓴 이유: '+r.myReason));if(r.myFirst)item.appendChild(el('p','처음 생각: '+r.myFirst));if(r.answer)item.appendChild(el('p','정답: '+r.answer));if(r.explanation)item.appendChild(el('p',r.explanation));c.appendChild(item);});return;}
var q=state.question;if(!q)return;
document.body.className=config.purpose+' '+(q.scored?'scored':'opinion');
var head=el('div');head.style.display='flex';head.style.justifyContent='space-between';head.style.alignItems='center';head.style.gap='12px';
head.appendChild(el('span',(state.questionIndex+1)+' / '+state.totalQuestions+'문항'+(state.attempt>1?' · 다시 생각하기 '+state.attempt+'회':''),'muted'));
head.appendChild(el('span',q.scored?'◆ 정답이 있는 문항':'◇ 생각을 모으는 문항','kind'));
app.appendChild(head);
if(state.totalQuestions>1){var steps=el('div',undefined,'steps');steps.setAttribute('role','img');steps.setAttribute('aria-label',state.totalQuestions+'문항 중 '+(state.questionIndex+1)+'번째');
for(var si=0;si<state.totalQuestions;si++){steps.appendChild(el('i',undefined,si<state.questionIndex?'done':si===state.questionIndex?'now':''));}
app.appendChild(steps);}
app.appendChild(el('h1',q.question));
if(state.phase==='closed'){
 saveDraft(null);
 app.appendChild(el('p','응답을 마감했어요. 더 낼 수 없어요.','howto'));
 if(state.myAnswer)app.appendChild(myAnswerCard(q,state.myAnswer,'냈어요',state.attempt>1?'선생님이 결과를 공개하면 처음 생각과 견줘 볼 수 있어요.':'선생님이 결과를 공개하면 함께 살펴봐요.'));
 else{var c=card();c.appendChild(el('h2','이번 문항은 내지 못했어요'));c.appendChild(el('p','다음 문항에서 다시 참여할 수 있어요.','muted'));}
 return;}
if(state.phase==='revealed'){
 var agg=state.aggregated||{};
 // 정답이 있는 문항은 정답을 공개했을 때만 개인 결과가 내려온다(정오·점수가 정답을 알려 주기 때문).
 if(q.scored&&state.personal&&state.personal.completedCount){var pc=card();personal(pc,state.personal,false);}
 var hasAgg=!!(agg.counts||agg.distribution||(agg.answers&&agg.answers.length)||state.voteCandidates);
 if(hasAgg){var c=card();c.appendChild(el('h2',q.scored?'우리 반의 응답':'우리의 생각'));
 if(agg.counts){(q.options||[]).forEach(function(o){c.appendChild(el('p',o.text+' · '+(agg.counts[o.id]||0)+'명'));var bar=el('div',undefined,'bar'),fill=el('span');fill.style.width=(agg.total?100*(agg.counts[o.id]||0)/agg.total:0)+'%';bar.appendChild(fill);c.appendChild(bar);});}else if(agg.distribution){Object.keys(agg.distribution).forEach(function(k){c.appendChild(el('p',k+' · '+agg.distribution[k]+'명'));});}else(agg.answers||[]).forEach(function(a){c.appendChild(el('p',a));});
 if(state.voteCandidates){c.appendChild(el('p','마음에 드는 생각에 공감을 눌러 주세요.','muted'));state.voteCandidates.forEach(function(idea){var chosen=(state.myVotes||[]).indexOf(idea.id)>=0;var vote=el('button',undefined,'vote');vote.type='button';vote.appendChild(el('b',String(idea.count)));vote.appendChild(el('span',idea.text));vote.setAttribute('aria-pressed',String(chosen));vote.setAttribute('aria-label',idea.text+' · 공감 '+idea.count+(chosen?' · 공감함':''));vote.onclick=function(){send({type:'vote',roomId:config.roomId,questionIndex:state.questionIndex,attempt:state.attempt,target:idea.id,selected:!chosen});};c.appendChild(vote);});}}
 if(state.myAnswer)app.appendChild(myAnswerCard(q,state.myAnswer,'내가 낸 답',state.attempt>1?'처음 생각과 견줘 보세요.':'다른 의견의 근거도 함께 살펴보세요.'));
 if(!hasAgg&&!state.myAnswer&&!(q.scored&&state.personal&&state.personal.completedCount)){var wait=card();wait.appendChild(el('p','결과를 준비하고 있어요.'));}
 return;}
if(state.phase==='open')personal(app,state.personal,true);
if(state.myAnswer){saveDraft(null);app.appendChild(myAnswerCard(q,state.myAnswer,'냈어요','선생님이 결과를 공개할 때까지 기다려 주세요.'));return;}
app.appendChild(el('p',howToAnswer(q),'howto'));
var c=card(),selected=[],value='',scale=null,readAdvanced=null,draft=readDraft();
if(q.interaction){readAdvanced=advancedInput(c,q.interaction);}
else
if(q.type==='single-choice'||q.type==='multi-choice'){var group=el('div',undefined,'options');c.appendChild(group);
if(draft&&draft.optionIds)selected=(q.options||[]).filter(function(o){return draft.optionIds.indexOf(o.id)>=0;}).map(function(o){return o.id;});
(q.options||[]).forEach(function(o,i){var b=el('button',undefined,'choice'+(q.presentation==='trafficlight'?' signal-'+i:''));b.type='button';b.setAttribute('aria-pressed',String(selected.indexOf(o.id)>=0));b.appendChild(el('b',q.presentation==='trafficlight'?['●','●','●'][i]:String.fromCharCode(65+i)));b.appendChild(el('span',o.text));if(o.imageUrl){var image=el('img');image.src=o.imageUrl;image.alt=o.text;b.appendChild(image);}b.onclick=function(){if(q.type==='single-choice')selected=[o.id];else if(selected.indexOf(o.id)>=0)selected=selected.filter(function(id){return id!==o.id;});else selected.push(o.id);Array.from(group.children).forEach(function(child,j){child.setAttribute('aria-pressed',String(selected.indexOf(q.options[j].id)>=0));});keepDraft();};group.appendChild(b);});}
else if(q.type==='scale'){
 // 손대기 전에는 고르지 않은 상태로 둔다 — 가만히 있어도 최솟값이 제출되던 것을 막는다.
 var lo=q.scaleMin||1,hi=q.scaleMax||5,mid=Math.round((lo+hi)/2);
 if(draft&&typeof draft.scale==='number')scale=draft.scale;
 var out=el('output',scale===null?'아직 고르지 않았어요':String(scale));c.appendChild(out);
 var range=el('input');range.type='range';range.min=String(lo);range.max=String(hi);range.value=String(scale===null?mid:scale);if(scale===null)range.classList.add('untouched');range.setAttribute('aria-label','내 입장');
 range.oninput=function(){scale=Number(range.value);out.textContent=String(scale);range.classList.remove('untouched');keepDraft();};
 c.appendChild(range);var ends=el('div',undefined,'ends');ends.appendChild(el('span',q.scaleMinLabel||String(lo)));ends.appendChild(el('span',q.scaleMaxLabel||String(hi)));c.appendChild(ends);}
else{var input=el('textarea');input.maxLength=q.maxLength||500;input.setAttribute('aria-label','내 답변');input.placeholder=config.purpose==='quiz'?'답을 입력하세요.':'내 생각을 적어 주세요.';if(draft&&typeof draft.text==='string'){input.value=draft.text;value=draft.text;}input.oninput=function(){value=input.value;keepDraft();};c.appendChild(input);}
var reason=null;if(q.collectReason){var label=el('label','그렇게 생각한 이유');label.htmlFor='reason';c.appendChild(label);reason=el('textarea');reason.id='reason';reason.maxLength=500;reason.placeholder='주장에 대한 근거나 예를 적어 주세요.';if(draft&&draft.reason)reason.value=draft.reason;c.appendChild(reason);reason.oninput=keepDraft;}
function keepDraft(){if(preview)return;var d={};if(selected.length)d.optionIds=selected;if(scale!==null&&scale!==undefined)d.scale=scale;if(value)d.text=value;if(reason&&reason.value)d.reason=reason.value;saveDraft(Object.keys(d).length?d:null);}
if(draft&&!preview)status('쓰던 내용을 되살렸어요. 이어서 작성하세요.');
var submit=el('button','응답 보내기','primary');c.appendChild(submit);submit.onclick=function(){if(pending)return;var answer={};if(readAdvanced){var advanced=readAdvanced();if(advanced===null){status(readAdvanced.hint||'입력 범위와 남은 점수를 확인해 주세요.');return;}answer.text=JSON.stringify(advanced);}else if(q.type==='single-choice'||q.type==='multi-choice'){if(!selected.length){status(q.type==='multi-choice'?'해당하는 보기를 하나 이상 골라 주세요.':'보기를 선택해 주세요.');return;}answer.optionIds=selected;}else if(q.type==='scale'){if(scale===null){status('막대를 움직여 내 자리를 골라 주세요.');return;}answer.scale=scale;}else{if(!value.trim()){status('답변을 입력해 주세요.');return;}answer.text=value;}if(reason){if(!reason.value.trim()){status('그렇게 생각한 이유를 적어 주세요.');return;}answer.reason=reason.value.trim();}if(preview){window.parent.postMessage({type:"participation-preview-answer",answer:answer},"*");state.myAnswer=answer;render();var again=el('button','다시 체험하기','primary');app.appendChild(again);again.onclick=function(){state.phase='open';state.myAnswer=null;viewKey='';render();};if(q.allowVoting){var show=el('button','예시 결과 공개 · 공감 체험','primary');app.appendChild(show);show.onclick=function(){var ideas=q.interaction?JSON.parse(answer.text):[answer.text];state.voteCandidates=ideas.map(function(text,i){return {id:'idea-'+i,text:text,count:0};});state.myVotes=[];state.aggregated={answers:[]};state.phase='revealed';render();};}return;}if(send({type:'answer',sessionId:sid,roomId:config.roomId,questionId:q.id,questionIndex:state.questionIndex,attempt:state.attempt,answer:answer})){pending=true;submit.disabled=true;submit.textContent='보내는 중…';clearTimeout(retryTimer);retryTimer=setTimeout(function(){pending=false;submit.disabled=false;submit.textContent='응답 다시 보내기';status('제출 확인이 늦어지고 있어요. 연결 후 다시 시도해 주세요.');},5000);}};
}
${advancedStudentInputScript}
function connect(){connection.textContent='연결 중…';ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host);ws.onopen=function(){connection.textContent='연결됨';if(nickname)send({type:'join',nickname:nickname,sessionId:sid||undefined});else join();};ws.onmessage=function(event){var msg;try{msg=JSON.parse(event.data);}catch(e){return;}if(msg.type==='joined'){sid=msg.sessionId;nickname=msg.nickname;joined=true;try{sessionStorage.setItem(storageKey,JSON.stringify({sid:sid,nickname:nickname}));}catch(e){}if(state){viewKey='';render();}return;}if(msg.type==='state'){state=msg;
// 아직 별명을 적지 않은 학생의 입장 화면을 다른 학생의 입장 때문에 지우지 않는다.
// (옛 구조에서는 먼저 들어온 친구 때문에 이름 칸이 통째로 사라져 영영 못 들어갔다.)
if(!joined)return;render();}if(msg.type==='ack'){clearTimeout(retryTimer);pending=false;saveDraft(null);}if(msg.type==='error')status(msg.message||'응답을 확인하지 못했어요.');if(msg.type==='closed'){connection.textContent='활동 종료';if(!state||state.phase!=='ended'){app.replaceChildren(el('h1','활동이 종료됐어요.'));}}};ws.onclose=function(){if(state&&state.phase==='ended'){connection.textContent='활동 종료';return;}connection.textContent='재연결 중…';pending=false;status('연결이 끊겼어요. 다시 잇는 중이에요 — 쓰던 내용은 그대로 있어요.');setTimeout(connect,2000);};ws.onerror=function(){connection.textContent='연결 확인 중…';};}
if(preview){connection.textContent='학생 화면 미리보기';nickname='나';state={phase:'open',questionIndex:0,totalQuestions:1,attempt:1,question:preview,totalConnected:1};render();}else connect();
})();</script></body></html>`;
}
