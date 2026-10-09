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
  function cTitle(){ return (C && C.title) || (PROYAVIT ? "Шажок" : "Курс"); }
  function cSub(){ return (C && C.subtitle) || (PROYAVIT ? "Не жди мотивации - проверяй гипотезы" : ""); }
  function cHero(){ return (C && C.hero) || (PROYAVIT ? "За 21 день проверь одну гипотезу о своей жизни маленькими шажками и реши на своих данных, что работает именно для тебя." : ""); }
  function cTag(){ return (C && C.tag) || (PROYAVIT ? "" : "Курс"); }

  // ---------- i18n ----------
  var LANG = (window.ZH_LANG==="en") ? "en" : "ru";
  var T = {
    ru: {
      start:"Начать →", cont:"Продолжить →", maxRank:"максимальный ранг достигнут",
      tasks:"шагов", days:"дней подряд", ach:"Ачивки", lvlTasks:"Что сделать", info:"справка",
      lvlDone:"✓ Шаг пройден", copy:"Копировать", copied:"Скопировано ✓",
      exTitle:"Примеры под твою сферу", hintTitle:"Подсказка наставника", ask:"Спросить наставника →",
      tHeader:"ИИ-наставник", tHi:"Привет! Спроси что угодно по текущему уроку - помогу и подскажу следующий шаг.",
      tPh:"Твой вопрос по уроку...", tFab:"Наставник",
      tErrA:"Не получилось ответить. Попробуй ещё раз.", tErrN:"Наставник сейчас не отвечает. Попробуй через минуту.",
      gateBody:"Это интерактивная программа внутри кабинета - проходишь шаг за шагом, прогресс сохраняется. Зарегистрируйся или войди, чтобы открыть «Шажок».",
      gateBtn:"Зарегистрироваться / войти →", buyGet:"Получить доступ", buyHow:"Как получить доступ →",
      familiar:"Знакомо?", whatGet:"Что получишь", forWhom:"Для кого:",
      ctaSub:"Пожизненный доступ, прохождение с галочками и XP, ИИ-наставник внутри.",
      paid:"Уже оплатил(а)? Открой курс с той же почтой, что и в кабинете.", refresh:"Обновить доступ",
      failH:"Не удалось загрузить курс", failMsg:"Попробуй обновить страницу.", failNet:"Проверь соединение и обнови страницу.", refreshBtn:"Обновить →",
      achSub:"открыто новое достижение", rankSub:"ты растёшь",
      toRank:function(n,x){return 'до ранга «'+n+'» - '+x+' XP';},
      foot:function(t){return 'Саша Аксенов · «'+t+'»';},
      heroMeta:function(mc,tc){return '21 день · '+mc+' шагов · ИИ-наставник';},
      whatInside:function(mc){return 'Из чего состоит программа';},
      heroFb:function(mc,tc){return '21 день, один эксперимент, честный вывод.';},
      achT:function(n){return 'Ачивка: '+n;}, rankT:function(n){return 'Новый ранг: '+n;}
    },
    en: {
      start:"Start →", cont:"Continue →", maxRank:"top rank reached",
      tasks:"steps", days:"day streak", ach:"Achievements", lvlTasks:"To do", info:"info",
      lvlDone:"✓ Step done", copy:"Copy", copied:"Copied ✓",
      exTitle:"Examples for your field", hintTitle:"Mentor tip", ask:"Ask the mentor →",
      tHeader:"AI mentor", tHi:"Hi! Ask anything about this lesson - I will help and point you to the next step.",
      tPh:"Your question about the lesson...", tFab:"Mentor",
      tErrA:"Could not answer. Try again.", tErrN:"The mentor is not responding. Try again in a minute.",
      gateBody:"This is an interactive program inside your cabinet - you go step by step and your progress is saved. Sign in to open \"Step by Step\".",
      gateBtn:"Sign in →", buyGet:"Get access", buyHow:"How to get access →",
      familiar:"Sound familiar?", whatGet:"What you get", forWhom:"For whom:",
      ctaSub:"Lifetime access, progress with checkboxes and XP, AI mentor inside.",
      paid:"Already paid? Open the course with the same email as in your cabinet.", refresh:"Refresh access",
      failH:"Could not load the course", failMsg:"Try refreshing the page.", failNet:"Check your connection and refresh.", refreshBtn:"Refresh →",
      achSub:"new achievement unlocked", rankSub:"you are leveling up",
      toRank:function(n,x){return 'to rank "'+n+'" - '+x+' XP';},
      foot:function(t){return 'Sasha Aksenov · "'+t+'"';},
      heroMeta:function(mc,tc){return '21 days · '+mc+' steps · AI mentor';},
      whatInside:function(mc){return 'What the program includes';},
      heroFb:function(mc,tc){return '21 days, one experiment, an honest verdict.';},
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
    if(c.expcount){ var en=0; for(var k in state.done){ if(state.done[k] && k.indexOf("-exp")>=0) en++; } return en>=c.expcount; }
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
    var done=doneCount(), total=allTasks.length||1, pct=Math.round(done/total*100);
    document.getElementById("pbar").innerHTML=
      '<div class="pprog"><div class="pprog-top"><span class="pprog-lab">Прогресс программы</span>'
      +'<span class="pprog-num">'+done+' / '+total+' шагов</span></div>'
      +'<div class="pbarline"><i style="width:'+pct+'%"></i></div></div>';
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
  function expHTML(e){
    function row(k,v){ return v? '<div class="exp-row"><span class="exp-k">'+k+'</span><span class="exp-v">'+esc(v)+'</span></div>' : ''; }
    var rows=row('Гипотеза', e.hypothesis)+row('Метрика', e.metric)+row('Срок', e.term)+row('Вывод', e.review);
    var sphere = e.sphere? '<span class="exp-sphere">'+esc(e.sphere)+'</span>' : '';
    return '<div class="exp"><div class="exp-h">'+ICON('🧪')+'<span class="exp-t">'+esc(e.title||'Эксперимент недели')+'</span>'+sphere+'</div>'+rows+'</div>';
  }
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
    var body='';
    if(m.why) body+='<div class="why">'+esc(m.why)+'</div>';
    (m.lessons||[]).forEach(function(l){ body+=lessonHTML(l); });
    if(m.book){ var bh=(m.book.h||"").replace(/^[^0-9A-Za-zА-Яа-яЁё]+/,""); body+='<div class="book"><div class="bh">'+ICON('💡')+' '+esc(bh)+'</div><p>'+esc(m.book.text)+'</p></div>'; }
    if(m.prompt) body+=promptHTML(m.prompt);
    if(m.prompts) m.prompts.forEach(function(p){ body+=promptHTML(p); });
    if(m.examples) body+=examplesHTML(m.examples, m.id);
    if(m.experiment) body+=expHTML(m.experiment);
    if(m.hint) body+=hintHTML(m.hint);
    body+='<div class="tasks"><div class="th">'+L('lvlTasks')+'</div>';
    (m.tasks||[]).forEach(function(t){
      var on=!!state.done[t.id];
      body+='<div class="task'+(on?' on':'')+'" data-task="'+t.id+'">'
        +'<span class="box"><svg viewBox="0 0 20 20"><path d="M4 10l4 4 8-9"/></svg></span>'
        +'<span class="tx">'+esc(t.text)+'</span></div>';
    });
    body+='</div>';
    body+='<div class="mdone-badge">'+L('lvlDone')+'</div>';
    return '<div class="mod'+(done?' done':'')+'" id="'+m.id+'" data-idx="'+idx+'">'
      +'<div class="mhead">'
        +'<div class="mnum"><span class="em">'+(done?'✓':m.num)+'</span></div>'
        +'<div class="mtit"><div class="mt-top"><h2>'+esc(m.title)+'</h2>'+(m.days?'<span class="days">'+esc(m.days)+'</span>':'')+'</div>'
          +'<div class="mprog">'+(tot?('<b>'+cnt+'/'+tot+'</b> '+L('tasks')):L('info'))+'</div></div>'
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
        +(cTag()?'<span class="tag">'+esc(cTag())+'</span>':'')
        +'<h1>'+esc(cTitle())+'</h1>'
        +(cSub()?'<div class="sub">'+esc(cSub())+'</div>':'')
        +(cHero()?'<p>'+esc(cHero())+'</p>':'')
        +'<button class="cta" id="continue">'+(started?L('cont'):L('start'))+'</button>'
      +'</div>';
    C.modules.forEach(function(m,i){ html+=moduleHTML(m,i); });
    html+='<div class="foot">'+esc(L('foot')(cTitle()))+'</div>';
    app.innerHTML=html;
    renderBar();
    var mods=app.querySelectorAll(".mod");
    // «Введение» (первый модуль) не раскрываем автоматически; открываем первый незавершённый из последующих
    if(firstIncomplete>0 && mods[firstIncomplete]) mods[firstIncomplete].classList.add("open");
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
    if(was) delete state.done[id]; else state.done[id]=true;
    var tEl=app.querySelector('.task[data-task="'+id+'"]');
    if(tEl) tEl.classList.toggle("on", !was);
    C.modules.forEach(function(m){
      if((m.tasks||[]).some(function(t){return t.id===id;})){
        var mEl=document.getElementById(m.id); var d=modDone(m);
        if(mEl){ mEl.classList.toggle("done", d);
          var cnt=modCount(m);
          mEl.querySelector(".mprog").innerHTML='<b>'+cnt+'/'+m.tasks.length+'</b> '+L('tasks');
          mEl.querySelector(".mnum .em").textContent = d? '✓' : m.num;
        }
      }
    });
    renderBar();
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
    // Выбери цель -> Проверить (Наставник)
    var gi=document.getElementById("goal-input"), gc=document.getElementById("goal-check"), go=document.getElementById("goal-out");
    if(gi && state.goal_text) gi.value=state.goal_text;
    if(gc && gi) gc.addEventListener("click", function(){
      var g=(gi.value||"").trim(); if(!g){ gi.focus(); return; }
      state.goal_text=g; scheduleSave();
      var gi2=document.getElementById("goal-input2"); if(gi2) gi2.value=g;
      gc.disabled=true; if(go) go.innerHTML='<div class="fld-wait">Наставник проверяет цель...</div>';
      askTutor("Разбери мою цель по SMART. Для каждого из 5 критериев (конкретная, измеримая, достижимая, значимая, с чётким сроком) поставь в начале строки ✅ если критерий выполнен или ❌ если нет, и коротко поясни одной фразой. Для «Достижимая» оценивай срок ГРУБО, месяцами, НЕ считай дни вручную и не придирайся: если до дедлайна есть разумный запас и цель в принципе выполнима - ставь ✅; ❌ ставь только если срок уже прошёл или цель физически невозможна. НЕ задавай мне вопросов. Если чего-то не хватает - строкой «Переформулировка:» дай готовую улучшенную цель одной фразой (сам прими разумные предположения). Если цель уже соответствует SMART - вместо переформулировки напиши отдельной строкой: «Цель готова - переходи к следующему шагу!». Не используй звёздочки и markdown. Моя цель: «"+g+"».", "s1", function(ans){ gc.disabled=false; if(go) go.innerHTML=fmtTutor(ans); });
    });
    // Декомпозиция -> Декомпо! (выбор 3/5/10 гипотез)
    var d2=document.getElementById("goal-input2"), db=document.getElementById("decompo-btn"), dout=document.getElementById("decompo-out");
    var nsel=document.getElementById("nsel");
    if(nsel){
      nsel.addEventListener("click", function(e){
        var b=e.target.closest(".nbtn"); if(!b) return;
        var btns=nsel.querySelectorAll(".nbtn");
        for(var i=0;i<btns.length;i++) btns[i].classList.remove("on");
        b.classList.add("on");
      });
    }
    function decompoN(){ var on=nsel&&nsel.querySelector(".nbtn.on"); var n=on?parseInt(on.getAttribute("data-n"),10):3; return (n>0?n:3); }
    if(d2 && !d2.value && state.goal_text) d2.value=state.goal_text;
    if(db && d2) db.addEventListener("click", function(){
      var g=(d2.value||"").trim(); if(!g){ d2.focus(); return; }
      state.goal_text=g; scheduleSave();
      var N=decompoN();
      db.disabled=true; if(dout) dout.innerHTML='<div class="fld-wait">Наставник раскладывает цель на гипотезы...</div>';
      askTutor("Разбей мою цель на "+N+" гипотез-шажков. Каждая - короткая проверяемая гипотеза с измеримым результатом, желательно в формате «Если я буду [действие], то [показатель] изменится». Моя цель: «"+g+"». Не задавай вопросов - сразу прими разумные предположения. Выдай нумерованный список ровно из "+N+" пунктов, без вступления и заключения, без markdown.", "s1", function(ans){
        db.disabled=false;
        state.hypotheses=ans; scheduleSave();
        var hi0=document.getElementById("hyp-input"); if(hi0) hi0.value=ans;
        if(!dout) return;
        dout.innerHTML='<div class="decompo-res">'+fmtTutor(ans)+'</div><button class="copy2" type="button">'+L('copy')+'</button>';
        var cb=dout.querySelector(".copy2");
        cb.addEventListener("click", function(){
          function ok(){ cb.textContent=L('copied'); setTimeout(function(){ cb.textContent=L('copy'); },1600); }
          if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(ans).then(ok,ok); }
          else { var ta=document.createElement("textarea"); ta.value=ans; document.body.appendChild(ta); ta.select(); try{document.execCommand("copy");}catch(e){} ta.remove(); ok(); }
        });
      });
    });
    // Правильная гипотеза -> Оформить гипотезы (Наставник)
    var hi=document.getElementById("hyp-input"), hf=document.getElementById("hyp-format"), ho=document.getElementById("hyp-out");
    if(hi && !hi.value && state.hypotheses) hi.value=state.hypotheses;
    if(hf && hi) hf.addEventListener("click", function(){
      var t=(hi.value||"").trim(); if(!t){ hi.focus(); return; }
      state.hypotheses=t; scheduleSave();
      hf.disabled=true; if(ho) ho.innerHTML='<div class="fld-wait">Наставник оформляет гипотезы...</div>';
      askTutor("Оформи каждый мой шажок СТРОГО по формуле, слово в слово по структуре: «Я хочу [изменение]. Если я буду [маленькое действие] в течение 21 дня, то [показатель] изменится с [старт] до [цель]». В КАЖДОМ пункте обязательно должны быть все 4 части: «Я хочу…», «Если я буду… в течение 21 дня», «то [показатель] изменится», «с [старт] до [цель]» - с конкретными числами. Если у меня чего-то не хватает (изменения, показателя, старта или цели) - сам придумай разумное измеримое значение, но формулу не ломай и не выдумывай лишних слов. Вот мои шажки:\n"+t+"\nНе задавай вопросов - сразу прими разумные предположения. Выдай готовый нумерованный список шажков строго по формуле, без вступления и без markdown.", "s2", function(ans){
        hf.disabled=false; state.hypotheses_fmt=ans; scheduleSave();
        if(!ho) return;
        ho.innerHTML='<div class="decompo-res">'+fmtTutor(ans)+'</div><button class="copy2" type="button">'+L('copy')+'</button>';
        var cb2=ho.querySelector(".copy2");
        cb2.addEventListener("click", function(){
          function ok(){ cb2.textContent=L('copied'); setTimeout(function(){ cb2.textContent=L('copy'); },1600); }
          if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(ans).then(ok,ok); }
          else { var ta=document.createElement("textarea"); ta.value=ans; document.body.appendChild(ta); ta.select(); try{document.execCommand("copy");}catch(e){} ta.remove(); ok(); }
        });
      });
    });
    // Упростить шажок (Наставник)
    var si=document.getElementById("simplify-input"), sb2=document.getElementById("simplify-btn"), so2=document.getElementById("simplify-out");
    if(sb2 && si) sb2.addEventListener("click", function(){
      var t=(si.value||"").trim(); if(!t){ si.focus(); return; }
      sb2.disabled=true; if(so2) so2.innerHTML='<div class="fld-wait">Наставник упрощает шаг...</div>';
      askTutor("Мой ежедневный шажок и почему я его не делаю: "+t+". НЕ задавай мне вопросов и не проси уточнений - сразу прими разумные предположения и дай ровно 3 конкретные версии того же шага, настолько маленькие, чтобы их было невозможно не сделать. Для каждой версии одной фразой подскажи, как изменить условия, чтобы не пропускать. Коротко, нумерованным списком из 3 пунктов, без вступления, без вопросов, без markdown.", "s3", function(ans){
        sb2.disabled=false; if(!so2) return;
        so2.innerHTML='<div class="decompo-res">'+fmtTutor(ans)+'</div><button class="copy2" type="button">'+L('copy')+'</button>';
        var cb3=so2.querySelector(".copy2");
        cb3.addEventListener("click", function(){
          function ok(){ cb3.textContent=L('copied'); setTimeout(function(){ cb3.textContent=L('copy'); },1600); }
          if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(ans).then(ok,ok); }
          else { var ta=document.createElement("textarea"); ta.value=ans; document.body.appendChild(ta); ta.select(); try{document.execCommand("copy");}catch(e){} ta.remove(); ok(); }
        });
      });
    });
    // Отзыв о курсе
    var rvEmail=document.getElementById("rev-email"), rvName=document.getElementById("rev-name"),
        rvText=document.getElementById("rev-text"), rvSend=document.getElementById("rev-send"), rvOut=document.getElementById("rev-out");
    if(rvEmail) rvEmail.value = email || "";
    if(rvSend && rvText){
      rvSend.addEventListener("click", function(){
        var txt=(rvText.value||"").trim();
        if(!txt){ rvText.focus(); if(rvOut) rvOut.innerHTML='<div class="fld-wait">Напиши пару слов - и жми отправить.</div>'; return; }
        rvSend.disabled=true; if(rvOut) rvOut.innerHTML='<div class="fld-wait">Отправляю...</div>';
        sb.auth.getSession().then(function(r){
          var tk=(r&&r.data&&r.data.session&&r.data.session.access_token)||token; token=tk;
          return fetch(API+"/course/review",{method:"POST",headers:{"Authorization":"Bearer "+tk,"content-type":"application/json"},
            body:JSON.stringify({course:CID, name:(rvName&&rvName.value)||"", text:txt})});
        }).then(function(r){return r.json();})
          .then(function(d){
            rvSend.disabled=false;
            if(d&&d.ok){ if(rvOut) rvOut.innerHTML=''; rvText.value=''; celebrate("Спасибо! Я учту все пожелания 🫶"); }
            else { if(rvOut) rvOut.innerHTML='<div class="fld-wait">Не отправилось, попробуй ещё раз.</div>'; }
          })
          .catch(function(){ rvSend.disabled=false; if(rvOut) rvOut.innerHTML='<div class="fld-wait">Сеть подвела, попробуй ещё раз.</div>'; });
      });
    }
    var cont=document.getElementById("continue");
    if(cont) cont.addEventListener("click", function(){
      var target=null;
      for(var i=0;i<C.modules.length;i++){ if(!modDone(C.modules[i])){ target=C.modules[i]; break; } }
      if(!target) target=C.modules[0];
      var el=document.getElementById(target.id);
      if(el){ el.classList.add("open"); el.scrollIntoView({behavior:"smooth", block:"start"}); }
    });
  }

  function fmtTutor(t){
    var h=esc(t||"");
    h=h.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>");
    h=h.replace(/(^|\n)\s*[-*]\s+/g,"$1• ");
    h=h.replace(/\n/g,"<br>");
    return h;
  }
  function celebrate(msg){
    var ov=document.createElement("div"); ov.className="fw-ov";
    var cv=document.createElement("canvas"); cv.className="fw-cv";
    var card=document.createElement("div"); card.className="fw-card"; card.textContent=msg||"Спасибо!";
    ov.appendChild(cv); ov.appendChild(card); document.body.appendChild(ov);
    var ctx=cv.getContext("2d"), DPR=Math.min(window.devicePixelRatio||1,2), W=0, H=0;
    var parts=[], running=true, t0=Date.now(), iv=null;
    function resize(){ W=cv.width=Math.floor(innerWidth*DPR); H=cv.height=Math.floor(innerHeight*DPR); cv.style.width=innerWidth+"px"; cv.style.height=innerHeight+"px"; }
    function close(){ running=false; if(iv){ clearInterval(iv); iv=null; } window.removeEventListener("resize", resize); if(ov.parentNode) ov.parentNode.removeChild(ov); }
    var colors=["#ff7f50","#e85f2c","#2f9e60","#ffd43b","#4dabf7","#f06595"];
    function burst(cx,cy){ for(var i=0;i<46;i++){ var a=6.283*i/46, sp=(2+Math.random()*4)*DPR; parts.push({x:cx,y:cy,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:1,col:colors[(Math.random()*colors.length)|0]}); } }
    function salvo(){ if(running) burst((0.2+Math.random()*0.6)*W,(0.18+Math.random()*0.4)*H); }
    resize(); window.addEventListener("resize", resize); ov.addEventListener("click", close);
    salvo(); iv=setInterval(salvo, 350);
    (function loop(){
      ctx.clearRect(0,0,W,H);
      for(var i=parts.length-1;i>=0;i--){ var p=parts[i]; p.vy+=0.06*DPR; p.x+=p.vx; p.y+=p.vy; p.vx*=0.99; p.life-=0.014;
        if(p.life<=0){ parts.splice(i,1); continue; }
        ctx.globalAlpha=Math.max(p.life,0); ctx.fillStyle=p.col; ctx.beginPath(); ctx.arc(p.x,p.y,3*DPR,0,6.283); ctx.fill(); }
      ctx.globalAlpha=1;
      if(Date.now()-t0>4200 && iv){ clearInterval(iv); iv=null; }
      if(!running) return;
      if(iv===null && parts.length===0){ close(); return; }
      requestAnimationFrame(loop);
    })();
    setTimeout(close, 8000);
  }
  function askTutor(question, module_id, done){
    sb.auth.getSession().then(function(r){
      var tk=(r&&r.data&&r.data.session&&r.data.session.access_token)||token; token=tk;
      return fetch(API+"/tutor",{method:"POST",headers:{"Authorization":"Bearer "+tk,"content-type":"application/json"},
        body:JSON.stringify({course:CID, module_id:module_id||"", question:question, history:[], lang:LANG})});
    }).then(function(r){return r.json();})
      .then(function(d){ done((d&&d.answer)||"Не получилось, попробуй ещё раз."); })
      .catch(function(){ done("Наставник сейчас не отвечает, попробуй через минуту."); });
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
      +'<div class="tt-chips" id="tt-chips"></div>'
      +'<div class="tt-in"><textarea id="tt-q" rows="1" placeholder="'+esc(L('tPh'))+'"></textarea><button id="tt-send">→</button></div>';
    document.body.appendChild(fab); document.body.appendChild(panel);
    if(PROYAVIT){
      var starters = (LANG==="en") ? [
        ["🔬 Hypothesis","Help me frame a hypothesis (If X in conditions Y, metric Z changes) for: "],
        ["🪜 Smaller step","How do I make my step tiny enough not to skip it: "],
        ["📊 Metric","Which one metric should I track for: "]
      ] : [
        ["🔬 Гипотеза","Помоги собрать гипотезу «Если X при Y → метрика Z» для: "],
        ["🪜 Шаг меньше","Как сделать мой шажок настолько маленьким, чтобы не пропускать: "],
        ["📊 Метрика","Какую одну метрику выбрать, чтобы измерить: "]
      ];
      var chipsEl=document.getElementById("tt-chips");
      chipsEl.innerHTML=starters.map(function(s,i){ return '<button class="tt-chip" data-i="'+i+'">'+esc(s[0])+'</button>'; }).join("");
      chipsEl.querySelectorAll(".tt-chip").forEach(function(b){
        b.addEventListener("click", function(){
          var tpl=starters[+b.getAttribute("data-i")][1];
          var ta=document.getElementById("tt-q"); ta.value=tpl; ta.focus();
          ta.setSelectionRange(ta.value.length, ta.value.length);
        });
      });
    }
    fab.addEventListener("click", function(){ panel.hidden=!panel.hidden; if(!panel.hidden) document.getElementById("tt-q").focus(); });
    document.getElementById("tt-x").addEventListener("click", function(){ panel.hidden=true; });
    var q=document.getElementById("tt-q"), send=document.getElementById("tt-send");
    function doSend(){
      var text=(q.value||"").trim(); if(!text) return;
      q.value="";
      addMsg("me", text);
      var typing=addMsg("bot", "…"); typing.classList.add("typing");
      sb.auth.getSession().then(function(r){
        var tk=(r&&r.data&&r.data.session&&r.data.session.access_token)||token; token=tk;
        return fetch(API+"/tutor",{method:"POST",headers:{"Authorization":"Bearer "+tk,"content-type":"application/json"},
          body:JSON.stringify({course:CID, module_id:currentModuleId(), question:text, history:tutorHist.slice(-6), lang:LANG})});
      })
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
    var nx=encodeURIComponent(location.pathname||"/step-by-step");
    app.innerHTML='<div class="gate"><h2>'+esc(cTitle())+'</h2>'
      +'<div class="gate-free">🎁 Первые 10 мест - бесплатно!<br>Мне очень важно ваше мнение о Шажке :)</div>'
      +'<p>'+esc(L('gateBody'))+'</p>'
      +'<a class="btn" href="/?next='+nx+'">'+L('gateBtn')+'</a></div>';
  }
  function teaser(user, t){
    t=t||{};
    var ld=t.landing||null;
    var payUrl=t.pay_url||"";
    if(payUrl){ payUrl += (payUrl.indexOf("?")>=0?"&":"?")+"customer_email="+encodeURIComponent(user.email); }
    var priceTxt = t.price? (t.price+" ₽") : "";
    var oldTxt = (t.old_price && t.old_price>(t.price||0)) ? (t.old_price+" ₽") : "";
    function priceFrag(){ return oldTxt ? '<s class="tz-old">'+oldTxt+'</s> <b>'+priceTxt+'</b>' : priceTxt; }
    function buyBtn(label){
      return payUrl
        ? '<a class="tz-buy" href="'+payUrl+'" target="_blank" rel="noopener">'+esc(label)+(priceTxt?' · '+priceFrag():'')+' →</a>'
        : '<a class="tz-buy" href="https://t.me/zalihvat_bot" target="_blank" rel="noopener">'+L('buyHow')+'</a>';
    }
    var tag = t.tag||cTag(), title=t.title||cTitle(), sub=t.subtitle||cSub(), hero=t.hero||cHero();
    var mc=t.modules_count||(t.modules||[]).length, tc=t.tasks_count||0, ac=t.achievements_count||0;

    var html='<div class="hero" style="margin-top:16px">'
        +(tag?'<span class="tag">'+esc(tag)+'</span>':'')
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
      +'<div class="ld-cta-t">'+esc(title)+(priceTxt?' - '+priceFrag():'')+'</div>'
      +'<div class="ld-cta-s">'+esc(L('ctaSub'))+'</div>'
      +buyBtn(L('buyGet'))+'</div>';

    html+='<div class="tz-foot">'+esc(L('paid'))+' <a href="#" id="tz-reload">'+L('refresh')+'</a></div>'
      +'<div class="foot">Саша Аксенов</div>';
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
