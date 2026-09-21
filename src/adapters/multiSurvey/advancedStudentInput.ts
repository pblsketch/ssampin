/** 실제 학생 페이지와 격리된 체험에서 함께 실행한다. 정답은 받지 않는다. */
export const advancedStudentInputScript = `
function advancedInput(c, interaction) {
 var t=interaction.type,s=interaction.settings,value=null,record={},order=s.items.map(function(i){return i.id;});
 function number(label,min,max,initial,change,step){var l=el('label',label),n=el('input');n.type='number';n.min=String(min);n.max=String(max);n.step=String(step||1);n.value=String(initial);n.setAttribute('aria-label',label);n.oninput=function(){change(n.value===''?NaN:Number(n.value));};l.appendChild(n);c.appendChild(l);return n;}
 if(t==='order'||t==='ranking'){
  if(t==='order')for(var j=order.length-1;j>0;j--){var k=Math.floor(Math.random()*(j+1)),tmp=order[j];order[j]=order[k];order[k]=tmp;}
  var list=el('div');c.appendChild(el('p',t==='order'?'카드를 순서대로 배열하세요.':'중요한 순서대로 배열하세요.','muted'));c.appendChild(list);
  function move(from,to){if(to<0||to>=order.length)return;var id=order.splice(from,1)[0];order.splice(to,0,id);draw();}
  function draw(){list.replaceChildren();order.forEach(function(id,i){var row=el('div',undefined,'sort-row');row.draggable=true;row.ondragstart=function(e){e.dataTransfer.setData('text/plain',String(i));};row.ondragover=function(e){e.preventDefault();};row.ondrop=function(e){e.preventDefault();var from=Number(e.dataTransfer.getData('text/plain'));if(Number.isInteger(from)&&from>=0&&from<order.length)move(from,i);};row.appendChild(el('span',(i+1)+'. '+s.items.find(function(x){return x.id===id;}).text));[['위로',-1],['아래로',1]].forEach(function(a){var b=el('button',a[0]);b.type='button';b.setAttribute('aria-label',s.items.find(function(x){return x.id===id;}).text+' '+a[0]);b.disabled=i+a[1]<0||i+a[1]>=order.length;b.onclick=function(){move(i,i+a[1]);};row.appendChild(b);});list.appendChild(row);});}draw();
 }else if(t==='numeric'){
  var n=number('숫자'+(s.unit?' ('+s.unit+')':''),s.min,s.max,s.min,function(v){value=v;},s.step);value=s.min;
  var range=el('input');range.type='range';range.min=String(s.min);range.max=String(s.max);range.step=String(s.step);range.value=String(s.min);range.setAttribute('aria-label','숫자 슬라이더');range.oninput=function(){value=Number(range.value);n.value=range.value;};c.appendChild(range);
 }else if(t==='pin'){
  var box=el('div',undefined,'pin-image'),img=el('img');img.src=s.imageUrl;img.alt='위치를 표시할 이미지';box.appendChild(img);var marker=el('span','＋','pin-marker');marker.hidden=true;box.appendChild(marker);box.tabIndex=0;box.setAttribute('role','group');box.setAttribute('aria-label','이미지 위치 선택. 화살표로 이동하고 아래 가로·세로 값으로도 조절할 수 있습니다.');c.appendChild(box);
  var x=50,y=50;function update(){value={x:x/100,y:y/100};marker.hidden=false;marker.style.left=x+'%';marker.style.top=y+'%';nx.value=String(x);ny.value=String(y);}
  var nx=number('가로 위치 (%)',0,100,50,function(v){x=v;update();}),ny=number('세로 위치 (%)',0,100,50,function(v){y=v;update();});
  box.onclick=function(e){var r=img.getBoundingClientRect();x=Math.round(Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100)));y=Math.round(Math.max(0,Math.min(100,(e.clientY-r.top)/r.height*100)));update();};box.onkeydown=function(e){var d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(d){e.preventDefault();x=Math.max(0,Math.min(100,x+d[0]));y=Math.max(0,Math.min(100,y+d[1]));update();}};
 }else if(t==='valueline'){
  var single=s.items.length===1;
  var start=Math.min(s.max,s.min+Math.round(((s.max-s.min)/2)/s.step)*s.step);
  s.items.forEach(function(item){
   if(!single||item.text.trim())c.appendChild(el('h2',item.text));
   ['x'].forEach(function(axis){
    var key=item.id+':'+axis;
    var name=axis==='x'?(s.xLabel||''):(s.yLabel||'');
    var lo=(axis==='x'?s.xMinLabel:s.yMinLabel)||String(s.min);
    var hi=(axis==='x'?s.xMaxLabel:s.yMaxLabel)||String(s.max);
    record[key]=start;
    var box=el('div',undefined,'vl-axis');
    if(name)box.appendChild(el('p',name,'muted'));
    var out=el('output',String(start));box.appendChild(out);
    var range=el('input');range.type='range';range.min=String(s.min);range.max=String(s.max);range.step=String(s.step);range.value=String(start);
    range.setAttribute('aria-label',(item.text?item.text+' · ':'')+(name?name+' · ':'')+lo+' 에서 '+hi+' 사이');
    range.oninput=function(){record[key]=Number(range.value);out.textContent=range.value;};
    box.appendChild(range);
    var ends=el('div',undefined,'ends');ends.appendChild(el('span',lo));ends.appendChild(el('span',hi));box.appendChild(ends);
    c.appendChild(box);
   });
  });
 }else if(t==='quadrant'){
  var max=Number.isInteger(s.maxPoints)&&s.maxPoints>0?Math.min(5,s.maxPoints):1,wantText=!!s.collectPointText,pts=[];
  var names=['왼쪽 위','오른쪽 위','왼쪽 아래','오른쪽 아래'],labels=s.quadrantLabels||[];
  c.appendChild(el('p',wantText?('생각을 적고 알맞은 자리를 눌러 주세요.'+(max>1?' 최대 '+max+'개':'')):('알맞은 자리를 눌러 주세요.'+(max>1?' 최대 '+max+'개':'')),'muted'));
  var wrap=el('div',undefined,'qd-wrap');
  if(s.yMaxLabel)wrap.appendChild(el('p',s.yMaxLabel,'qd-end'));
  var board=el('div',undefined,'qd-board');
  board.setAttribute('role','group');
  board.setAttribute('aria-label','두 기준으로 나뉜 네 칸. 누르면 점을 놓습니다. 아래 칸에서 가로·세로 값을 숫자로 고칠 수도 있습니다.');
  [[0,0],[1,0],[0,1],[1,1]].forEach(function(pos,i){var cell=el('span',(labels[i]||'').trim(),'qd-cell');cell.style.left=(pos[0]*50)+'%';cell.style.top=(pos[1]*50)+'%';cell.style.justifyContent=pos[0]?'flex-end':'flex-start';cell.style.alignItems=pos[1]?'flex-end':'flex-start';cell.style.textAlign=pos[0]?'right':'left';cell.title=names[i];board.appendChild(cell);});
  wrap.appendChild(board);
  if(s.yMinLabel)wrap.appendChild(el('p',s.yMinLabel,'qd-end'));
  var ends=el('div',undefined,'ends');ends.appendChild(el('span',s.xMinLabel||''));ends.appendChild(el('span',s.xMaxLabel||''));wrap.appendChild(ends);
  c.appendChild(wrap);
  var rows=el('div');c.appendChild(rows);
  function place(i){var p=pts[i],dot=el('span',String(i+1),'qd-dot');dot.style.left=(p.x*100)+'%';dot.style.top=(p.y*100)+'%';board.appendChild(dot);}
  function paint(){
   Array.prototype.slice.call(board.querySelectorAll('.qd-dot')).forEach(function(n){n.remove();});
   pts.forEach(function(_,i){place(i);});
   rows.replaceChildren();
   pts.forEach(function(p,i){
    var row=el('div',undefined,'qd-row');
    var head=el('div',undefined,'qd-head');
    head.appendChild(el('b',String(i+1)));
    if(wantText){var input=el('input');input.type='text';input.maxLength=100;input.value=p.text||'';input.placeholder='생각을 적어 주세요';input.setAttribute('aria-label',(i+1)+'번 점에 적을 생각');input.oninput=function(){p.text=input.value;};head.appendChild(input);}
    else head.appendChild(el('span',names[(p.y<0.5?0:2)+(p.x<0.5?0:1)],'qd-where'));
    row.appendChild(head);
    var foot=el('div',undefined,'qd-foot');
    if(wantText)foot.appendChild(el('span',names[(p.y<0.5?0:2)+(p.x<0.5?0:1)],'qd-where'));
    [['가로','x'],['세로','y']].forEach(function(axis){
      var lab=el('label',axis[0]);
      var n=el('input');n.type='number';n.min='0';n.max='100';n.value=String(Math.round(p[axis[1]]*100));n.className='qd-num';
      n.setAttribute('aria-label',(i+1)+'번 점 '+axis[0]+' 위치 백분율');
      n.oninput=function(){var v=Number(n.value);if(!Number.isFinite(v))return;p[axis[1]]=Math.max(0,Math.min(100,v))/100;paint();};
      lab.appendChild(n);foot.appendChild(lab);
    });
    var del=el('button','지우기');del.type='button';del.setAttribute('aria-label',(i+1)+'번 점 지우기');del.onclick=function(){pts.splice(i,1);paint();};foot.appendChild(del);
    row.appendChild(foot);
    rows.appendChild(row);
   });
  }
  board.onclick=function(e){
   var r=board.getBoundingClientRect();
   var x=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y=Math.max(0,Math.min(1,(e.clientY-r.top)/r.height));
   if(pts.length<max)pts.push({x:x,y:y,text:''});
   else if(max===1)  {pts[0].x=x;pts[0].y=y;}
   else {status('점을 다 놓았어요. 옮기려면 지우고 다시 놓아 주세요.');return;}
   status('');paint();
  };
 }else if(t==='brainstorm'){
  var inputs=[];for(var i=0;i<s.maxIdeas;i++){var l=el('label','아이디어 '+(i+1)),input=el('textarea');input.maxLength=200;input.setAttribute('aria-label','아이디어 '+(i+1));l.appendChild(input);c.appendChild(l);inputs.push(input);}
 }else{
  var remaining=t==='allocation'?el('output','남은 점수 '+s.total):null;if(remaining)c.appendChild(remaining);
  s.items.forEach(function(item){var axes=t==='matrix'?['x','y']:[''];axes.forEach(function(axis){var key=item.id+(axis?':'+axis:''),min=t==='allocation'?0:s.min,max=t==='allocation'?s.total:s.max;record[key]=min;number(item.text+(axis?' · '+(axis==='x'?s.xLabel:s.yLabel):''),min,max,min,function(v){record[key]=v;if(remaining)remaining.textContent='남은 점수 '+(s.total-Object.values(record).reduce(function(a,b){return a+b;},0));},t==='allocation'?1:s.step);});});
 }
 var read=function(){
  if(t==='order'||t==='ranking')return order;
  if(t==='quadrant'){if(!pts.length){read.hint='판에서 알맞은 자리를 눌러 주세요.';return null;}var out=[];for(var qi=0;qi<pts.length;qi++){var p=pts[qi];if(!(p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1)){read.hint='가로·세로 값은 0에서 100 사이로 적어 주세요.';return null;}if(wantText){var tx=(p.text||'').trim();if(!tx||tx.length>100){read.hint='점마다 생각을 100자 안으로 적어 주세요.';return null;}out.push({x:p.x,y:p.y,text:tx});}else out.push({x:p.x,y:p.y});}return out;}
  if(t==='brainstorm'){var ideas=inputs.map(function(n){return n.value.trim();}).filter(Boolean);return ideas.length?ideas:null;}
  if(t==='numeric')return Number.isFinite(value)&&value>=s.min&&value<=s.max?value:null;
  if(t==='pin')return value&&Number.isFinite(value.x)&&Number.isFinite(value.y)&&value.x>=0&&value.x<=1&&value.y>=0&&value.y<=1?value:null;
  var values=Object.values(record);if(!values.every(function(v){return Number.isFinite(v)&&v>=(t==='allocation'?0:s.min)&&v<=(t==='allocation'?s.total:s.max)&&(t!=='allocation'||Number.isInteger(v));}))return null;
  if(t==='allocation'&&values.reduce(function(a,b){return a+b;},0)!==s.total)return null;return record;
 };
 return read;
}
`;

export const advancedStudentCSS = `.sort-row{display:flex;gap:8px;align-items:center;padding:10px 0;border-bottom:1px solid var(--sps-border)}.sort-row span{flex:1}.pin-image{position:relative;line-height:0}.pin-image img{width:100%;height:auto;display:block}.pin-marker{position:absolute;transform:translate(-50%,-50%);font-size:36px;color:var(--sps-accent);text-shadow:0 0 3px var(--sps-card);pointer-events:none}.choice img{max-width:120px;max-height:90px;object-fit:contain}.vl-axis{margin:8px 0 20px}.vl-axis h2,.vl-axis p{margin:0 0 4px}.qd-wrap{margin:8px 0 16px}.qd-end{text-align:center;font-weight:700;font-size:14px;margin:6px 0}.qd-board{position:relative;aspect-ratio:1/1;border:1px solid var(--sps-border);border-radius:18px;background:var(--sps-card);overflow:hidden;cursor:crosshair;touch-action:manipulation}.qd-board::before,.qd-board::after{content:'';position:absolute;background:var(--sps-border)}.qd-board::before{left:50%;top:0;bottom:0;width:2px}.qd-board::after{top:50%;left:0;right:0;height:2px}.qd-cell{position:absolute;width:50%;height:50%;display:flex;padding:10px;font-size:13px;line-height:1.3;color:var(--sps-muted);pointer-events:none}.qd-dot{position:absolute;transform:translate(-50%,-50%);width:36px;height:36px;border-radius:50%;background:var(--sps-accent);color:#fff;display:grid;place-items:center;font-weight:800;pointer-events:none}.qd-row{margin:10px 0;padding:10px 12px;border:1px solid var(--sps-border);border-radius:14px}.qd-head{display:flex;gap:10px;align-items:center}.qd-head b{display:grid;place-items:center;width:32px;height:32px;flex-shrink:0;border-radius:10px;background:var(--sps-soft);color:var(--sps-accent)}.qd-head input[type=text]{flex:1;min-width:0;width:auto}.qd-foot{display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center;margin-top:8px}.qd-foot label{display:flex;gap:6px;align-items:center;flex:1 1 120px;min-width:0;margin:0;font-size:14px;font-weight:650;white-space:nowrap;color:var(--sps-muted)}.qd-foot input.qd-num{width:100%;min-width:0;padding:8px 10px;text-align:center}.qd-foot button{flex-shrink:0;min-height:40px;padding:8px 12px}.qd-where{font-weight:650}.qd-foot .qd-where{flex-shrink:0;color:var(--sps-accent)}`;
