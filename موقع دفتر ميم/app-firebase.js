/* ============================================================================
   app-firebase.js — ربط «دفتر التحضير اليومي» (تصميم سِمة) بالحفظ السحابي
   - دخول حقيقي لكل معلمة (بريد + كلمة مرور عبر Firebase Authentication)
   - حفظ كل معلمة في مساحتها الخاصة: data/users/{uid}/prep/... ولا ترى غيرها
   - أول دخول يرفع ما كان محفوظًا على الجهاز تلقائيًا (الدفتر نفسه يتكفل بهذا)
   - عند تبدّل الحساب على نفس الجهاز تُمسح الذاكرة المحلية مؤقتًا للخصوصية
   ============================================================================ */
(function () {
  'use strict';

  /* ---- إعدادات مشروع Firebase (نفس مشروع ميم دفتر) ---- */
  var FIREBASE_CONFIG = {
    apiKey: "AIzaSyC6Gx-pNlP8j9IvMQvXcgCGEnqIp-bI-sQ",
    authDomain: "mem-dafter.firebaseapp.com",
    projectId: "mem-dafter",
    storageBucket: "mem-dafter.firebasestorage.app",
    messagingSenderId: "141041018254",
    appId: "1:141041018254:web:b59d4f453d465f678ff0dF"
  };
  var LAST_UID_KEY = 'samah.fb.lastUid';

  /* ---- أدوات ---- */
  function $(s, r) { return (r || document).querySelector(s); }
  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  function waitFor(cond, cb, timeout) {
    var t0 = Date.now(), lim = timeout || 20000;
    (function tick() {
      var v = null;
      try { v = cond(); } catch (e) {}
      if (v) { cb(v); return; }
      if (Date.now() - t0 > lim) { cb(null); return; }
      setTimeout(tick, 150);
    })();
  }

  /* ---- محوّل Firestore بنفس واجهة الدفتر (نسخة طبق الأصل من تصميمه) ---- */
  function fbClean(o) { return JSON.parse(JSON.stringify(o)); }
  function fbSeg(s) { return String(s).replace(/[^A-Za-z0-9_\-.~:@+]/g, '_').slice(0, 190) || 'x'; }
  function fbAdapter(db, uid, onFirstWeeks) {
    var base = db.doc('data/users/' + uid + '/prep');
    function col(n) { return base.collection(fbSeg(n)); }
    function wrap(d) {
      return { id: d.id, exists: d.exists, data: function () { return d.exists ? fbClean(d.data()) : undefined; } };
    }
    var weeksFired = false;
    return {
      doc: function (path) {
        var i = path.indexOf('/'), c = path.slice(0, i), id = path.slice(i + 1);
        var ref = col(c).doc(fbSeg(id));
        return {
          set: function (o) { return ref.set(fbClean(o)); },
          update: function (o) { return ref.update(fbClean(o)); },
          delete: function () { return ref.delete(); },
          get: function () { return ref.get().then(function (s) { return { exists: s.exists, data: function () { return s.exists ? fbClean(s.data()) : undefined; } }; }); }
        };
      },
      collection: function (name) {
        return {
          onSnapshot: function (cb, errCb) {
            return col(name).onSnapshot(function (snap) {
              if (name === 'weeks' && !weeksFired) { weeksFired = true; try { onFirstWeeks(); } catch (e) {} }
              cb({ docs: snap.docs.map(wrap) });
            }, function (err) { if (errCb) errCb(err); });
          },
          get: function () { return col(name).get().then(function (snap) { return { docs: snap.docs.map(wrap) }; }); }
        };
      }
    };
  }

  /* ---- مسح الذاكرة المحلية عند تبدّل الحساب (خصوصية) ---- */
  function wipeLocalCache(done) {
    try {
      var rm = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('samah.') === 0) rm.push(k);
      }
      rm.forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
      try { localStorage.removeItem(LAST_UID_KEY); } catch (e) {}
    } catch (e) {}
    var dbs = [];
    try {
      if (indexedDB.databases) {
        indexedDB.databases().then(function (list) {
          (list || []).forEach(function (d) { if (d && d.name && d.name.indexOf('samah-files') >= 0) dbs.push(d.name); });
          dbs.forEach(function (n) { try { indexedDB.deleteDatabase(n); } catch (e) {} });
          setTimeout(done, 400);
        }).catch(function () { done(); });
        return;
      }
    } catch (e) {}
    ['samah-files', 'samah.local.samah-files'].forEach(function (n) { try { indexedDB.deleteDatabase(n); } catch (e) {} });
    setTimeout(done, 400);
  }

  /* ---- واجهة الدخول (تظهر فوق صفحة الدفتر) ---- */
  var overlay = null, msgEl = null, statusEl = null;
  function buildOverlay() {
    if (document.getElementById('fb-gate')) return;
    overlay = document.createElement('div');
    overlay.id = 'fb-gate';
    overlay.setAttribute('dir', 'rtl');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:80;background:rgba(28,25,22,.55);display:flex;align-items:center;justify-content:center;padding:16px;font-family:Tahoma,Arial,sans-serif';
    overlay.innerHTML =
      '<div style="width:100%;max-width:420px;background:#FBF7EF;border-radius:18px;padding:26px 24px;box-shadow:0 20px 60px rgba(0,0,0,.4);text-align:center;color:#38312A">' +
      '<img src="samah-logo-dark.png" alt="سمة للأطفال" style="width:120px;background:#fff;border-radius:12px;padding:6px" onerror="this.style.display=\'none\'">' +
      '<h2 style="margin:12px 0 4px;font-size:20px">دخول المعلمات</h2>' +
      '<p style="margin:0 0 14px;font-size:12.5px;color:#8A8172">كل معلمة تدخل ببريدها الخاص — تحضيرها في حسابها ولا تراه غيرها</p>' +
      '<div id="fb-form">' +
      '<input id="fb-email" type="email" dir="ltr" placeholder="noura@samah.edu" style="width:100%;font-size:14px;padding:10px;border:1.5px solid #D9CFB6;border-radius:10px;margin-bottom:10px;font-family:inherit">' +
      '<input id="fb-pass" type="password" placeholder="كلمة المرور" style="width:100%;font-size:14px;padding:10px;border:1.5px solid #D9CFB6;border-radius:10px;font-family:inherit">' +
      '<p id="fb-msg" style="min-height:20px;font-size:12.5px;color:#a33;margin:8px 0"></p>' +
      '<button id="fb-go" style="width:100%;background:#38312A;color:#fff;border:none;border-radius:10px;padding:12px;font-size:15px;font-weight:bold;cursor:pointer;font-family:inherit">دخول إلى دفتري</button>' +
      '<button id="fb-local" style="margin-top:10px;background:none;border:none;color:#75825E;font-size:13px;cursor:pointer;text-decoration:underline;font-family:inherit">المتابعة على هذا الجهاز فقط (بدون حساب)</button>' +
      '</div>' +
      '<p id="fb-status" style="display:none;font-size:13px;color:#5E6A44;margin:10px 0 0"></p>' +
      '</div>';
    document.body.appendChild(overlay);
    msgEl = document.getElementById('fb-msg');
    statusEl = document.getElementById('fb-status');
    document.getElementById('fb-go').addEventListener('click', doLogin);
    document.getElementById('fb-pass').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
    document.getElementById('fb-local').addEventListener('click', function () { removeOverlay(); clickGate(); });
  }
  function say(t) { if (msgEl) msgEl.textContent = t || ''; }
  function busy(t) {
    if (!statusEl) return;
    statusEl.style.display = 'block';
    statusEl.textContent = t;
    var f = document.getElementById('fb-form');
    if (f) f.style.display = 'none';
  }
  function removeOverlay() { if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); overlay = null; }
  function clickGate() {
    try {
      var gate = document.getElementById('gate');
      var g = document.getElementById('gGo');
      if (gate && !gate.hidden && g && !g.hidden) g.click();
    } catch (e) {}
  }

  /* ---- شارة الحساب وزر الخروج ---- */
  function accountChip(email) {
    if (document.getElementById('fb-acct')) return;
    var c = document.createElement('div');
    c.id = 'fb-acct';
    c.setAttribute('dir', 'rtl');
    c.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:40;background:#38312A;color:#F7F1E3;font-size:12px;border-radius:99px;padding:7px 8px 7px 7px;display:flex;align-items:center;gap:8px;box-shadow:0 6px 20px rgba(0,0,0,.3);font-family:Tahoma,Arial,sans-serif;max-width:70vw';
    var s = document.createElement('span');
    s.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    s.textContent = email;
    var b = document.createElement('button');
    b.textContent = 'خروج';
    b.style.cssText = 'background:#C9A876;color:#38312A;border:none;border-radius:99px;padding:5px 14px;font-size:12px;font-weight:bold;cursor:pointer;font-family:inherit';
    b.addEventListener('click', function () {
      try {
        if (window.__fb_flush) { try { window.__fb_flush(); } catch (e) {} }
        firebase.auth().signOut();
      } catch (e) {}
      setTimeout(function () { location.reload(); }, 400);
    });
    c.appendChild(s); c.appendChild(b);
    document.body.appendChild(c);
  }

  /* ---- منطق الدخول ---- */
  var auth = null, db = null, attached = false;

  function authError(e) {
    var c = (e && e.code) || '';
    if (c === 'auth/user-not-found') return 'لا يوجد حساب بهذا البريد — أضيفيه من Firebase أولاً';
    if (c === 'auth/wrong-password' || c === 'auth/invalid-credential') return 'كلمة المرور غير صحيحة';
    if (c === 'auth/invalid-email') return 'صيغة البريد غير صحيحة';
    if (c === 'auth/api-key-not-valid') return 'مفتاح الربط غير صالح — أخبرِي المديرة';
    if (c === 'auth/network-request-failed') return 'تعذّر الاتصال — تحققي من الإنترنت';
    return 'تعذّر الدخول: ' + ((e && e.message) || e);
  }
  function doLogin() {
    var em = document.getElementById('fb-email').value.trim();
    var pw = document.getElementById('fb-pass').value;
    say('');
    if (!em || !pw) { say('اكتبي البريد وكلمة المرور'); return; }
    if (!auth) { say('الربط السحابي غير جاهز — تحققي من الإنترنت ثم حدّثي الصفحة'); return; }
    say('جارٍ الدخول...');
    auth.signInWithEmailAndPassword(em, pw).catch(function (e) { say(authError(e)); });
  }

  function afterAuth(user) {
    busy('جارٍ تحميل دفترك...');
    var uid = user.uid, email = user.email || '';
    var last = null;
    try { last = localStorage.getItem(LAST_UID_KEY); } catch (e) {}
    if (last && last !== uid) {
      // حساب مختلف على نفس الجهاز: امسحي الذاكرة المحلية ثم أعيدي التحميل
      statusEl.textContent = 'حساب مختلف — تجهيز مساحتك الخاصة...';
      wipeLocalCache(function () {
        try { localStorage.setItem(LAST_UID_KEY, uid); } catch (e) {}
        location.reload();
      });
      return;
    }
    try { localStorage.setItem(LAST_UID_KEY, uid); } catch (e) {}
    clickGate();
    waitFor(function () {
      return (typeof window.__attachDb === 'function' && window.SX && typeof window.SX.onReady === 'function') ? true : null;
    }, function (ok) {
      if (!ok) { removeOverlay(); clickGate(); return; }
      attach(uid, email);
    }, 25000);
  }

  function attach(uid, email) {
    if (attached) return;
    attached = true;
    var firstSync = false;
    var adapter = fbAdapter(db, uid, function () {
      firstSync = true;
      removeOverlay();
      accountChip(email);
      clickGate();
    });
    try { window.__attachDb(adapter); } catch (e) { attached = false; }
    try { if (window.SX && window.SX.onReady) window.SX.onReady(adapter); } catch (e) {}
    // احتياط: لا تعلق الواجهة أبدًا
    setTimeout(function () {
      if (!firstSync) { removeOverlay(); accountChip(email); clickGate(); }
    }, 15000);
  }

  /* ---- الإقلاع ---- */
  function boot() {
    if (typeof firebase === 'undefined' || !firebase.apps) return; // بلا إنترنت: يعمل الدفتر محليًا
    try {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      auth = firebase.auth();
      db = firebase.firestore();
      try { db.enablePersistence({ synchronizeTabs: true }); } catch (e) {}
    } catch (e) { return; }
    // انتظر ظهور بوابة الدفتر ثم اعرض الدخول فوقها
    waitFor(function () { return document.getElementById('gate') ? true : null; }, function (ok) {
      if (!ok) return;
      try {
        auth.onAuthStateChanged(function (user) {
          if (user) { buildOverlay(); afterAuth(user); }
          else { buildOverlay(); }
        });
      } catch (e) { /* دخول محلي */ }
    }, 25000);
  }
  onReady(boot);
})();
