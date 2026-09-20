/* Движок курсов Залихвата. Мультикурсовый (по window.ZH_COURSE_ID). Рендер + прогресс + XP/ранги + ачивки + ИИ-наставник. */
(function () {
  "use strict";
  var cfg = window.ZCFG || {};
  var sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  var API = cfg.API_BASE || "/api";
  var CID = window.ZH_COURSE_ID || "proyavit";     // id курса
  var TUTOR_ON = !!window.ZH_TUTOR_ON;             // включить ИИ-наставника
  var C = null;
  var app = document.getElementById("app");

  var uid = null, email = null, token = null;
  var state = { v: 1, done: {}, ach: {}, days: [], started: null, updated: null };
  var saveTimer = null, allTasks = [], totalXpMax = 0;

  // хардкод-тексты «Проявить себя» (back-compat); прочие курсы берут из C
  var PROYAVIT = CID === "proyavit";
  function cTitle(){ return (C && C.title) || (PROYAVIT ? "Проявить себя" : "Курс"); }
  function cSub(){ return (C && C.subtitle) || (PROYAVIT ? "Пройди игру — и стань тем, кого видят и слышат" : ""); }
  function cHero(){ return (C && C.hero) || (PROYAVIT ? "13 уровней-квестов: от «страшно показаться» до системного блога. Отмечай задачи — копи XP, повышай ранг, открывай ачивки. Прогресс сохраняется и синхронизируется между устройствами." : ""); }
  function cTag(){ return (C && C.tag) || (PROYAVIT ? "Курс-игра · Залихват" : "Курс · Залихват"); }

  // ---------- i18n ----------
  var LANG = (window.ZH_LANG==="en") ? "en" : "ru";
  var T = {
    ru: {
      start:"Начать →", cont:"Продолжить →", maxRank:"максимальный ранг достигнут",
      tasks:"задач", days:"дней подряд", ach:"Ачивки", lvlTasks:"Задачи уровня", info:"информация",
      lvlDone:"✓ Уровень пройден - красавчик!", copy:"Копировать", copied:"Скопировано ✓",
      exTitle:"Примеры под твою сферу", hintTitle:"Подсказка наставника", ask:"Спросить наставника →",
      tHeader:"ИИ-наставник", tHi:"Привет! Спроси что угодно по текущему уроку - помогу и подскажу следующий шаг.",
      tPh:"Твой вопрос по уроку...", tFab:"Наставник",
      tErrA:"Не получилось ответить. Попробуй ещё раз.", tErrN:"Наставник сейчас не отвечает. Попробуй через минуту.",
      gateBody:"Это интерактивный курс внутри кабинета - с прохождением, галочками, XP и ачивками. Войди в кабинет Залихват, чтобы открыть курс и сохранять прогресс.",
      gateBtn:"Войти в кабинет →", buyGet:"Получить доступ", buyHow:"Как получить доступ →",
      familiar:"Знакомо?", whatGet:"Что получишь", forWhom:"Для кого:",
      ctaSub:"Пожизненный доступ, прохождение с галочками и XP, ИИ-наставник внутри.",
      paid:"Уже оплатил(а)? Открой курс с той же почтой, что и в кабинете.", refresh:"Обновить доступ",
      failH:"Не удалось загрузить курс", failMsg:"Попробуй обновить страницу.", failNet:"Проверь соединение и обнови страницу.", refreshBtn:"Обновить →",
      achSub:"открыто новое достижение", rankSub:"ты растёшь",
      toRank:function(n,x){return 'до ранга «'+n+'» - '+x+' XP';},
      foot:function(t){return 'Залихват · курс «'+t+'»';},
      heroMeta:function(mc,tc){return mc+' уровней · '+tc+' заданий · ИИ-наставник внутри';},
      whatInside:function(mc){return 'Что внутри - '+mc+' уровней';},
      heroFb:function(mc,tc){return mc+' уровней, '+tc+' заданий, XP и ачивки.';},
      achT:function(n){return 'Ачивка: '+n;}, rankT:function(n){return 'Новый ранг: '+n;}
    },
    en: {
      start:"Start →", cont:"Continue →", maxRank:"top rank reached",
      tasks:"tasks", days:"day streak", ach:"Achievements", lvlTasks:"Level tasks", info:"info",
      lvlDone:"✓ Level complete - nice!", copy:"Copy", copied:"Copied ✓",
      exTitle:"Examples for your field", hintTitle:"Mentor tip", ask:"Ask the mentor →",
      tHeader:"AI mentor", tHi:"Hi! Ask anything about this lesson - I will help and point you to the next step.",
      tPh:"Your question about the lesson...", tFab:"Mentor",
      tErrA:"Could not answer. Try again.", tErrN:"The mentor is not responding. Try again in a minute.",
      gateBody:"This is an interactive course inside your cabinet - with progress, checkboxes, XP and achievements. Sign in to your Zalihvat cabinet to open the course and save progress.",
      gateBtn:"Sign in →", buyGet:"Get access", buyHow:"How to get access →",
      familiar:"Sound familiar?", whatGet:"What you get", forWhom:"For whom:",
      ctaSub:"Lifetime access, progress with checkboxes and XP, AI mentor inside.",
      paid:"Already paid? Open the course with the same email as in your cabinet.", refresh:"Refresh access",
      failH:"Could not load the course", failMsg:"Try refreshing the page.", failNet:"Check your connection and refresh.", refreshBtn:"Refresh →",
      achSub:"new achievement unlocked", rankSub:"you are leveling up",
      toRank:function(n,x){return 'to rank "'+n+'" - '+x+' XP';},
      foot:function(t){return 'Zalihvat · course "'+t+'"';},
      heroMeta:function(mc,tc){return mc+' levels · '+tc+' tasks · AI mentor inside';},
      whatInside:function(mc){return 'What is inside - '+mc+' levels';},
      heroFb:function(mc,tc){return mc+' levels, '+tc+' tasks, XP and achievements.';},
      achT:function(n){return 'Achievement: '+n;}, rankT:function(n){return 'New rank: '+n;}
    }
  };
  function L(k){ return (T[LANG]&&T[LANG][k]!=null)?T[LANG][k]:T.ru[k]; }

  // ---------- utils ----------
  function esc(s){ return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
  function ICON(e){ var m=window.ZH_ICONS&&window.ZH_ICONS[e]; if(!m) return esc(e||""); return '<svg class="zi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+m+'</svg>'; }
  function todayStr(){ var d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
  function flat(){ allTasks=[]; totalXpMax=0; C.modules.forEach(function(m){ (m.tasks||[]).forEach(function(t){ allTasks.push(t); totalXpMax+=t.xp; }); }); }
  function xp(){ var s=0; allTasks.forEach(function(t){ if(state.done[t.id]) s+=t.xp; }); return s; }
  function doneCount(){ var n=0; allTasks.forEach(function(t){ if(state.done[t.id]) n++; }); return n; }
  function modDone(m){ return (m.tasks||[]).every(function(t){ return state.done[t.id]; }); }
  function modCount(m){ var n=0; (m.tasks||[]).forEach(function(t){ if(state.done[t.id]) n++; }); return n; }
  function rankFor(x){ var r=C.ranks[0]; for(var i=0;i<C.ranks.length;i++){ if(x>=C.ranks[i].min) r=C.ranks[i]; } return r; }
  function nextRank(x){ for(var i=0;i<C.ranks.length;i++){ if(C.ranks[i].min>x) return C.ranks[i]; } return null; }
  function streak(){
    if(!state.days||!state.days.length) return 0;
    var set={}; state.days.forEach(function(d){ set[d]=1; });
    var n=0, d=new Date();
    if(!set[todayStr()]) d.setDate(d.getDate()-1);
    for(;;){ var k=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); if(set[k]){ n++; d.setDate(d.getDate()-1); } else break; }
    return n;
  }

  // ---------- persistence (per-course) ----------
  function remoteName(){ return PROYAVIT ? "_course.json" : "_course_"+CID+".json"; }
  function lsKey(){ return PROYAVIT ? ("zh_course_"+(uid||"anon")) : ("zh_course_"+CID+"_"+(uid||"anon")); }
  function saveLocal(){ try{ localStorage.setItem(lsKey(), JSON.stringify(state)); }catch(e){} }
  function loadLocal(){ try{ var s=localStorage.getItem(lsKey()); if(s) return JSON.parse(s); }catch(e){} return null; }
  function scheduleSave(){ saveLocal(); if(saveTimer) clearTimeout(saveTimer); saveTimer=setTimeout(pushRemote, 900); }
  function pushRemote(){
    if(!uid) return;
    state.updated=new Date().toISOString();
    try{
      var blob=new Blob([JSON.stringify(state)],{type:"application/json"});
      sb.storage.from("uploads").upload(uid+"/"+remoteName(), blob, {upsert:true, contentType:"application/json"});
    }catch(e){}
  }
  function pullRemote(){
    return sb.storage.from("uploads").download(uid+"/"+remoteName())
      .then(function(r){ if(r&&r.data) return r.data.text().then(function(t){ return JSON.parse(t); }); return null; })
      .catch(function(){ return null; });
  }

  // ---------- achievements ----------
  function achEarned(a){
    var c=a.cond;
    if(c.all) return doneCount()===allTasks.length && allTasks.length>0;
    if(c.task) return !!state.done[c.task];
    if(c.module){ var m=C.modules.filter(function(x){return x.id===c.module;})[0]; return m?modDone(m):false; }
    if(c.streak) return streak()>=c.streak;
    if(c.xp) return xp()>=c.xp;
    return false;
  }
  function checkAchievements(){
    var newly=[];
    C.achievements.forEach(function(a){
      var earned=achEarned(a);
      if(earned && !state.ach[a.id]){ state.ach[a.id]=true; newly.push(a); }
    });
    if(newly.length){ renderAch(); }
    return newly;
  }

  // ---------- toast + confetti ----------
  var toast=document.getElementById("toast"), toastQ=[], toastBusy=false;
  function showToast(em, tt, ts){ toastQ.push([em,tt,ts]); if(!toastBusy) nextToast(); }
  function nextToast(){
    if(!toastQ.length){ toastBusy=false; return; }
    toastBusy=true;
    var it=toastQ.shift();
    toast.querySelector(".em").innerHTML=ICON(it[0]);
    toast.querySelector(".tt").textContent=it[1];
    toast.querySelector(".ts").textContent=it[2];
    toast.classList.add("show");
    setTimeout(function(){ toast.classList.remove("show"); setTimeout(nextToast, 350); }, 2600);
  }
  function confetti(){
    var cols=["#ff7f50","#e85f2c","#151210","#ffe6d8","#2f9e60"];
    for(var i=0;i<70;i++){(function(){
      var c=document.createElement("div"); c.className="cf";
      c.style.left=(Math.random()*100)+"vw"; c.style.background=cols[i%cols.length];
      var dur=(1.6+Math.random()*1.4), delay=Math.random()*0.5;
      c.style.transition="transform "+dur+"s ease-in, opacity "+dur+"s ease-in";
      c.style.transitionDelay=delay+"s"; c.style.transform="translateY(0) rotate(0deg)";
      c.style.borderRadius=(Math.random()<.5?"2px":"50%");
      document.body.appendChild(c);
      requestAnimationFrame(function(){ c.style.transform="translateY("+(window.innerHeight+40)+"px) rotate("+(Math.random()*720-360)+"deg)"; c.style.opacity="0.2"; });
      setTimeout(function(){ c.remove(); }, (dur+delay)*1000+200);
    })();}
  }

  // ---------- render ----------
  function ring(pct){
    var r=24, cir=2*Math.PI*r, off=cir*(1-pct/100);
    return '<svg width="58" height="58" viewBox="0 0 58 58">'
      +'<circle cx="29" cy="29" r="'+r+'" fill="none" stroke="#ffe6d8" stroke-width="7"/>'
      +'<circle cx="29" cy="29" r="'+r+'" fill="none" stroke="#ff7f50" stroke-width="7" stroke-linecap="round" stroke-dasharray="'+cir+'" stroke-dashoffset="'+off+'" style="transition:stroke-dashoffset .6s"/>'
      +'</svg>';
  }
  function renderBar(){
    var x=xp(), pct=Math.round(doneCount()/allTasks.length*100), rk=rankFor(x), nr=nextRank(x), st=streak();
    var toNext = nr? (nr.min-x) : 0;
    var fill = nr? Math.round((x-rk.min)/(nr.min-rk.min)*100) : 100;
    document.getElementById("pbar").innerHTML=
      '<div class="ring">'+ring(pct)+'<span class="pct">'+pct+'%</span></div>'
      +'<div class="pmeta">'
        +'<div class="rank">'+ICON(rk.em)+' '+esc(rk.name)+' <small>· '+x+' XP</small></div>'
        +'<div class="sub">'+(nr? L('toRank')(esc(nr.name),toNext) : L('maxRank'))+'</div>'
        +'<div class="xpwrap"><i style="width:'+fill+'%"></i></div>'
      +'</div>'
      +'<div class="pstat"><b>'+doneCount()+'</b><span>'+L('tasks')+'</span></div>'
      +'<div class="pstat"><b>'+st+'</b><span>'+L('days')+'</span></div>';
  }
  function renderAch(){
    var el=document.getElementById("ach"); if(!el) return;
    el.innerHTML=C.achievements.map(function(a){
      var got=state.ach[a.id];
      return '<div class="ach'+(got?' got':'')+'"><div class="med">'+(got?ICON(a.em):ICON('🔒'))+'</div><span class="an">'+esc(a.name)+'</span></div>';
    }).join("");
  }
  function promptHTML(p){
    var pre=p.text.replace(/</g,"").replace(/b>/g,"<b>").replace(/\/b>/g,"</b>").replace(//g,"&lt;");
    return '<div class="prompt"><div class="ph"><span class="ic">✦</span><span class="t">'+esc(p.title)+'</span>'
      +'<button class="copy" data-copy="'+encodeURIComponent(p.text)+'">'+L('copy')+'</button></div>'
      +'<pre>'+pre+'</pre></div>';
  }
  function lessonHTML(l){ return '<h3><span class="dot">◆</span> '+esc(l.h)+'</h3>'+l.body; }
  function examplesHTML(ex, mid){
    var opts=(ex&&ex.options)||[]; if(!opts.length) return "";
    var chips=opts.map(function(o,i){ return '<button class="ex-chip'+(i===0?' on':'')+'" data-ex="'+mid+'" data-i="'+i+'">'+esc(o.label)+'</button>'; }).join("");
    return '<div class="ex"><div class="ex-h">'+ICON('🎯')+' '+esc(ex.title||L('exTitle'))+'</div>'
      +'<div class="ex-chips">'+chips+'</div>'
      +'<div class="ex-panel" id="ex-panel-'+mid+'">'+opts[0].body+'</div></div>';
  }
  function hintHTML(h){
    var text = typeof h==="string" ? h : (h.text||"");
    var ask = (typeof h==="object" && h.ask) ? h.ask : "";
    var btn = (ask && TUTOR_ON) ? '<button class="hint-ask" data-ask="'+encodeURIComponent(ask)+'">'+L('ask')+'</button>' : '';
    return '<div class="hint">'+ICON('💬')+'<div class="hint-b"><b>'+L('hintTitle')+'</b><p>'+esc(text)+'</p>'+btn+'</div></div>';
  }
  function exampleBody(mid, i){
    var m=C.modules.filter(function(x){return x.id===mid;})[0];
    if(m && m.examples && m.examples.options && m.examples.options[i]) return m.examples.options[i].body;
    return "";
  }
  function moduleHTML(m, idx){
    var cnt=modCount(m), tot=(m.tasks||[]).length, done=modDone(m);
    var mxp=(m.tasks||[]).reduce(function(s,t){return s+t.xp;},0);
    var body='';
    body+='<div class="why">'+esc(m.why)+'</div>';
    (m.lessons||[]).forEach(function(l){ body+=lessonHTML(l); });
    if(m.book){ var bh=(m.book.h||"").replace(/^[^0-9A-Za-zА-Яа-яЁё]+/,""); body+='<div class="book"><div class="bh">'+ICON('💡')+' '+esc(bh)+'</div><p>'+esc(m.book.text)+'</p></div>'; }
    if(m.prompt) body+=promptHTML(m.prompt);
    if(m.prompts) m.prompts.forEach(function(p){ body+=promptHTML(p); });
    if(m.examples) body+=examplesHTML(m.examples, m.id);
    if(m.hint) body+=hintHTML(m.hint);
    body+='<div class="tasks"><div class="th">'+L('lvlTasks')+'</div>';
    (m.tasks||[]).forEach(function(t){
      var on=!!state.done[t.id];
      body+='<div class="task'+(on?' on':'')+'" data-task="'+t.id+'">'
        +'<span class="box"><svg viewBox="0 0 20 20"><path d="M4 10l4 4 8-9"/></svg></span>'
        +'<span class="tx">'+esc(t.text)+'</span>'
        +'<span class="xp">+'+t.xp+' XP</span></div>';
    });
    body+='</div>';
    body+='<div class="mdone-badge">'+L('lvlDone')+'</div>';
    return '<div class="mod'+(done?' done':'')+'" id="'+m.id+'" data-idx="'+idx+'">'
      +'<div class="mhead">'
        +'<div class="mnum"><span class="em">'+(done?'✓':m.num)+'</span></div>'
        +'<div class="mtit"><div class="mt-top"><h2>'+esc(m.title)+'</h2>'+(m.days?'<span class="days">'+esc(m.days)+'</span>':'')+'</div>'
          +'<div class="mprog">'+(tot?('<b>'+cnt+'/'+tot+'</b> '+L('tasks')+' · '+mxp+' XP'):L('info'))+'</div></div>'
        +'<span class="mbadge-xp"></span>'
        +'<span class="chev"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></span>'
      +'</div>'
      +'<div class="mbody">'+body+'</div>'
    +'</div>';
  }

  function render(){
    flat();
    var firstIncomplete=-1;
    for(var i=0;i<C.modules.length;i++){ if(!modDone(C.modules[i])){ firstIncomplete=i; break; } }
    var started = doneCount()>0;
    var html='<div class="pbar" id="pbar"></div>'
      +'<div class="hero">'
        +'<span class="tag">'+esc(cTag())+'</span>'
        +'<h1>'+esc(cTitle())+'</h1>'
        +(cSub()?'<div class="sub">'+esc(cSub())+'</div>':'')
        +(cHero()?'<p>'+esc(cHero())+'</p>':'')
        +'<button class="cta" id="continue">'+(started?L('cont'):L('start'))+'</button>'
      +'</div>'
      +'<div class="ach-shelf"><div class="lab">'+ICON('🏅')+' '+L('ach')+'</div><div class="ach-row" id="ach"></div></div>';
    C.modules.forEach(function(m,i){ html+=moduleHTML(m,i); });
    html+='<div class="foot">'+esc(L('foot')(cTitle()))+'</div>';
    app.innerHTML=html;
    renderBar(); renderAch();
    var openIdx = firstIncomplete<0? 0 : firstIncomplete;
    var mods=app.querySelectorAll(".mod");
    if(mods[openIdx]) mods[openIdx].classList.add("open");
    bind();
    if(TUTOR_ON) initTutor();
  }

  function currentModuleId(){
    var open=app.querySelector(".mod.open");
    if(open) return open.id;
    for(var i=0;i<C.modules.length;i++){ if(!modDone(C.modules[i])) return C.modules[i].id; }
    return C.modules[0] ? C.modules[0].id : "";
  }

  function toggleTask(id){
    var was=!!state.done[id];
    if(was) delete state.done[id]; else { state.done[id]=true; if(state.days.indexOf(todayStr())<0) state.days.push(todayStr()); }
    var tEl=app.querySelector('.task[data-task="'+id+'"]');
    if(tEl) tEl.classList.toggle("on", !was);
    C.modules.forEach(function(m){
      if((m.tasks||[]).some(function(t){return t.id===id;})){
        var mEl=document.getElementById(m.id); var d=modDone(m);
        if(mEl){ mEl.classList.toggle("done", d);
          var cnt=modCount(m), mxp=m.tasks.reduce(function(s,t){return s+t.xp;},0);
          mEl.querySelector(".mprog").innerHTML='<b>'+cnt+'/'+m.tasks.length+'</b> '+L('tasks')+' · '+mxp+' XP';
          mEl.querySelector(".mnum .em").textContent = d? '✓' : m.num;
        }
      }
    });
    renderBar();
    if(!was){
      var newly=checkAchievements();
      newly.forEach(function(a){ showToast(a.em, L('achT')(a.name), L('achSub')); });
      if(newly.some(function(a){return a.cond.all;})) confetti();
    } else {
      C.achievements.forEach(function(a){ if(state.ach[a.id] && !achEarned(a)){ state.ach[a.id]=false; } });
      renderAch();
    }
    detectRankUp();
    scheduleSave();
  }

  var _lastRank=null;
  function detectRankUp(){
    var r=rankFor(xp());
    if(_lastRank && r.name!==_lastRank && r.min>0){
      var prev=C.ranks.filter(function(x){return x.name===_lastRank;})[0];
      if(!prev || r.min>prev.min){ showToast(r.em, L('rankT')(r.name), L('rankSub')); }
    }
    _lastRank=r.name;
  }

  function bind(){
    app.querySelectorAll(".mhead").forEach(function(h){ h.addEventListener("click", function(){ h.parentNode.classList.toggle("open"); }); });
    app.querySelectorAll(".task").forEach(function(t){ t.addEventListener("click", function(){ toggleTask(t.getAttribute("data-task")); }); });
    app.querySelectorAll(".copy").forEach(function(b){
      b.addEventListener("click", function(e){
        e.stopPropagation();
        var txt=decodeURIComponent(b.getAttribute("data-copy")).replace(/<b>|<\/b>/g,"");
        function ok(){ b.classList.add("done"); b.textContent=L('copied'); setTimeout(function(){ b.classList.remove("done"); b.textContent=L('copy'); },1600); }
        if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(txt).then(ok,ok); }
        else { var ta=document.createElement("textarea"); ta.value=txt; document.body.appendChild(ta); ta.select(); try{document.execCommand("copy");}catch(e2){} ta.remove(); ok(); }
      });
    });
    app.querySelectorAll(".ex-chip").forEach(function(ch){
      ch.addEventListener("click", function(e){
        e.stopPropagation();
        var mid=ch.getAttribute("data-ex"), i=+ch.getAttribute("data-i");
        var wrap=ch.parentNode;
        wrap.querySelectorAll(".ex-chip").forEach(function(x){ x.classList.remove("on"); });
        ch.classList.add("on");
        var panel=document.getElementById("ex-panel-"+mid);
        if(panel) panel.innerHTML=exampleBody(mid,i);
      });
    });
    app.querySelectorAll(".hint-ask").forEach(function(btn){
      btn.addEventListener("click", function(e){
        e.stopPropagation();
        var q=decodeURIComponent(btn.getAttribute("data-ask")||"");
        if(!TUTOR_ON) return;
        if(!document.getElementById("tutor-fab")) initTutor();
        var panel=document.getElementById("tutor-panel"); if(panel) panel.hidden=false;
        var ta=document.getElementById("tt-q"); if(ta){ ta.value=q; ta.focus(); }
      });
    });
    var cont=document.getElementById("continue");
    if(cont) cont.addEventListener("click", function(){
      var target=null;
      for(var i=0;i<C.modules.length;i++){ if(!modDone(C.modules[i])){ target=C.modules[i]; break; } }
      if(!target) target=C.modules[0];
      var el=document.getElementById(target.id);
      if(el){ el.classList.add("open"); el.scrollIntoView({behavior:"smooth", block:"start"}); }
    });
  }

  // ---------- ИИ-наставник ----------
  var tutorHist=[];
  function initTutor(){
    if(document.getElementById("tutor-fab")) return;
    var fab=document.createElement("button"); fab.id="tutor-fab"; fab.className="tutor-fab"; fab.innerHTML=ICON('🎓')+' <span>'+L('tFab')+'</span>';
    var panel=document.createElement("div"); panel.id="tutor-panel"; panel.className="tutor-panel"; panel.hidden=true;
    panel.innerHTML=''
      +'<div class="tt-head"><b>'+L('tHeader')+'</b><span class="tt-x" id="tt-x">✕</span></div>'
      +'<div class="tt-msgs" id="tt-msgs"><div class="tt-m bot">'+esc(L('tHi'))+'</div></div>'
      +'<div class="tt-in"><textarea id="tt-q" rows="1" placeholder="'+esc(L('tPh'))+'"></textarea><button id="tt-send">→</button></div>';
    document.body.appendChild(fab); document.body.appendChild(panel);
    fab.addEventListener("click", function(){ panel.hidden=!panel.hidden; if(!panel.hidden) document.getElementById("tt-q").focus(); });
    document.getElementById("tt-x").addEventListener("click", function(){ panel.hidden=true; });
    var q=document.getElementById("tt-q"), send=document.getElementById("tt-send");
    function doSend(){
      var text=(q.value||"").trim(); if(!text) return;
      q.value="";
      addMsg("me", text);
      var typing=addMsg("bot", "…"); typing.classList.add("typing");
      fetch(API+"/tutor",{method:"POST",headers:{"Authorization":"Bearer "+token,"content-type":"application/json"},
        body:JSON.stringify({course:CID, module_id:currentModuleId(), question:text, history:tutorHist.slice(-6), lang:LANG})})
        .then(function(r){return r.json();})
        .then(function(d){ var a=(d&&d.answer)||L('tErrA'); typing.classList.remove("typing"); typing.textContent=a; tutorHist.push({role:"user",content:text}); tutorHist.push({role:"assistant",content:a}); scrollMsgs(); })
        .catch(function(){ typing.classList.remove("typing"); typing.textContent=L('tErrN'); });
      scrollMsgs();
    }
    send.addEventListener("click", doSend);
    q.addEventListener("keydown", function(e){ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); doSend(); } });
  }
  function addMsg(who, text){
    var box=document.getElementById("tt-msgs");
    var m=document.createElement("div"); m.className="tt-m "+(who==="me"?"me":"bot"); m.textContent=text;
    box.appendChild(m); scrollMsgs(); return m;
  }
  function scrollMsgs(){ var box=document.getElementById("tt-msgs"); if(box) box.scrollTop=box.scrollHeight; }

  // ---------- gate / teaser / boot ----------
  function gate(){
    app.innerHTML='<div class="gate"><h2>'+esc(cTitle())+'</h2>'
      +'<p>'+esc(L('gateBody'))+'</p>'
      +'<a class="btn" href="/">'+L('gateBtn')+'</a></div>';
  }
  function teaser(user, t){
    t=t||{};
    var ld=t.landing||null;
    var payUrl=t.pay_url||"";
    if(payUrl){ payUrl += (payUrl.indexOf("?")>=0?"&":"?")+"customer_email="+encodeURIComponent(user.email); }
    var priceTxt = t.price? (t.price+" ₽") : "";
    function buyBtn(label){
      return payUrl
        ? '<a class="tz-buy" href="'+payUrl+'" target="_blank" rel="noopener">'+esc(label)+(priceTxt?' · '+priceTxt:'')+' →</a>'
        : '<a class="tz-buy" href="https://t.me/zalihvat_bot" target="_blank" rel="noopener">'+L('buyHow')+'</a>';
    }
    var tag = t.tag||cTag(), title=t.title||cTitle(), sub=t.subtitle||cSub(), hero=t.hero||cHero();
    var mc=t.modules_count||(t.modules||[]).length, tc=t.tasks_count||0, ac=t.achievements_count||0;

    var html='<div class="hero" style="margin-top:16px">'
        +'<span class="tag">'+esc(tag)+'</span>'
        +'<h1>'+esc(title)+'</h1>'
        +(sub?'<div class="sub">'+esc(sub)+'</div>':'')
        +'<p>'+esc((ld&&ld.promise)||hero||L('heroFb')(mc,tc))+'</p>'
        +buyBtn(L('buyGet'))
        +'<div class="hero-meta">'+L('heroMeta')(mc,tc)+'</div>'
      +'</div>';

    // боли -> решения
    if(ld&&ld.pains&&ld.pains.length){
      html+='<div class="ld-sec"><div class="ld-h">'+L('familiar')+'</div><div class="ld-pains">';
      ld.pains.forEach(function(p){
        html+='<div class="ld-card"><div class="ld-pain"><span class="ld-x">✕</span>'+esc(p.pain)+'</div>'
          +'<div class="ld-fix"><span class="ld-c">✓</span>'+esc(p.fix)+'</div></div>';
      });
      html+='</div></div>';
    }

    // что внутри
    var mods=(t.modules||[]).map(function(m){
      return '<div class="tz-mod"><span class="tz-n">'+(m.em?ICON(m.em):(m.num||"•"))+'</span>'
        +'<div><b>'+esc(m.title||"")+'</b>'+(m.days?' <span class="tz-days">'+esc(m.days)+'</span>':'')
        +'<div class="tz-why">'+esc(m.why||"")+'</div></div></div>';
    }).join("");
    html+='<div class="tz-list"><div class="tz-h">'+L('whatInside')(mc)+'</div>'+mods+'</div>';

    // что получишь
    if(ld&&ld.outcomes&&ld.outcomes.length){
      html+='<div class="ld-sec"><div class="ld-h">'+L('whatGet')+'</div><ul class="ld-out">';
      ld.outcomes.forEach(function(o){ html+='<li>'+esc(o)+'</li>'; });
      html+='</ul></div>';
    }

    // для кого
    if(ld&&ld.audience){
      html+='<div class="ld-aud"><b>'+L('forWhom')+'</b> '+esc(ld.audience)+'</div>';
    }

    // финальный CTA
    html+='<div class="ld-cta">'
      +'<div class="ld-cta-t">'+esc(title)+(priceTxt?' - '+priceTxt:'')+'</div>'
      +'<div class="ld-cta-s">'+esc(L('ctaSub'))+'</div>'
      +buyBtn(L('buyGet'))+'</div>';

    html+='<div class="tz-foot">'+esc(L('paid'))+' <a href="#" id="tz-reload">'+L('refresh')+'</a></div>'
      +'<div class="foot">Залихват · @zalihvat_ai</div>';
    app.innerHTML=html;
    var rl=document.getElementById("tz-reload");
    if(rl) rl.addEventListener("click", function(e){ e.preventDefault(); location.reload(); });
  }
  function boot(user){
    uid=user.id; email=user.email;
    var local=loadLocal();
    if(local) state=Object.assign(state, local);
    pullRemote().then(function(remote){
      if(remote && (!local || (remote.updated||"")>=(local.updated||""))){
        state=Object.assign({v:1,done:{},ach:{},days:[],started:null}, remote);
      }
      if(!state.started){ state.started=new Date().toISOString(); }
      flat();
      _lastRank=rankFor(xp()).name;
      C.achievements.forEach(function(a){ state.ach[a.id]= state.ach[a.id]||achEarned(a); });
      render();
      saveLocal();
    });
  }
  function fail(msg){
    app.innerHTML='<div class="gate"><h2>'+L('failH')+'</h2><p>'+esc(msg||L('failMsg'))+'</p><a class="btn" href="'+location.pathname+'">'+L('refreshBtn')+'</a></div>';
  }

  sb.auth.getSession().then(function(r){
    var s=r&&r.data&&r.data.session;
    if(!(s&&s.user)){ gate(); return; }
    token=s.access_token;
    fetch(API+"/course?course="+encodeURIComponent(CID)+"&lang="+LANG,{headers:{Authorization:"Bearer "+token}})
      .then(function(res){ return res.json(); })
      .then(function(d){
        if(d && d.access && d.course){ C=d.course; boot(s.user); }
        else { teaser(s.user, d && d.teaser); }
      })
      .catch(function(){ fail(L('failNet')); });
  }).catch(function(){ gate(); });
})();
