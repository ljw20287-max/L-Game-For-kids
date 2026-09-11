(function(){
const root=document.getElementById('gamePane');
if(!root||!window.THREE||!window.L3||!window.RIG||!window.SCENES)return;
const $=sel=>document.querySelector(sel);
const stage=$('#gameStage'),title=$('#gameTitle'),hint=$('#gameHint'),stars=$('#gameStars');
const cars=$('#gameCars'),intro=$('#gameIntro');
const STORAGE='how-things-work-game-v1';
const ORDER=['mixer','pumptruck','roller'];
const PART_IDS={
  mixer:['drum','cab','hopper','chute'],
  pumptruck:['legs','arm','hopper','pump','pipe'],
  roller:['drum','vib','water','engine','wheels']
};
const DATA={
  mixer:{id:'mixer',name:'搅拌车',goal:'把混凝土送到工地',unlock:null,next:'pumptruck'},
  pumptruck:{id:'pumptruck',name:'水泥泵车',goal:'和搅拌车一起浇楼板',unlock:'mixer',next:'roller'},
  roller:{id:'roller',name:'压路车',goal:'把坑填平，压出新公路',unlock:'pumptruck',next:null}
};
const MISSION={
  mixer:[
    {label:'启动',say:'按一下启动按钮。',part:'start'},
    {label:'转筒',say:'发动机转起来，筒子跟着慢慢转。',part:'engine'},
    {label:'到工地',say:'到工地啦，放下卸料槽。',part:'chute'},
    {label:'卸料',say:'筒子倒着转，混凝土顺着槽滑下去！',part:'chute'}
  ],
  pumptruck:[
    {label:'两车进场',say:'开到工地，停稳。',part:'cab'},
    {label:'撑支腿',say:'先把四条支腿撑到最开。',part:'legs'},
    {label:'倒料斗',say:'搅拌车把混凝土倒进料斗。',part:'hopper'},
    {label:'展长臂',say:'折叠臂一节一节展开，伸到楼那边去。',part:'arm'},
    {label:'泵上楼',say:'两根活塞你推我拉，混凝土顺着管子上去了！',part:'pump'}
  ],
  roller:[
    {label:'两车进场',say:'开到工地，停稳。',part:'cab'},
    {label:'填满坑',say:'搅拌车把混凝土倒进料斗。',part:'hopper'},
    {label:'压路车来',say:'发动机转起来了。',part:'engine'},
    {label:'震动压平',say:'滚筒里的偏心块高速转，整个筒都在抖。',part:'vib'},
    {label:'新路完成',say:'又压又震，石子被挤得紧紧的，路就平了。',part:'drum'}
  ]
};
const COLORS=['#2F8FD6','#4CC38A','#FFB020','#E0563A','#8E5AC8'];
let state=loadState(),current='mixer',phase='find',found=new Set(),mission=null,toastTimer=null,activeView=null;
let previewRenderer=null,previewCanvas=null;

function blank(){return {mixer:{find:false,assemble:false,mission:false},pumptruck:{find:false,assemble:false,mission:false},roller:{find:false,assemble:false,mission:false}};}
function loadState(){try{return Object.assign(blank(),JSON.parse(localStorage.getItem(STORAGE)||'{}'));}catch(e){return blank();}}
function save(){localStorage.setItem(STORAGE,JSON.stringify(state));}
function unlocked(id){const need=DATA[id].unlock;return !need||state[need].mission;}
function phaseOpen(name){const p=state[current];return name==='find'||(name==='assemble'&&p.find)||(name==='mission'&&p.find&&p.assemble);}
function resetSceneState(id){
  const st={mixer:window.__MX,pumptruck:window.__PT,roller:window.__RL}[id];
  if(!st)return;
  for(const k in st){
    if(typeof st[k]==='number')st[k]=0;
    else if(typeof st[k]==='boolean')st[k]=false;
  }
  st.seq=null;st.seqI=0;st.seqT=0;st.reps=0;st.from=null;st.to=null;
}
function sfxStub(){return {ac(){},click(){},pop(){},horn(){},ding(){},pour(){},scoop(){},door(){},slide(){},noise(){},loop(){},stopLoop(){},pauseLoop(){}};}
function makeApi(){
  const api={S:{drive:false,xray:false,explode:false,ex:0,xr:0,sel:null,nightT:0,night:0,gloom:0},
    now:()=>performance.now(),sfx:sfxStub(),say,caption(){},toggleNight(){},hop(){},select(){},focusPart(){},setExplode(){},
    camera:null,get ee(){return api._ee||0},set ee(v){api._ee=v||0}};
  return api;
}

const META={};
function metaFor(id){
  if(META[id])return META[id];
  const SC=window.SCENES[id],scene=new THREE.Scene(),r=new THREE.Group();scene.add(r);
  const ctx=L3.makeCtx(scene,r),api=makeApi();
  resetSceneState(id);
  const obj=SC.build(ctx,api);
  const parts={};
  for(const pid of PART_IDS[id]){
    const p=ctx.PARTS[pid];
    if(p)parts[pid]={id:pid,name:p.name,text:p.text,more:p.more};
  }
  META[id]={parts,chain:obj.chain||[]};
  return META[id];
}
function partsFor(id){const m=metaFor(id);return PART_IDS[id].map(pid=>m.parts[pid]).filter(Boolean);}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function nextPart(partList,doneSet){return partList.find(p=>!doneSet.has(p.id))||null;}
function setGuide(text){
  const el=stage.querySelector('.game-note');
  if(el)el.innerHTML=text;
}
function partSpeech(p){return p.name+'。'+p.text;}
function missionStepsFor(id){
  if(id!=='mixer')return MISSION[id];
  return (metaFor(id).chain||[]).map((s,i)=>({
    label:s.label||({start:'启动',engine:'转筒',drum:'搅拌筒',blade:'螺旋叶片',chute:'卸料槽'}[s.part])||`第${i+1}步`,
    say:s.t,
    part:s.part,
    originalIndex:i
  }));
}
function missionGuide(steps,next){
  const s=steps[next];
  return s?`请按第 ${next+1} 步：<b>${esc(s.label)}</b>。`:'任务完成啦，可以换下一辆车。';
}

function saySys(text){
  if(!('speechSynthesis' in window))return Promise.resolve();
  return new Promise(res=>{
    try{
      speechSynthesis.cancel();
      const u=new SpeechSynthesisUtterance(text);u.lang='zh-CN';u.rate=.95;u.pitch=1.0;
      u.onend=res;u.onerror=res;speechSynthesis.speak(u);
      setTimeout(res,Math.max(9000,text.length*420));
    }catch(e){res();}
  });
}
const clip=new Audio();let clipDone=null;
function stopVoice(){if(clipDone){const f=clipDone;clipDone=null;try{clip.pause();}catch(e){}f();}if('speechSynthesis' in window)try{speechSynthesis.cancel();}catch(e){}}
function playClip(url,text){
  stopVoice();
  return new Promise(res=>{
    let done=false,timer;
    const fin=()=>{if(done)return;done=true;clearTimeout(timer);if(clipDone===fin)clipDone=null;res();};
    clipDone=fin;clip.onended=fin;clip.onerror=()=>saySys(text).then(fin);
    clip.src=url;clip.play().catch(()=>saySys(text).then(fin));
    timer=setTimeout(fin,30000);
  });
}
function say(text){
  const id=(window.VOICE_LINES||{})[text],mode=localStorage.getItem('voice')||'yunxia';
  if(id&&mode!=='sys')return playClip(`voice/${mode}/${id}.mp3`,text);
  return saySys(text);
}
function speakKnown(text){
  if((window.VOICE_LINES||{})[text])return say(text);
  return Promise.resolve();
}
function toast(text){
  let t=document.querySelector('.game-toast');
  if(!t){t=document.createElement('div');t.className='game-toast';document.body.appendChild(t);}
  t.textContent=text;t.classList.add('show');clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove('show'),1800);
}

function selectTab(name){
  document.querySelectorAll('[data-home-tab]').forEach(btn=>{
    const on=btn.dataset.homeTab===name;btn.classList.toggle('active',on);btn.setAttribute('aria-selected',on?'true':'false');
  });
  document.getElementById('learnPane').hidden=name!=='learn';
  root.hidden=name!=='game';
  if(name==='game'){location.hash='game';render();}
  else if(location.hash==='#game')history.replaceState(null,'',location.pathname+location.search);
}
document.querySelectorAll('[data-home-tab]').forEach(btn=>btn.addEventListener('click',()=>selectTab(btn.dataset.homeTab)));

$('#resetGame').addEventListener('click',()=>{
  state=blank();save();current='mixer';phase='find';found=new Set();toast('已经重来啦');render();
});
document.querySelectorAll('[data-game-phase]').forEach(btn=>btn.addEventListener('click',()=>{
  const next=btn.dataset.gamePhase;
  if(!phaseOpen(next)){toast('先完成前一步');return;}
  phase=next;render();
}));

function disposeActive(){if(activeView){activeView.dispose();activeView=null;}mission=null;}
function render(){
  if(root.hidden)return;
  if(!unlocked(current))current='mixer';
  if(!phaseOpen(phase))phase=state[current].find?'assemble':'find';
  disposeActive();renderCars();renderHeader();renderPhases();
  if(phase==='find')renderFind();
  else if(phase==='assemble')renderAssemble();
  else renderMission();
}
function renderCars(){
  cars.innerHTML='';
  ORDER.forEach(id=>{
    const v=DATA[id],lock=!unlocked(id),done=state[id].mission;
    const b=document.createElement('button');
    b.className=`game-car ${id===current?'sel':''} ${lock?'locked':''}`;
    b.type='button';
    b.innerHTML=`<canvas class="game-preview" data-preview="${id}" aria-hidden="true"></canvas><div><b>${v.name}</b><small>${done?'已通关':lock?'未解锁':v.goal}</small></div>${lock?'<span class="lock-badge">锁</span>':''}`;
    b.onclick=()=>{if(lock){toast(id==='pumptruck'?'先通关搅拌车':'先通关前两辆车');return;}current=id;phase='find';found=new Set();render();};
    cars.appendChild(b);
    renderPreview(b.querySelector('canvas'),id);
  });
}
function renderHeader(){
  const v=DATA[current],p=state[current];
  title.textContent=v.name;
  stars.textContent=`${ORDER.filter(id=>state[id].mission).length} / 3 通关`;
  intro.textContent=state.roller.mission?'三辆车都通关了，可以反复玩。':'先听零件，再拼回去，最后让车干活。';
  if(phase==='find')hint.textContent=p.find?'零件已经听完，可以去拼装。':'跟着提示，一个一个听零件。';
  if(phase==='assemble')hint.textContent=p.assemble?'已经拼好，可以启动任务。':'按提示把当前零件拖回去。';
  if(phase==='mission')hint.textContent=p.mission?'这一关通关了，可以再玩一次。':'按正确顺序让机器工作。';
}
function renderPhases(){
  document.querySelectorAll('[data-game-phase]').forEach(btn=>{
    const ph=btn.dataset.gamePhase;
    btn.disabled=!phaseOpen(ph);
    btn.classList.toggle('active',ph===phase);
  });
}
function mapShell(extra=''){return `<div class="machine-map model-map ${extra}"><div class="model-mount"></div></div>`;}
function attachPartPositions(view,items){
  view.onFrame=()=>{
    const parent=items[0]?.el?.parentElement,r=parent?.getBoundingClientRect();
    if(!r||r.width<20||r.height<20)return;
    const points=items.map((it,i)=>({i,it,anchor:view.partScreen(it.id)})).filter(x=>x.anchor);
    const callouts=points.map(({i,it,anchor})=>({i,it,anchor,p:calloutPoint(anchor,i,points.length,it.kind)}));
    const placed=callouts.every(({it})=>it.kind==='target')?callouts.map(({it,p,anchor})=>({it,p:anchor,anchor})):spreadPoints(callouts,r?.width||1,r?.height||1);
    placed.forEach(({it,p,anchor})=>{
      it.el.style.left=p.x+'%';it.el.style.top=p.y+'%';
      if(it.line)placeLeader(it.line,anchor,p,r?.width||1,r?.height||1);
    });
  };
}
function calloutPoint(p,i,count,kind){
  const far=kind==='drop'?22:17,side=p.x<40?-1:p.x>60?1:(i%2?1:-1);
  const row=i-(count-1)/2;
  if(kind==='target')return {x:p.x,y:p.y};
  // Keep labels on the rim so the original model stays visible and clickable.
  if(kind==='hotspot'||kind==='drop'){
    const y=count<2?50:14+(i/(count-1))*72;
    return {x:side<0?9:91,y};
  }
  return {
    x:Math.max(8,Math.min(92,p.x+side*far)),
    y:Math.max(10,Math.min(90,p.y+row*(kind==='drop'?7:6)))
  };
}
function spreadPoints(points,w,h){
  const min=58,pts=points.map(({it,p,anchor},i)=>({it,anchor,p:{x:p.x,y:p.y},x:p.x*w/100,y:p.y*h/100,i}));
  for(let pass=0;pass<8;pass++){
    for(let a=0;a<pts.length;a++)for(let b=a+1;b<pts.length;b++){
      let dx=pts[b].x-pts[a].x,dy=pts[b].y-pts[a].y,d=Math.hypot(dx,dy);
      if(d>=min)continue;
      if(d<1){const ang=(a*2.1+b*.9)||.7;dx=Math.cos(ang);dy=Math.sin(ang);d=1;}
      const push=(min-d)/2,nx=dx/d,ny=dy/d;
      pts[a].x-=nx*push;pts[a].y-=ny*push;pts[b].x+=nx*push;pts[b].y+=ny*push;
    }
    for(const q of pts){
      const px=Math.max(28,(q.it.el.offsetWidth||44)/2+8),py=Math.max(28,(q.it.el.offsetHeight||44)/2+8);
      q.x=Math.max(px,Math.min(w-px,q.x));q.y=Math.max(py,Math.min(h-py,q.y));
    }
  }
  return pts.map(q=>({it:q.it,anchor:q.anchor,p:{x:q.x/w*100,y:q.y/h*100}}));
}
function placeLeader(line,from,to,w,h){
  const ax=from.x*w/100,ay=from.y*h/100,bx=to.x*w/100,by=to.y*h/100;
  const dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy);
  line.style.left=ax+'px';line.style.top=ay+'px';line.style.width=Math.max(18,len)+'px';
  line.style.transform=`rotate(${Math.atan2(dy,dx)}rad)`;
}

function renderFind(){
  const partList=partsFor(current);
  stage.innerHTML=`<div class="find-start"><div class="find-start-mark" aria-hidden="true">▶</div><p class="find-start-copy">准备好了吗？</p><button class="find-start-btn" type="button" aria-label="开始找零件"><span aria-hidden="true">▶</span><span>开始</span></button></div>`;
  stage.querySelector('.find-start-btn').onclick=()=>renderFindBoard(partList);
}
function promptFindPart(part){
  const text='请点击'+part.name+'。';
  if((window.VOICE_LINES||{})[text])return say(text);
  return saySys(text);
}
function renderFindBoard(partList){
  if(state[current].find)found=new Set(partList.map(p=>p.id));
  stage.innerHTML=`<p class="game-note"></p><div class="find-layout">${mapShell('find-map')}<div class="part-list"></div></div><div class="next-line"><button class="next-btn" type="button" ${state[current].find?'':'disabled'}>去拼装</button></div>`;
  const map=stage.querySelector('.machine-map'),list=stage.querySelector('.part-list');
  activeView=new MachineView(stage.querySelector('.model-mount'),current,{xray:false});
  const overlays=[];
  function refresh(){
    const target=nextPart(partList,found);
    setGuide(target?`请点击 <b>${esc(target.name)}</b>。`:`找到所有零件了，我们可以把它们重新拼成一个 <b>${esc(DATA[current].name)}</b>。`);
    list.innerHTML='';
    partList.forEach((p,i)=>{
      let h=map.querySelector(`[data-hotspot="${p.id}"]`);
      if(!h){
        const line=document.createElement('span');line.className='callout-line';line.dataset.line=p.id;map.appendChild(line);
        h=document.createElement('button');h.type='button';h.className='hotspot';h.dataset.hotspot=p.id;map.appendChild(h);
        h._calloutLine=line;
        h.onclick=()=>{
          const next=nextPart(partList,found);
          if(found.has(p.id)){activeView.selectPart(p.id);speakKnown(partSpeech(p));return;}
          if(!next||next.id!==p.id){
            if(next){activeView.selectPart(next.id);toast('请先点击'+next.name);promptFindPart(next);}
            return;
          }
          found.add(p.id);activeView.selectPart(p.id);const partVoice=speakKnown(partSpeech(p));toast(p.name);
          if(found.size===partList.length){state[current].find=true;save();}
          refresh();renderHeader();renderPhases();
          partVoice.then(()=>{
            if(!stage.isConnected)return;
            if(found.size===partList.length){phase='assemble';render();}
            else promptFindPart(nextPart(partList,found));
          });
        };
        overlays.push({id:p.id,el:h,line,kind:'target'});
      }
      const done=found.has(p.id),isTarget=target&&target.id===p.id;
      h.classList.toggle('done',done);h.classList.toggle('target',!!isTarget);h.classList.toggle('waiting',!done&&!isTarget);
      h.hidden=!isTarget;
      if(h._calloutLine)h._calloutLine.hidden=true;
      h.textContent=done?'✓':(isTarget?'●':'');
      h.setAttribute('aria-label',done?`${p.name} 已找到`:`请点击${p.name}`);
      const row=document.createElement('div');row.className=`part-row ${done?'done':isTarget?'target':'pending'}`;
      row.innerHTML=`<span class="part-dot"></span><div><b>${esc(p.name)}</b><span>${done?esc(p.text):(isTarget?'请先点这个零件':'等前一个讲完')}</span></div>`;
      list.appendChild(row);
    });
    stage.querySelector('.next-btn').disabled=!state[current].find;
  }
  refresh();attachPartPositions(activeView,overlays);
  if(!state[current].find){
    const first=nextPart(partList,found);
    if(first)promptFindPart(first);
  }
  stage.querySelector('.next-btn').onclick=()=>{phase='assemble';render();};
}

function renderAssemble(){
  const partList=partsFor(current),placed=new Set(state[current].assemble?partList.map(p=>p.id):[]);
  stage.innerHTML=`<p class="game-note"></p><div class="assemble-wrap">${mapShell('assemble-map')}<div class="parts-tray"></div></div><div class="next-line"><button class="next-btn" type="button" ${state[current].assemble?'':'disabled'}>去启动</button></div>`;
  const map=stage.querySelector('.machine-map'),tray=stage.querySelector('.parts-tray');
  activeView=new MachineView(stage.querySelector('.model-mount'),current,{xray:false,assemble:true,partIds:partList.map(p=>p.id)});
  activeView.setAssembled(placed);
  const overlays=[];
  partList.forEach((p,i)=>{
    const line=document.createElement('span');line.className='callout-line';line.dataset.line=p.id;map.appendChild(line);
    const z=document.createElement('div');z.className=`drop-zone ${placed.has(p.id)?'filled':''}`;z.dataset.part=p.id;z.textContent='';z._calloutLine=line;map.appendChild(z);overlays.push({id:p.id,el:z,line,kind:'target'});
    const piece=document.createElement('button');piece.type='button';piece.className='piece';piece.dataset.part=p.id;piece.style.borderTop=`5px solid ${COLORS[i%COLORS.length]}`;
    piece.innerHTML=`<canvas class="piece-preview" aria-hidden="true"></canvas>`;
    piece.setAttribute('aria-label',p.name);
    piece.addEventListener('click',()=>{if(!piece.disabled){activeView.selectPart(piece.dataset.part);speakKnown(partSpeech(p));}});
    if(placed.has(p.id)){z.textContent='';z.appendChild(piece);piece.disabled=true;}else tray.appendChild(piece);
    requestAnimationFrame(()=>renderPartPreview(piece.querySelector('canvas'),current,p.id));
  });
  attachPartPositions(activeView,overlays);
  function refresh(){
    const target=nextPart(partList,placed);
    setGuide(target?'<span class="assemble-guide-icon" aria-hidden="true">⇩</span>':'<span class="assemble-guide-icon done" aria-hidden="true">✓</span>');
    if(target)activeView.selectPart(target.id);
    stage.querySelectorAll('.drop-zone').forEach(z=>{
      const isPlaced=placed.has(z.dataset.part),isTarget=target&&target.id===z.dataset.part;
      z.classList.toggle('filled',isPlaced);z.classList.toggle('target',!!isTarget);
      z.hidden=!isPlaced&&!isTarget;
      if(z._calloutLine)z._calloutLine.hidden=true;
      if(!isPlaced&&!z.querySelector('.piece'))z.textContent=(partList.find(p=>p.id===z.dataset.part)||{}).name||'';
    });
    stage.querySelectorAll('.piece').forEach(piece=>{
      const isPlaced=placed.has(piece.dataset.part),isTarget=target&&target.id===piece.dataset.part;
      piece.disabled=isPlaced;piece.classList.toggle('waiting',!isPlaced&&!isTarget);
      piece.classList.toggle('target',!!isTarget);
    });
    stage.querySelector('.next-btn').disabled=!state[current].assemble;
  }
  stage.querySelectorAll('.piece').forEach(piece=>bindDrag(piece,placed,partList,()=>nextPart(partList,placed),refresh));
  refresh();
  stage.querySelector('.next-btn').onclick=()=>{phase='mission';render();};
}
function bindDrag(piece,placed,partList,getTarget,refresh){
  let startX=0,startY=0,dx=0,dy=0,home=null;
  piece.addEventListener('pointerdown',ev=>{
    if(piece.disabled)return;
    activeView.selectPart(piece.dataset.part);
    const target=getTarget&&getTarget();
    if(target&&piece.dataset.part!==target.id){
      piece.classList.add('shake');setTimeout(()=>piece.classList.remove('shake'),400);
      toast('请先放'+target.name);activeView.selectPart(target.id);return;
    }
    ev.preventDefault();home=piece.parentElement;const r=piece.getBoundingClientRect();
    startX=ev.clientX;startY=ev.clientY;dx=r.left;dy=r.top;
    piece.classList.add('dragging');piece.style.position='fixed';piece.style.left=dx+'px';piece.style.top=dy+'px';piece.style.width=r.width+'px';piece.setPointerCapture(ev.pointerId);
  });
  piece.addEventListener('pointermove',ev=>{
    if(!piece.classList.contains('dragging'))return;
    piece.style.left=dx+ev.clientX-startX+'px';piece.style.top=dy+ev.clientY-startY+'px';
  });
  piece.addEventListener('pointerup',ev=>{
    if(!piece.classList.contains('dragging'))return;
    const cx=ev.clientX,cy=ev.clientY;
    const target=getTarget&&getTarget();
    const zone=target?[...stage.querySelectorAll('.drop-zone')].find(z=>z.dataset.part===target.id):null;
    const hit=zone&&isNearDropZone(zone,cx,cy);
    piece.classList.remove('dragging');piece.style.position='';piece.style.left='';piece.style.top='';piece.style.width='';
    if(zone&&hit&&zone.dataset.part===piece.dataset.part){
      placed.add(piece.dataset.part);activeView.setAssembled(placed);activeView.selectPart(piece.dataset.part);
      zone.classList.add('filled');zone.textContent='';zone.appendChild(piece);piece.disabled=true;toast('放对啦');speakKnown('装回去');
      const done=partList.every(p=>placed.has(p.id));
      if(done){state[current].assemble=true;save();toast('拼好啦');renderHeader();renderPhases();stage.querySelector('.next-btn').disabled=false;}
      if(refresh)refresh();
    }else{
      home.appendChild(piece);piece.classList.add('shake');setTimeout(()=>piece.classList.remove('shake'),400);toast('再试试');
      if(refresh)refresh();
    }
  });
}
function isNearDropZone(zone,x,y){
  if(!zone||zone.hidden)return false;
  const r=zone.getBoundingClientRect();
  // Keep the marker small while giving a child a forgiving invisible snap area.
  const pad=Math.max(46,Math.min(74,Math.max(r.width,r.height)*.85));
  return x>=r.left-pad&&x<=r.right+pad&&y>=r.top-pad&&y<=r.bottom+pad;
}

function renderMission(){
  const steps=missionStepsFor(current);
  stage.innerHTML=`<p class="game-note">${missionGuide(steps,0)}</p><div class="mission-wrap"><div class="mission-3d"><div class="model-mount"></div></div><div class="mission-steps"></div></div>`;
  const box=stage.querySelector('.mission-steps');
  mission={id:current,steps,next:0,active:false,step:-1,t:1,start:0,duration:current==='mixer'?1900:1550};
  activeView=new MissionView(stage.querySelector('.model-mount'),current,steps);
  steps.forEach((s,i)=>{
    const b=document.createElement('button');b.type='button';b.className='mission-step';b.textContent=(i+1)+' '+s.label;
    b.onclick=()=>runMissionStep(i,b);box.appendChild(b);
  });
}
function runMissionStep(i,btn){
  if(!mission||mission.active)return;
  if(i!==mission.next){btn.classList.add('shake');setTimeout(()=>btn.classList.remove('shake'),400);toast('请先做：'+mission.steps[mission.next].label);return;}
  const steps=stage.querySelectorAll('.mission-step');
  steps.forEach((b,k)=>b.classList.toggle('active',k===i));
  mission.active=true;mission.step=i;mission.t=0;mission.start=performance.now();activeView.startStep(i);
  speakKnown(mission.steps[i].say);
  setTimeout(()=>{
    if(!mission)return;
    steps[i].classList.remove('active');steps[i].classList.add('done');
    mission.next++;mission.active=false;mission.step=-1;mission.t=1;activeView.finishStep(i);
    setGuide(missionGuide(mission.steps,mission.next));
    if(mission.next>=mission.steps.length){
      state[current].mission=true;save();renderCars();renderHeader();renderPhases();
      const next=DATA[current].next;toast(next?'通关，解锁'+DATA[next].name:'三辆车都通关啦');
    }
  },mission.duration+120);
}

function renderPreview(canvas,id){
  if(!canvas)return;
  if(!previewCanvas){
    previewCanvas=document.createElement('canvas');
    try{previewRenderer=new THREE.WebGLRenderer({canvas:previewCanvas,antialias:true,alpha:true,preserveDrawingBuffer:true});}
    catch(e){return;}
    previewRenderer.setClearColor(0,0);previewRenderer.toneMapping=THREE.ACESFilmicToneMapping;
    previewRenderer.shadowMap.enabled=true;previewRenderer.shadowMap.type=THREE.PCFSoftShadowMap;
  }
  const r=canvas.getBoundingClientRect(),w=Math.max(120,Math.round(r.width||180)),h=Math.max(70,Math.round(r.height||70)),pr=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(w*pr);canvas.height=Math.round(h*pr);
  const sc=makeThreeScene(),model=buildModel(sc.scene,id);
  model.wrapper.rotation.y=.25;model.wrapper.scale.setScalar(id==='pumptruck'?.9:1.05);
  fitCamera(sc.camera,sc.scene,w/h,.9);
  previewRenderer.setPixelRatio(pr);previewRenderer.setSize(w,h,false);previewRenderer.outputEncoding=THREE.sRGBEncoding;previewRenderer.toneMappingExposure=1.0;
  previewRenderer.render(sc.scene,sc.camera);
  const g=canvas.getContext('2d');g.clearRect(0,0,canvas.width,canvas.height);g.drawImage(previewCanvas,0,0,canvas.width,canvas.height);
}
function renderPartPreview(canvas,id,partId){
  if(!canvas)return;
  if(!previewCanvas){
    previewCanvas=document.createElement('canvas');
    try{previewRenderer=new THREE.WebGLRenderer({canvas:previewCanvas,antialias:true,alpha:true,preserveDrawingBuffer:true});}
    catch(e){return;}
    previewRenderer.setClearColor(0,0);previewRenderer.toneMapping=THREE.ACESFilmicToneMapping;
    previewRenderer.shadowMap.enabled=true;previewRenderer.shadowMap.type=THREE.PCFSoftShadowMap;
  }
  const r=canvas.getBoundingClientRect(),w=Math.max(64,Math.round(r.width||64)),h=Math.max(48,Math.round(r.height||48)),pr=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(w*pr);canvas.height=Math.round(h*pr);
  const sc=makeThreeScene(),model=buildModel(sc.scene,id),part=model.ctx.PARTS[partId];
  model.root.traverse(o=>{if(o.isMesh)o.visible=false;});
  if(part)for(const g of part.groups)g.traverse(o=>{if(o.isMesh)o.visible=true;});
  model.wrapper.rotation.y=.25;model.update(.016);
  fitPartCamera(sc.camera,part,sc.scene,w/h,1.18);
  previewRenderer.setPixelRatio(pr);previewRenderer.setSize(w,h,false);previewRenderer.outputEncoding=THREE.sRGBEncoding;previewRenderer.toneMappingExposure=1.0;
  previewRenderer.render(sc.scene,sc.camera);
  const g=canvas.getContext('2d');g.clearRect(0,0,canvas.width,canvas.height);g.drawImage(previewCanvas,0,0,canvas.width,canvas.height);
}

function fitPartCamera(camera,part,scene,aspect,pad=1.18){
  camera.aspect=aspect;camera.updateProjectionMatrix();
  const box=new THREE.Box3();
  for(const m of (part?.meshes||[])){
    if(!m.visible||m.userData.noHit)continue;
    m.updateWorldMatrix(true,false);box.expandByObject(m);
  }
  if(box.isEmpty()){fitCamera(camera,scene,aspect,pad,.15);return;}
  const sphere=box.getBoundingSphere(new THREE.Sphere());
  const radius=Math.max(sphere.radius,.08),phi=1.1,theta=.9,s=Math.sin(phi);
  const d=radius/Math.sin(THREE.MathUtils.degToRad(camera.fov/2))*pad;
  camera.position.set(sphere.center.x+d*s*Math.sin(theta),sphere.center.y+d*Math.cos(phi),sphere.center.z+d*s*Math.cos(theta));
  camera.lookAt(sphere.center.x,sphere.center.y,sphere.center.z);
}

function makeThreeScene(){
  const scene=new THREE.Scene();
  const env=L3.gradientEnv('#cfe0f0','#eef4fa','#b6bfc9','#8d97a2');env.encoding=THREE.sRGBEncoding;scene.environment=env;
  const hemi=new THREE.HemisphereLight(0xdfefff,0xc9a56a,.55);scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xfff2e0,.95);sun.position.set(4,7,5);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);scene.add(sun);
  hemi.color.convertSRGBToLinear();hemi.groundColor.convertSRGBToLinear();sun.color.convertSRGBToLinear();
  const camera=new THREE.PerspectiveCamera(34,1,.05,120);
  return {scene,camera};
}
function buildModel(scene,id,opts){
  opts=opts||{};
  const wrapper=new THREE.Group(),r=new THREE.Group();wrapper.add(r);scene.add(wrapper);
  const ctx=L3.makeCtx(scene,r),api=makeApi();
  api.camera=opts.camera||null;
  resetSceneState(id);
  let env=null;
  if(opts.env&&window.SCENES[id].env){
    const before=new Set(scene.children);
    env=window.SCENES[id].env(ctx,api);
    scene.children.forEach(ch=>{
      if(before.has(ch)||ch===wrapper)return;
      ch.traverse(o=>{if(o.isMesh)o.userData.noHit=true;o.userData.gameEnv=true;});
    });
  }
  const obj=window.SCENES[id].build(ctx,api);
  return new SceneModel(id,wrapper,r,ctx,api,obj,env);
}
function addGround(scene){
  const ground=new THREE.Mesh(new THREE.CircleGeometry(18,64),new THREE.MeshStandardMaterial({color:0xC7DDAF,roughness:1}));
  ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;ground.userData.noHit=true;scene.add(ground);
  if(ground.material.color.convertSRGBToLinear)ground.material.color.convertSRGBToLinear();
  return ground;
}
function fitCamera(camera,scene,aspect,pad=1.1,targetY=.9){
  camera.aspect=aspect;camera.updateProjectionMatrix();
  const box=new THREE.Box3();scene.traverse(o=>{if(o.isMesh&&o.visible&&!o.userData.noHit)box.expandByObject(o);});
  if(box.isEmpty()){camera.position.set(6,4,7);camera.lookAt(0,1,0);return;}
  const sp=box.getBoundingSphere(new THREE.Sphere()),phi=1.1,theta=.9,s=Math.sin(phi);
  const d=sp.radius/Math.sin(THREE.MathUtils.degToRad(camera.fov/2))*pad;
  camera.position.set(sp.center.x+d*s*Math.sin(theta),sp.center.y+d*Math.cos(phi)+targetY,sp.center.z+d*s*Math.cos(theta));
  camera.lookAt(sp.center.x,sp.center.y*.8+targetY*.2,sp.center.z);
}
function partOfGroup(g){
  let pid=null;g.traverse(o=>{if(!pid&&o.isMesh&&o.userData.part)pid=o.userData.part;});
  return pid;
}
function partBounds(parts,id){
  const p=parts[id];if(!p)return null;
  const box=new THREE.Box3();
  for(const m of p.meshes){if(m.userData.noHit)continue;m.updateWorldMatrix(true,false);box.expandByObject(m);}
  if(box.isEmpty())return null;
  return box.getBoundingSphere(new THREE.Sphere());
}

class SceneModel{
  constructor(id,wrapper,root,ctx,api,obj,env){
    this.id=id;this.wrapper=wrapper;this.root=root;this.ctx=ctx;this.api=api;this.obj=obj;this.env=env;this.groupParts=new Map();
    for(const o of ctx.placed){this.groupParts.set(o,partOfGroup(o));o.userData.gameEx=0;}
    sceneMaterialSetup(ctx);
  }
  update(dt){this.obj.update&&this.obj.update(dt);this.env&&this.env.update&&this.env.update(dt);}
  setState(values){
    const st={mixer:window.__MX,pumptruck:window.__PT,roller:window.__RL}[this.id];if(!st)return;
    for(const k in values){st[k]=values[k];if((k+'T') in st)st[k+'T']=values[k];}
  }
}
function sceneMaterialSetup(ctx){
  ctx.root.traverse(o=>{
    if(!o.isMesh)return;
    const m=o.material;
    o.userData.opBase=m.transparent?m.opacity:1;o.userData.trBase=!!m.transparent;o.userData.dwBase=m.depthWrite!==false;o.userData.csBase=o.castShadow!==false;
    if(m.color&&!o.userData.baseCol)o.userData.baseCol=m.color.clone();
    if(m.emissive&&o.userData.baseEm==null)o.userData.baseEm=m.emissive.getHex();
  });
}
function paintShell(ctx,xr){
  const ghost=new THREE.Color(0x7A93B5);ghost.convertSRGBToLinear();
  for(const m of ctx.shellMeshes){
    const mat=m.material,base=m.userData.baseOp==null?(mat.transparent?mat.opacity:1):m.userData.baseOp;
    const op=base*(1-.76*xr);mat.opacity=op;mat.transparent=op<.995||!!m.userData.glass;mat.depthWrite=op>.995&&!m.userData.glass;
    if(mat.color&&m.userData.baseCol&&!m.userData.keepEm&&!m.userData.glass)mat.color.copy(m.userData.baseCol).lerp(ghost,xr);
  }
}
function highlight(ctx,id,t){
  for(const pid in ctx.PARTS){
    const on=pid===id;
    for(const m of ctx.PARTS[pid].meshes){
      const mat=m.material;if(!mat.emissive||m.userData.glass)continue;
      mat.emissive.setHex(on&&mat.color?mat.color.getHex():(m.userData.baseEm||0));
      mat.emissiveIntensity=(m.userData.dynInt||0)+(on?(.18+.12*Math.sin(t/130)):0);
    }
  }
}

class MachineView{
  constructor(mount,id,opts){
    this.mount=mount;this.id=id;this.opts=opts||{};this.canvas=document.createElement('canvas');this.canvas.className='game-3d-canvas';mount.appendChild(this.canvas);
    this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,antialias:true,alpha:true});
    this.renderer.setClearColor(0,0);this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.outputEncoding=THREE.sRGBEncoding;this.renderer.toneMappingExposure=1.0;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    const sc=makeThreeScene();this.scene=sc.scene;this.camera=sc.camera;addGround(this.scene);
    this.model=buildModel(this.scene,id);this.model.wrapper.rotation.y=.15;
    this.partIds=new Set(opts.partIds||PART_IDS[id]);this.assembled=new Set();this.selected=null;this.dead=false;this.last=performance.now();this.onFrame=null;
    this.loop();
  }
  setAssembled(s){this.assembled=new Set(s);}
  selectPart(id){this.selected=id;const p=this.model.ctx.PARTS[id];if(p)for(const g of p.groups)if(g.userData)g.userData.hopT0=performance.now();}
  partScreen(id){
    const sp=partBounds(this.model.ctx.PARTS,id);if(!sp)return null;
    const v=sp.center.clone().project(this.camera);
    return {x:Math.max(8,Math.min(92,(v.x+1)*50)),y:Math.max(10,Math.min(90,(1-v.y)*50))};
  }
  resize(){
    const r=this.mount.getBoundingClientRect(),pr=Math.min(devicePixelRatio||1,2),w=Math.max(1,r.width),h=Math.max(1,r.height);
    const pw=Math.round(w*pr),ph=Math.round(h*pr);
    if(this.canvas.width!==pw||this.canvas.height!==ph){this.canvas.width=pw;this.canvas.height=ph;this.renderer.setPixelRatio(pr);this.renderer.setSize(w,h,false);}
    fitCamera(this.camera,this.scene,w/h,this.opts.assemble?.98:1.08,.85);
  }
  loop(){
    if(this.dead)return;requestAnimationFrame(()=>this.loop());
    const t=performance.now(),dt=Math.min((t-this.last)/1000,.05);this.last=t;this.resize();
    const wantXr=this.opts.xray?1:0;this.model.api.S.xr=wantXr;this.model.api.S.xray=!!wantXr;
    let maxEx=0;
    for(const o of this.model.ctx.placed){
      const pid=this.model.groupParts.get(o),target=this.opts.assemble&&this.partIds.has(pid)&&!this.assembled.has(pid)?1:0;
      o.userData.gameEx+=(target-o.userData.gameEx)*Math.min(1,dt*5);maxEx=Math.max(maxEx,o.userData.gameEx);
      const home=o.userData.home,ex=o.userData.explode,hop=(t-(o.userData.hopT0||-1e9))/520;
      o.position.copy(home).addScaledVector(ex,o.userData.gameEx);
      if(hop<1)o.position.y+=Math.sin(Math.PI*hop)*.16;
    }
    this.model.api.ee=maxEx;paintShell(this.model.ctx,wantXr*.85+maxEx*.15);this.model.update(dt);highlight(this.model.ctx,this.selected,t);
    this.renderer.render(this.scene,this.camera);if(this.onFrame)this.onFrame();
  }
  dispose(){this.dead=true;try{this.renderer.dispose();if(this.renderer.forceContextLoss)this.renderer.forceContextLoss();}catch(e){}this.mount.innerHTML='';}
}

class MissionView{
  constructor(mount,id,steps){
    this.mount=mount;this.id=id;this.canvas=document.createElement('canvas');this.canvas.className='game-3d-canvas';mount.appendChild(this.canvas);
    this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,antialias:true,alpha:true});
    this.renderer.setClearColor(0,0);this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.outputEncoding=THREE.sRGBEncoding;this.renderer.toneMappingExposure=1.0;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    const sc=makeThreeScene();this.scene=sc.scene;this.camera=sc.camera;
    this.steps=steps||missionStepsFor(id);this.originalSolo=id==='mixer';
    this.models={};this.progress=this.steps.map(()=>0);this.active=-1;this.start=0;this.dead=false;this.last=performance.now();
    const ids=id==='mixer'?['mixer']:id==='pumptruck'?['pumptruck','mixer']:['roller','mixer','pumptruck'];
    ids.forEach(mid=>{
      this.models[mid]=buildModel(this.scene,mid,{env:mid===id,camera:this.camera});
      this.models[mid].wrapper.scale.setScalar(mid==='pumptruck'?.72:.82);
    });
    this.makeProps();this.pose();this.loop();
  }
  makeProps(){
    if(this.id==='pumptruck'){
      this.floors=[];for(let i=0;i<5;i++){const m=L3.roundedBox(2.1,.22,1.3,.04,L3.matte(0xC9C3B8));m.position.set(4.1,.75+i*.48,0);this.scene.add(m);this.floors.push(m);}
    }
    if(this.id==='roller'){
      if(!this.models.roller.env){
        this.road=new THREE.Mesh(new THREE.PlaneGeometry(7,1.25),new THREE.MeshStandardMaterial({color:0x4A4844,roughness:.9}));
        this.road.rotation.x=-Math.PI/2;this.road.position.set(.8,.025,0);this.road.scale.x=.001;this.scene.add(this.road);
      }
      this.pit=new THREE.Mesh(new THREE.CylinderGeometry(.75,.9,.09,28),new THREE.MeshStandardMaterial({color:0x8A857D,roughness:.8}));
      this.pit.position.set(-.6,.05,0);this.scene.add(this.pit);
    }
  }
  startStep(i){
    this.active=i;this.start=performance.now();const s=this.steps[i];
    if(this.originalSolo){
      const m=this.models[this.id],chain=m.obj.chain||[];
      if(i===0&&m.obj.onStart)m.obj.onStart();
      m.api.S.sel=s.part;m.api.S.drive=true;
      if(chain[i]&&chain[i].on)chain[i].on();
      return;
    }
    for(const m of Object.values(this.models)){m.api.S.sel=s.part;m.api.S.drive=true;}
  }
  finishStep(i){
    this.progress[i]=1;this.active=-1;
    if(this.originalSolo&&i>=this.steps.length-1){const m=this.models[this.id];if(m.obj.onDone)m.obj.onDone();}
    this.pose();
  }
  val(i){if(this.progress[i]>=1)return 1;if(this.active===i)return ease(Math.min(1,(performance.now()-this.start)/1550));return 0;}
  resize(){
    const r=this.mount.getBoundingClientRect(),pr=Math.min(devicePixelRatio||1,2),w=Math.max(1,r.width),h=Math.max(1,r.height);
    const pw=Math.round(w*pr),ph=Math.round(h*pr);
    if(this.canvas.width!==pw||this.canvas.height!==ph){this.canvas.width=pw;this.canvas.height=ph;this.renderer.setPixelRatio(pr);this.renderer.setSize(w,h,false);}
    fitCamera(this.camera,this.scene,w/h,this.id==='roller'?1.55:1.35,.65);
  }
  pose(){
    if(this.originalSolo)return;
    if(this.id==='mixer')this.poseMixer();
    else if(this.id==='pumptruck')this.posePump();
    else this.poseRoller();
  }
  poseMixer(){
    const m=this.models.mixer,p1=this.val(1),p2=this.val(2),p3=this.val(3);
    m.wrapper.position.set(-1.4,0,0);m.setState({spinT:Math.max(p1,p3),spin:Math.max(p1,p3),driveT:2.2*p2,drive:2.2*p2,chuteT:p2,chute:p2,pourT:p3,pour:p3});
  }
  posePump(){
    const arrive=this.val(0),legs=this.val(1),feed=this.val(2),arm=this.val(3),pump=this.val(4);
    this.models.mixer.wrapper.position.set(-5+2.9*arrive,0,-.55);
    this.models.pumptruck.wrapper.position.set(5-3.6*arrive,0,.55);
    this.models.mixer.setState({spinT:1,spin:1,chuteT:feed,chute:feed,pourT:feed,pour:feed});
    this.models.pumptruck.setState({legT:legs,leg:legs,a1T:arm,a1:arm,a2T:arm,a2:arm,a3T:arm,a3:arm,pumpT:pump,pump:pump});
    if(this.floors)this.floors.forEach((f,i)=>{f.visible=pump>i*.18;f.scale.y=Math.max(.05,Math.min(1,(pump-i*.18)/.18));});
  }
  poseRoller(){
    const arrive=this.val(0),fill=this.val(1),rollIn=this.val(2),road=this.val(3),leave=this.val(4),off=leave*5;
    this.models.mixer.wrapper.position.set(-5+2.4*arrive+off,0,-.8);
    this.models.pumptruck.wrapper.position.set(5-4.2*arrive+off,0,.75);
    this.models.roller.wrapper.position.set(-6+3.6*rollIn+road*2.4+off,0,.05);
    this.models.mixer.setState({spinT:1,spin:1,chuteT:fill,chute:fill,pourT:fill,pour:fill});
    this.models.pumptruck.setState({legT:arrive,leg:arrive,a1T:fill,a1:fill,a2T:fill,a2:fill,a3T:fill,a3:fill,pumpT:fill,pump:fill});
    this.models.roller.setState({sprayT:road,spray:road,vibT:road,vib:road,driveT:road*2,drive:road*2});
    if(this.road)this.road.scale.x=Math.max(.001,road);
    if(this.pit)this.pit.scale.set(1,.4+fill*.75,1);
  }
  loop(){
    if(this.dead)return;requestAnimationFrame(()=>this.loop());
    const t=performance.now(),dt=Math.min((t-this.last)/1000,.05);this.last=t;this.resize();this.pose();
    for(const m of Object.values(this.models)){for(const o of m.ctx.placed){const home=o.userData.home;if(home)o.position.copy(home);}m.api.ee=0;m.api.S.xr=0;m.update(dt);highlight(m.ctx,m.api.S.sel,t);}
    this.renderer.render(this.scene,this.camera);
  }
  dispose(){this.dead=true;try{this.renderer.dispose();if(this.renderer.forceContextLoss)this.renderer.forceContextLoss();}catch(e){}this.mount.innerHTML='';}
}
function ease(t){return t*t*(3-2*t);}
if(location.hash==='#game')selectTab('game');
})();
