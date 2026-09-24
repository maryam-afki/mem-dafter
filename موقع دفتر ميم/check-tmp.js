
/* ============================================================
   الخطوة الوحيدة المطلوبة منك: الصقي إعدادات Firebase هنا
   Firebase Console ← Project settings ← Your apps ← Web app
   ============================================================ */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC66x-pNLP8j9IVmQvXcgCGEnqIp-bI-sQ",
  authDomain: "mem-dafter.firebaseapp.com",
  projectId: "mem-dafter",
  storageBucket: "mem-dafter.firebasestorage.app",
  messagingSenderId: "141041018254",
  appId: "1:141041018254:web:b59d4f453d465f678ff0dF"
};

const DAYS = [
  {id:'sun',name:'الأحد'},
  {id:'mon',name:'الاثنين'},
  {id:'tue',name:'الثلاثاء'},
  {id:'wed',name:'الأربعاء'},
  {id:'thu',name:'الخميس'}
];

let db = null, auth = null, currentUid = null, currentEmail = null;
let cloudReady = false, saveTimer = null, firstLoadDone = false;

function firebaseConfigured(){
  return FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey !== "PASTE_HERE";
}

function setStatus(mode, text){
  const el = document.getElementById('saveStatus');
  el.className = 'save-status ' + mode;
  el.textContent = text;
}

function initFirebase(){
  if(!firebaseConfigured()){
    document.getElementById('cfgWarn').classList.remove('hidden');
    setStatus('local','وضع محلي: لم يتم ربط Firebase بعد');
    return;
  }
  try{
    if(typeof firebase === 'undefined'){
      setStatus('local','تعذر تحميل Firebase — تحققي من الإنترنت');
      return;
    }
    firebase.initializeApp(FIREBASE_CONFIG);
    auth = firebase.auth();
    db = firebase.firestore();
    // حفظ offline احتياطي — يتجاهل الخطأ لو تبويب آخر مفتوح
    db.enablePersistence({synchronizeTabs:true}).catch(()=>{});
    cloudReady = true;
    document.getElementById('cfgWarn').classList.add('hidden');
    setStatus('local','تم ربط السحابة — سجلي الدخول');
    auth.onAuthStateChanged(user=>{
      if(user){ enterCloud(user.uid, user.email); }
      else { showLogin(); }
    });
  }catch(e){
    console.error(e);
    setStatus('local','خطأ في إعداد Firebase: '+e.message);
  }
}

function localKey(){ return 'samah_cloud_backup_'+(currentEmail||'nobody'); }

function showLogin(){
  currentUid=null; currentEmail=null; firstLoadDone=false;
  document.getElementById('appBox').classList.add('hidden');
  document.getElementById('loginBox').classList.remove('hidden');
}

async function login(){
  const e = document.getElementById('email').value.trim();
  const p = document.getElementById('password').value;
  const msg = document.getElementById('loginMsg');
  msg.textContent='';
  if(!e||!p){ msg.textContent='اكتبي البريد وكلمة المرور'; return; }
  if(!cloudReady){ msg.textContent='الربط السحابي غير مكتمل — أكملي FIREBASE_CONFIG أولاً'; return; }
  document.getElementById('loginBtn').disabled = true;
  try{
    await auth.signInWithEmailAndPassword(e,p);
    // onAuthStateChanged سيفتح الدفتر
  }catch(err){
    console.error(err);
    if(err.code==='auth/user-not-found') msg.textContent='لا يوجد حساب بهذا البريد — أضيفيه من Firebase أولاً';
    else if(err.code==='auth/wrong-password'||err.code==='auth/invalid-credential') msg.textContent='كلمة المرور غير صحيحة';
    else if(err.code==='auth/invalid-email') msg.textContent='صيغة البريد غير صحيحة';
    else msg.textContent='تعذر الدخول: '+err.message;
  }
  document.getElementById('loginBtn').disabled = false;
}

async function logout(){
  try{ if(auth) await auth.signOut(); }catch(e){}
  document.getElementById('password').value='';
  showLogin();
}

function enterCloud(uid, email){
  currentUid=uid; currentEmail=email; firstLoadDone=false;
  document.getElementById('loginBox').classList.add('hidden');
  document.getElementById('appBox').classList.remove('hidden');
  document.getElementById('who').textContent=email;
  buildDays();
  loadCloud();
}

function buildDays(){
  const wrap=document.getElementById('days');
  wrap.innerHTML='';
  DAYS.forEach(d=>{
    const div=document.createElement('div');
    div.className='day';
    div.innerHTML='<div class="day-h">'+d.name+'</div><div class="day-b">'
      +'<label>هدف اليوم / الموضوع</label><textarea id="d_'+d.id+'_goal"></textarea>'
      +'<label>نشاط المجموعة الكبيرة</label><textarea id="d_'+d.id+'_big"></textarea>'
      +'<label>أنشطة صغيرة ومراكز</label><textarea id="d_'+d.id+'_small"></textarea>'
      +'<label>التواصل مع الأسرة / ملاحظات</label><textarea id="d_'+d.id+'_note"></textarea>'
      +'</div>';
    wrap.appendChild(div);
  });
  document.querySelectorAll('#appBox input,#appBox textarea').forEach(el=>{
    el.addEventListener('input', queueSave);
  });
}

function collect(){
  const g=id=>document.getElementById(id).value;
  const o={info:{teacher:g('f_teacher'),unit:g('f_unit'),class:g('f_class'),week:g('f_week'),date:g('f_date'),schedule:g('f_schedule'),ideas:g('f_ideas'),notes:g('f_notes')},days:{}};
  DAYS.forEach(d=>{
    o.days[d.id]={goal:g('d_'+d.id+'_goal'),big:g('d_'+d.id+'_big'),small:g('d_'+d.id+'_small'),note:g('d_'+d.id+'_note')};
  });
  return o;
}

function fill(o){
  if(!o) return;
  const s=id=>document.getElementById(id);
  s('f_teacher').value=(o.info&&o.info.teacher)||'';
  s('f_unit').value=(o.info&&o.info.unit)||'';
  s('f_class').value=(o.info&&o.info.class)||'';
  s('f_week').value=(o.info&&o.info.week)||'';
  s('f_date').value=(o.info&&o.info.date)||'';
  s('f_schedule').value=(o.info&&o.info.schedule)||'';
  s('f_ideas').value=(o.info&&o.info.ideas)||'';
  s('f_notes').value=(o.info&&o.info.notes)||'';
  DAYS.forEach(d=>{
    const v=(o.days&&o.days[d.id])||{};
    s('d_'+d.id+'_goal').value=v.goal||'';
    s('d_'+d.id+'_big').value=v.big||'';
    s('d_'+d.id+'_small').value=v.small||'';
    s('d_'+d.id+'_note').value=v.note||'';
  });
}

function queueSave(){
  if(!currentUid) return;
  setStatus('busy','جارٍ الحفظ...');
  // نسخة محلية فورية كاحتياط
  try{ localStorage.setItem(localKey(), JSON.stringify(collect())); }catch(e){}
  clearTimeout(saveTimer);
  saveTimer=setTimeout(saveCloud, 800);
}

async function saveCloud(){
  if(!currentUid||!cloudReady) return;
  try{
    await db.collection('preps').doc(currentUid).set({
      email: currentEmail,
      data: collect(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, {merge:true});
    const d=new Date();
    setStatus('cloud','محفوظ على الإنترنت ✓ '+d.toLocaleTimeString('ar'));
  }catch(e){
    console.error(e);
    setStatus('local','تعذر الحفظ السحابي — محفوظ محلياً فقط: '+e.message);
  }
}

async function loadCloud(){
  setStatus('busy','جارٍ تحميل دفترك...');
  let remote=null;
  try{
    const doc=await db.collection('preps').doc(currentUid).get();
    if(doc.exists && doc.data() && doc.data().data) remote=doc.data().data;
  }catch(e){
    console.error(e);
    setStatus('local','تعذر التحميل السحابي — سيتم عرض النسخة المحلية إن وجدت');
  }
  if(remote){ fill(remote); }
  else{
    try{
      const b=localStorage.getItem(localKey());
      if(b) fill(JSON.parse(b));
    }catch(e){}
  }
  firstLoadDone=true;
  // استمع للتحديثات من أجهزة أخرى لنفس الحساب فقط
  try{
    db.collection('preps').doc(currentUid).onSnapshot(doc=>{
      if(!firstLoadDone) return;
      if(!doc.exists) return;
      const d=doc.data();
      if(!d||!d.data) return;
      // لا تعيد الكتابة فوق ما تكتبينه الآن — حدثي فقط لو اختلف والخانات غير مركزة
      const active=document.activeElement;
      const typing=active&&(active.tagName==='TEXTAREA'||active.tagName==='INPUT');
      if(typing) return;
      fill(d.data);
      setStatus('cloud','تم تحديث النسخة من جهاز آخر ✓');
    });
  }catch(e){}
  setStatus('cloud', remote?'محفوظ على الإنترنت ✓':'دفتر جديد — ابدئي الكتابة وسيحفظ تلقائياً');
}

async function clearWeek(){
  if(!confirm('مسح تحضير هذا الأسبوع من حسابك السحابي فقط؟'))return;
  fill({info:{},days:{}});
  try{ localStorage.removeItem(localKey()); }catch(e){}
  if(cloudReady&&currentUid){
    try{ await db.collection('preps').doc(currentUid).delete(); setStatus('cloud','تم المسح من السحابة'); }
    catch(e){ setStatus('local','تعذر المسح السحابي: '+e.message); }
  }
}

function doPrint(){
  if(currentUid&&cloudReady){ saveCloud(); }
  const o=collect();
  const teacher=o.info.teacher||currentEmail||'—';
  document.getElementById('p_meta').innerHTML='المعلمة: <b>'+escapeHtml(teacher)+'</b> • الصف: '+escapeHtml(o.info.class||'—')+' • '+escapeHtml(o.info.week||'')+' • '+escapeHtml(o.info.date||'');
  document.getElementById('p_title').textContent='وحدة: '+(o.info.unit||'—');
  document.getElementById('p_schedule').innerHTML=o.info.schedule?('<b>الجدول:</b><br>'+escapeHtml(o.info.schedule).replace(/\n/g,'<br>')):'';
  document.getElementById('p_ideas').innerHTML=o.info.ideas?('<b>أفكار وأنشطة:</b><br>'+escapeHtml(o.info.ideas).replace(/\n/g,'<br>')):'';
  const tbl=document.getElementById('p_table');
  tbl.querySelectorAll('tr:not(:first-child)').forEach(r=>r.remove());
  DAYS.forEach(d=>{
    const v=o.days[d.id]||{};
    const tr=document.createElement('tr');
    const cell=s=>(s&&s.trim())?escapeHtml(s):'—';
    tr.innerHTML='<td><b>'+d.name+'</b><br>'+cell(v.goal)+'</td><td>'+cell(v.big)+'</td><td>'+cell(v.small)+'</td><td>'+cell(v.note)+'</td>';
    tbl.appendChild(tr);
  });
  const nr=document.createElement('tr');
  nr.innerHTML='<td colspan="4"><b>ملاحظات عامة:</b> '+escapeHtml(o.info.notes||'—')+'</td>';
  tbl.appendChild(nr);
  setTimeout(()=>window.print(),300);
}

function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

document.addEventListener('DOMContentLoaded', initFirebase);
