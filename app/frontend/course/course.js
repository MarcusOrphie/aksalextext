/* Движок курса «Проявить себя». Рендер + прогресс + XP/ранги + ачивки + сохранение. */
(function () {
  "use strict";
  var cfg = window.ZCFG || {};
  var sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  var API = cfg.API_BASE || "/api";
  var C = null;                       // контент курса приходит с бэкенда после проверки доступа
  var app = document.getElementById("app");

  var uid = null, email = null;
  var state = { v: 1, done: {}, ach: {}, days: [], started: null, updated: null };
  var saveTimer = null, allTasks = [], totalXpMax = 0;

  // ---------- utils ----------
  function esc(s){ return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
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
    // допускаем, что сегодня ещё без активности — тогда считаем от вчера
    if(!set[todayStr()]) d.setDate(d.getDate()-1);
    for(;;){ var k=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); if(set[k]){ n++; d.setDate(d.getDate()-1); } else break; }
    return n;
  }

  // ---------- persistence ----------
  function lsKey(){ return "zh_course_"+(uid||"anon"); }
  function saveLocal(){ try{ localStorage.setItem(lsKey(), JSON.stringify(state)); }catch(e){} }
  function loadLocal(){ try{ var s=localStorage.getItem(lsKey()); if(s) return JSON.parse(s); }catch(e){} return null; }
  function scheduleSave(){
    saveLocal();
    if(saveTimer) clearTimeout(saveTimer);
    saveTimer=setTimeout(pushRemote, 900);
  }
  function pushRemote(){
    if(!uid) return;
    state.updated=new Date().toISOString();
    try{
      var blob=new Blob([JSON.stringify(state)],{type:"application/json"});
      sb.storage.from("uploads").upload(uid+"/_course.json", blob, {upsert:true, contentType:"application/json"});
    }catch(e){}
  }
  function pullRemote(){
    return sb.storage.from("uploads").download(uid+"/_course.json")
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
  function showToast(em, tt, ts){
    toastQ.push([em,tt,ts]);
    if(!toastBusy) nextToast();
  }
  function nextToast(){
    if(!toastQ.length){ toastBusy=false; return; }
    toastBusy=true;
    var it=toastQ.shift();
    toast.querySelector(".em").textContent=it[0];
    toast.querySelector(".tt").textContent=it[1];
    toast.querySelector(".ts").textContent=it[2];
    toast.classList.add("show");
    setTimeout(function(){ toast.classList.remove("show"); setTimeout(nextToast, 350); }, 2600);
  }
  function confetti(){
    var cols=["#ff7f50","#e85f2c","#151210","#ffe6d8","#2f9e60"];
    for(var i=0;i<70;i++){
      (function(){
        var c=document.createElement("div"); c.className="cf";
        c.style.left=(Math.random()*100)+"vw";
        c.style.background=cols[i%cols.length];
        var dur=(1.6+Math.random()*1.4), delay=Math.random()*0.5;
        c.style.transition="transform "+dur+"s ease-in, opacity "+dur+"s ease-in";
        c.style.transitionDelay=delay+"s";
        c.style.transform="translateY(0) rotate(0deg)";
        c.style.borderRadius=(Math.random()<.5?"2px":"50%");
        document.body.appendChild(c);
        requestAnimationFrame(function(){
          c.style.transform="translateY("+(window.innerHeight+40)+"px) rotate("+(Math.random()*720-360)+"deg)";
          c.style.opacity="0.2";
        });
        setTimeout(function(){ c.remove(); }, (dur+delay)*1000+200);
      })();
    }
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
    var el=document.getElementById("pbar");
    el.innerHTML=
      '<div class="ring">'+ring(pct)+'<span class="pct">'+pct+'%</span></div>'
      +'<div class="pmeta">'
        +'<div class="rank">'+rk.em+' '+esc(rk.name)+' <small>· '+x+' XP</small></div>'
        +'<div class="sub">'+(nr? ('до ранга «'+esc(nr.name)+'» — '+toNext+' XP') : 'максимальный ранг достигнут 🔥')+'</div>'
        +'<div class="xpwrap"><i style="width:'+fill+'%"></i></div>'
      +'</div>'
      +'<div class="pstat"><b>'+doneCount()+'</b><span>задач</span></div>'
      +'<div class="pstat"><b>'+st+'</b><span>дней подряд</span></div>';
  }
  function renderAch(){
    var el=document.getElementById("ach"); if(!el) return;
    el.innerHTML=C.achievements.map(function(a){
      var got=state.ach[a.id];
      return '<div class="ach'+(got?' got':'')+'"><div class="med">'+(got?a.em:'🔒')+'</div><span class="an">'+esc(a.name)+'</span></div>';
    }).join("");
  }
  function promptHTML(p){
    return '<div class="prompt"><div class="ph"><span class="ic">✦</span><span class="t">'+esc(p.title)+'</span>'
      +'<button class="copy" data-copy="'+encodeURIComponent(p.text)+'">Копировать</button></div>'
      +'<pre>'+p.text.replace(/</g,"").replace(/b>/g,"<b>").replace(/\/b>/g,"</b>").replace(//g,"&lt;")+'</pre></div>';
  }
  function lessonHTML(l){ return '<h3><span class="dot">◆</span> '+esc(l.h)+'</h3>'+l.body; }
  function moduleHTML(m, idx){
    var cnt=modCount(m), tot=(m.tasks||[]).length, done=modDone(m);
    var mxp=(m.tasks||[]).reduce(function(s,t){return s+t.xp;},0);
    var body='';
    body+='<div class="why">'+esc(m.why)+'</div>';
    (m.lessons||[]).forEach(function(l){ body+=lessonHTML(l); });
    if(m.book) body+='<div class="book"><div class="bh">'+esc(m.book.h)+'</div><p>'+esc(m.book.text)+'</p></div>';
    if(m.prompt) body+=promptHTML(m.prompt);
    if(m.prompts) m.prompts.forEach(function(p){ body+=promptHTML(p); });
    body+='<div class="tasks"><div class="th">Задачи уровня</div>';
    (m.tasks||[]).forEach(function(t){
      var on=!!state.done[t.id];
      body+='<div class="task'+(on?' on':'')+'" data-task="'+t.id+'">'
        +'<span class="box"><svg viewBox="0 0 20 20"><path d="M4 10l4 4 8-9"/></svg></span>'
        +'<span class="tx">'+esc(t.text)+'</span>'
        +'<span class="xp">+'+t.xp+' XP</span></div>';
    });
    body+='</div>';
    body+='<div class="mdone-badge">✓ Уровень пройден — красавчик!</div>';
    return '<div class="mod'+(done?' done':'')+'" id="'+m.id+'" data-idx="'+idx+'">'
      +'<div class="mhead">'
        +'<div class="mnum"><span class="em">'+(done?'✓':m.num)+'</span></div>'
        +'<div class="mtit"><div class="mt-top"><h2>'+esc(m.title)+'</h2>'+(m.days?'<span class="days">'+esc(m.days)+'</span>':'')+'</div>'
          +'<div class="mprog">'+(tot?('<b>'+cnt+'/'+tot+'</b> задач · '+mxp+' XP'):'информация')+'</div></div>'
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
    var html='<div class="pbar" id="pbar"></div>';
    // hero
    var started = doneCount()>0;
    html+='<div class="hero">'
      +'<span class="tag">Курс-игра · Залихват</span>'
      +'<h1>Проявить себя</h1>'
      +'<div class="sub">Пройди игру — и стань тем, кого видят и слышат</div>'
      +'<p>13 уровней-квестов: от «страшно показаться» до системного блога с целью, стратегией и первым выпущенным рилз. Отмечай задачи — копи XP, повышай ранг, открывай ачивки. Прогресс сохраняется и синхронизируется между устройствами.</p>'
      +'<button class="cta" id="continue">'+(started?'Продолжить →':'Начать игру →')+'</button>'
      +'</div>';
    html+='<div class="ach-shelf"><div class="lab">🏅 Ачивки</div><div class="ach-row" id="ach"></div></div>';
    C.modules.forEach(function(m,i){ html+=moduleHTML(m,i); });
    html+='<div class="foot">Залихват · @zalihvat_ai · курс «Проявить себя»</div>';
    app.innerHTML=html;
    renderBar(); renderAch();

    // open first incomplete
    var openIdx = firstIncomplete<0? 0 : firstIncomplete;
    var mods=app.querySelectorAll(".mod");
    if(mods[openIdx]) mods[openIdx].classList.add("open");

    bind();
  }

  function toggleTask(id){
    var was=!!state.done[id];
    if(was) delete state.done[id]; else { state.done[id]=true; if(state.days.indexOf(todayStr())<0) state.days.push(todayStr()); }
    // update DOM minimally
    var tEl=app.querySelector('.task[data-task="'+id+'"]');
    if(tEl) tEl.classList.toggle("on", !was);
    // module done state
    C.modules.forEach(function(m){
      if((m.tasks||[]).some(function(t){return t.id===id;})){
        var mEl=document.getElementById(m.id); var d=modDone(m);
        if(mEl){ mEl.classList.toggle("done", d);
          var cnt=modCount(m), tot=m.tasks.length, mxp=m.tasks.reduce(function(s,t){return s+t.xp;},0);
          mEl.querySelector(".mprog").innerHTML='<b>'+cnt+'/'+tot+'</b> задач · '+mxp+' XP';
          mEl.querySelector(".mnum .em").textContent = d? '✓' : m.num;
        }
      }
    });
    renderBar();
    if(!was){
      var newly=checkAchievements();
      newly.forEach(function(a){ showToast(a.em, "Ачивка: "+a.name, "+"+"открыто новое достижение"); });
      // rank up?
      var before=rankFor(xp()-0); // recompute handled in renderBar; detect via stored
      if(newly.some(function(a){return a.cond.all;})) confetti();
    } else {
      // recheck (снятие галочки может отобрать ачивку)
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
      var prevMin = C.ranks.filter(function(x){return x.name===_lastRank;})[0];
      if(!prevMin || r.min>prevMin.min){ showToast(r.em, "Новый ранг: "+r.name, "ты растёшь 🚀"); }
    }
    _lastRank=r.name;
  }

  function bind(){
    app.querySelectorAll(".mhead").forEach(function(h){
      h.addEventListener("click", function(){ h.parentNode.classList.toggle("open"); });
    });
    app.querySelectorAll(".task").forEach(function(t){
      t.addEventListener("click", function(){ toggleTask(t.getAttribute("data-task")); });
    });
    app.querySelectorAll(".copy").forEach(function(b){
      b.addEventListener("click", function(e){
        e.stopPropagation();
        var txt=decodeURIComponent(b.getAttribute("data-copy")).replace(/<b>|<\/b>/g,"");
        function ok(){ b.classList.add("done"); b.textContent="Скопировано ✓"; setTimeout(function(){ b.classList.remove("done"); b.textContent="Копировать"; },1600); }
        if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(txt).then(ok,ok); }
        else { var ta=document.createElement("textarea"); ta.value=txt; document.body.appendChild(ta); ta.select(); try{document.execCommand("copy");}catch(e2){} ta.remove(); ok(); }
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

  // ---------- gate (не залогинен) ----------
  function gate(){
    app.innerHTML='<div class="gate"><h2>Курс «Проявить себя»</h2>'
      +'<p>Это интерактивный курс-игра внутри кабинета — с прохождением, галочками, XP и ачивками. Войди в кабинет Залихват, чтобы открыть курс и сохранять прогресс.</p>'
      +'<a class="btn" href="/">Войти в кабинет →</a></div>';
  }

  // ---------- тизер (залогинен, но без доступа) ----------
  function teaser(user, t){
    t=t||{};
    var payUrl=t.pay_url||"";
    if(payUrl){ payUrl += (payUrl.indexOf("?")>=0?"&":"?")+"customer_email="+encodeURIComponent(user.email); }
    var mods=(t.modules||[]).map(function(m){
      return '<div class="tz-mod"><span class="tz-n">'+(m.em||m.num||"•")+'</span>'
        +'<div><b>'+esc(m.title||"")+'</b>'+(m.days?' <span class="tz-days">'+esc(m.days)+'</span>':'')
        +'<div class="tz-why">'+esc(m.why||"")+'</div></div></div>';
    }).join("");
    var priceTxt = t.price? (t.price+" ₽") : "";
    var btn = payUrl
      ? '<a class="tz-buy" href="'+payUrl+'" target="_blank" rel="noopener">Получить доступ'+(priceTxt?' · '+priceTxt:'')+' →</a>'
      : '<a class="tz-buy" href="https://t.me/zalihvat_bot" target="_blank" rel="noopener">Как получить доступ →</a>';
    app.innerHTML=
      '<div class="hero" style="margin-top:16px">'
        +'<span class="tag">Курс-игра · Залихват</span>'
        +'<h1>Проявить себя</h1>'
        +'<div class="sub">Пройди игру — и стань тем, кого видят и слышат</div>'
        +'<p>С нуля до системного блога: '+ (t.modules_count||13) +' уровней-квестов, '+(t.tasks_count||42)+' заданий с галочками, XP, ранги и '+(t.achievements_count||12)+' ачивок. Готовые промпты, вшитые в каждый уровень. Кем бы ты ни был — мама, эксперт, домохозяйка — курс проведёт за руку.</p>'
        +btn
      +'</div>'
      +'<div class="tz-list"><div class="tz-h">Что внутри — '+(t.modules_count||13)+' уровней</div>'+mods+'</div>'
      +'<div class="tz-foot">Уже оплатил(а)? Открой курс с той же почтой, что и в кабинете. '
        +'<a href="#" id="tz-reload">Обновить доступ</a></div>'
      +'<div class="foot">Залихват · @zalihvat_ai</div>';
    var rl=document.getElementById("tz-reload");
    if(rl) rl.addEventListener("click", function(e){ e.preventDefault(); location.reload(); });
  }

  // ---------- boot (есть доступ, C уже загружен) ----------
  function boot(user){
    uid=user.id; email=user.email;
    var local=loadLocal();
    if(local) state=Object.assign(state, local);
    pullRemote().then(function(remote){
      if(remote && (!local || (remote.updated||"")>=(local.updated||""))){
        state=Object.assign({v:1,done:{},ach:{},days:[],started:null}, remote);
      }
      if(!state.started){ state.started=new Date().toISOString(); }
      if(state.days.indexOf(todayStr())<0){ /* активный день добавим при первом действии */ }
      flat();
      _lastRank=rankFor(xp()).name;
      // подчистим ачивки под фактическое состояние
      C.achievements.forEach(function(a){ state.ach[a.id]= state.ach[a.id]||achEarned(a); });
      render();
      saveLocal();
    });
  }

  function fail(msg){
    app.innerHTML='<div class="gate"><h2>Не удалось загрузить курс</h2><p>'+esc(msg||"Попробуй обновить страницу.")+'</p><a class="btn" href="/course">Обновить →</a></div>';
  }

  sb.auth.getSession().then(function(r){
    var s=r&&r.data&&r.data.session;
    if(!(s&&s.user)){ gate(); return; }
    var token=s.access_token;
    fetch(API+"/course",{headers:{Authorization:"Bearer "+token}})
      .then(function(res){ return res.json(); })
      .then(function(d){
        if(d && d.access && d.course){ C=d.course; boot(s.user); }
        else { teaser(s.user, d && d.teaser); }
      })
      .catch(function(){ fail("Проверь соединение и обнови страницу."); });
  }).catch(function(){ gate(); });
})();
