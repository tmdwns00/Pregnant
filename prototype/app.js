// 토닥(가칭) MVP 프로토타입. 서버 없이 이 기기에만 저장됩니다(localStorage).
(function () {
  'use strict';

  const STORE_KEY = 'todak.v1';
  const DAY = 86400000;
  const MIN = 60000;

  // ---------- 저장소 ----------
  const defaults = () => ({
    profile: null, // { dueDate, role, babyName, parity }
    settings: { rule: '5-1-1', hospitalName: '', hospitalPhone: '', diaryReminder: '' },
    todos: {},
    diary: {},
    weights: [],
    symptoms: {},
    kicks: [],
    appointments: [],
    benefits: {},
    nutrition: [],
    contractions: { sessions: [], activeId: null },
  });

  let state = load();
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaults();
      return Object.assign(defaults(), JSON.parse(raw));
    } catch (e) {
      return defaults();
    }
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      toast('저장 공간이 부족해요. 사진 수를 줄여 주세요.');
      return false;
    }
  }

  // ---------- 유틸 ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => dateStr(new Date());
  const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return dateStr(d); };
  const hm = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const hms = (ts) => { const d = new Date(ts); return `${hm(ts)}:${pad(d.getSeconds())}`; };
  const dur = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); const m = Math.floor(s / 60); return m ? `${m}분 ${pad(s % 60)}초` : `${s}초`; };
  const clock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };
  const prettyDate = (s) => { const d = parseDate(s); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${'일월화수목금토'[d.getDay()]})`; };

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ---------- 임신 주차 ----------
  function preg() {
    const p = state.profile;
    if (!p) return null;
    const due = parseDate(p.dueDate);
    const lmp = new Date(due.getTime() - 280 * DAY);
    const now = parseDate(today());
    const days = Math.round((now - lmp) / DAY);
    const dDay = Math.round((due - now) / DAY);
    return { days, week: Math.floor(days / 7), day: days % 7, dDay };
  }
  const stageOf = (w) => STAGES.find((s) => w >= s.from && w <= s.to) || (w < 4 ? STAGES[0] : STAGES[STAGES.length - 1]);
  const weekInfo = (w) => WEEKS[Math.min(40, Math.max(4, w))];

  // ---------- 라우터 ----------
  let cleanup = [];
  function onLeave(fn) { cleanup.push(fn); }

  function route() {
    cleanup.forEach((f) => { try { f(); } catch (e) {} });
    cleanup = [];
    const hash = location.hash.replace(/^#\/?/, '') || 'home';
    const [name, sub] = hash.split('/');
    if (!state.profile && name !== 'onboarding') { location.hash = '#/onboarding'; return; }
    const screens = { onboarding, home, records, nutrition, schedule, more, contraction, benefits, settings, soon };
    const fn = screens[name] || home;
    const noTab = ['onboarding', 'contraction', 'nutrition'].includes(name);
    $('#app').classList.toggle('no-tab', noTab);
    $$('#tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.tab === name));
    const view = $('#view');
    view.innerHTML = '';
    fn(view, sub);
    window.scrollTo(0, 0);
  }

  const soonRow = (key, icon, title) =>
    `<a class="list-row" href="#/soon/${key}"><span class="ic">${icon}</span><span class="grow">${title}</span><span class="soon-tag">업데이트 예정</span></a>`;
  const linkRow = (href, icon, title, extra = '') =>
    `<a class="list-row" href="${href}"><span class="ic">${icon}</span><span class="grow">${title}</span>${extra}<span class="muted">›</span></a>`;

  // ---------- F01 온보딩 ----------
  function onboarding(v) {
    let mode = 'due';
    v.innerHTML = `
      <div style="text-align:center;padding:24px 0 8px">
        <div style="font-size:56px">🤰</div>
        <h1>반가워요! 토닥이에요</h1>
        <p class="muted">임신 주차를 알면 이번 주에 필요한 것만 보여드릴게요.</p>
      </div>
      <div class="card">
        <div class="seg" id="ob-mode">
          <a href="javascript:void 0" data-m="due" class="on">출산 예정일</a>
          <a href="javascript:void 0" data-m="lmp">마지막 생리일</a>
          <a href="javascript:void 0" data-m="week">현재 주수</a>
        </div>
        <div id="ob-input"></div>
        <label>나는</label>
        <div class="row" id="ob-role">
          <button type="button" class="chip on" data-r="mom">엄마(산모)</button>
          <button type="button" class="chip" data-r="partner">배우자</button>
        </div>
        <label>태명 (선택)</label>
        <input id="ob-name" placeholder="예: 콩콩이" maxlength="12">
        <label>첫 출산인가요? (진통 측정 기준에 사용)</label>
        <div class="row" id="ob-parity">
          <button type="button" class="chip on" data-p="first">첫 출산</button>
          <button type="button" class="chip" data-p="multi">경험 있음</button>
        </div>
      </div>
      <div class="card soft small">
        <b>건강정보 처리 동의 (필수)</b>
        <p class="muted" style="margin-top:4px">임신 주수, 증상, 체중 등 건강 관련 정보를 서비스 제공 목적으로만 처리합니다. 광고·분석 업체에 전달하지 않으며, 언제든 전체 삭제할 수 있어요. (프로토타입: 이 기기에만 저장)</p>
        <label class="row" style="color:var(--text);margin:8px 0 0"><input type="checkbox" id="ob-consent" style="width:22px;min-height:22px"> 위 내용을 확인했고 동의해요</label>
      </div>
      <button class="block" id="ob-go">시작하기</button>`;

    const input = $('#ob-input', v);
    function drawInput() {
      if (mode === 'due') input.innerHTML = `<label>출산 예정일</label><input type="date" id="ob-date" value="${addDays(today(), 140)}">`;
      if (mode === 'lmp') input.innerHTML = `<label>마지막 생리 시작일</label><input type="date" id="ob-date" value="${addDays(today(), -140)}">`;
      if (mode === 'week') input.innerHTML = `<label>현재 주수</label><div class="row"><input type="number" id="ob-w" min="1" max="42" value="20"> 주 <input type="number" id="ob-d" min="0" max="6" value="0"> 일</div>`;
    }
    drawInput();
    $$('#ob-mode a', v).forEach((a) => a.onclick = () => {
      mode = a.dataset.m;
      $$('#ob-mode a', v).forEach((x) => x.classList.toggle('on', x === a));
      drawInput();
    });
    const pick = (sel) => $$(sel + ' .chip', v).forEach((c) => c.onclick = () => $$(sel + ' .chip', v).forEach((x) => x.classList.toggle('on', x === c)));
    pick('#ob-role'); pick('#ob-parity');

    $('#ob-go', v).onclick = () => {
      if (!$('#ob-consent', v).checked) { toast('건강정보 처리 동의가 필요해요'); return; }
      let due;
      if (mode === 'due') due = $('#ob-date', v).value;
      if (mode === 'lmp') due = $('#ob-date', v).value && addDays($('#ob-date', v).value, 280);
      if (mode === 'week') {
        const w = +$('#ob-w', v).value, d = +$('#ob-d', v).value;
        if (!(w >= 1 && w <= 42 && d >= 0 && d <= 6)) { toast('주수를 확인해 주세요'); return; }
        due = addDays(today(), 280 - (w * 7 + d));
      }
      if (!due) { toast('날짜를 입력해 주세요'); return; }
      state.profile = {
        dueDate: due,
        role: $('#ob-role .chip.on', v).dataset.r,
        babyName: $('#ob-name', v).value.trim(),
        parity: $('#ob-parity .chip.on', v).dataset.p,
      };
      if (state.profile.parity === 'multi') state.settings.rule = '4-1-1';
      save();
      location.hash = '#/home';
    };
  }

  // ---------- F02 홈 ----------
  function home(v) {
    const p = preg();
    const wk = Math.max(0, p.week);
    const info = weekInfo(wk);
    const st = stageOf(wk);
    const baby = state.profile.babyName || '아기';
    const isPartner = state.profile.role === 'partner';
    const nToday = state.nutrition.filter((n) => dateStr(new Date(n.ts)) === today()).length;
    const near = wk >= 36;
    const after = p.dDay < 0;

    v.innerHTML = `
      <div class="card hero">
        <div class="wk">임신 ${wk}주 ${p.day}일 · ${after ? `예정일 +${-p.dDay}일` : p.dDay === 0 ? '오늘이 예정일!' : `D-${p.dDay}`}</div>
        <div class="fruit" id="fruit" role="button" aria-label="${esc(baby)} 터치하기">${info.emoji}</div>
        <div><b>${esc(baby)}</b>는 지금 <b>${info.fruit}</b>만 해요</div>
        <div class="size">약 ${info.cm}cm${info.g ? ` · ${info.g >= 1000 ? (info.g / 1000).toFixed(1) + 'kg' : info.g + 'g'}` : ''} (평균 근사치)</div>
        <div class="bubble" id="baby-talk">${esc(st.baby)}</div>
      </div>

      ${near ? `<a class="btn block danger" href="#/contraction" style="margin-bottom:12px">⏱️ 진통 측정 시작하기</a>` : ''}

      <div class="card">
        <div class="row between"><h2>${isPartner ? '이번 주 배우자 할 일' : '이번 주 할 일'}</h2><span class="muted small">${st.from}~${st.to}주</span></div>
        ${isPartner ? `<p>${esc(st.partner)}</p>` : ''}
        <div id="todos">${st.todos.map((t, i) => {
          const k = `s${st.from}-${i}`;
          const done = !!state.todos[k];
          return `<div class="todo ${done ? 'done' : ''}" data-k="${k}" role="checkbox" aria-checked="${done}"><span class="box">${done ? '✓' : ''}</span><span class="tt">${esc(t)}</span></div>`;
        }).join('')}</div>
      </div>

      <div class="card">
        <div class="row between"><h2>🍎 영양 챙기기</h2><span class="badge mint">NEW</span></div>
        <p class="muted">먹은 영양제나 음식을 기록하면, ${esc(baby)}에게 전해지는 모습을 보여드려요.</p>
        <div class="row between"><span>오늘 ${nToday}번 챙겼어요</span><a class="btn small" href="#/nutrition" style="min-height:40px">챙기러 가기</a></div>
      </div>

      ${!isPartner ? `<div class="card soft"><h3>💡 몸의 변화</h3><ul class="plain">${st.mom.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>` : ''}

      <div class="card">
        <div class="row between"><h3>👫 배우자와 함께 보기</h3><span class="soon-tag">업데이트 예정</span></div>
        <p class="muted small">초대 코드로 연동하면 같은 화면을 함께 보고, 진통이 시작되면 배우자에게 바로 알림이 가요.</p>
      </div>

      ${!near ? `<a class="list-row card" href="#/contraction" style="padding:14px 16px"><span class="ic">⏱️</span><span class="grow">진통 측정</span><span class="muted">›</span></a>` : ''}
      <p class="muted small" style="text-align:center">건강 정보는 일반적인 안내이며 의료진의 진료를 대신하지 않아요.<br>프로토타입 샘플 콘텐츠 · 의료 감수 전</p>`;

    const talks = [st.baby, `${isPartner ? '아빠' : '엄마'}, 오늘도 고마워요!`, '꼼지락꼼지락~', '물 많이 마셔요!', '오늘은 무리하지 마세요'];
    let ti = 0;
    $('#fruit', v).onclick = (e) => {
      ti = (ti + 1) % talks.length;
      $('#baby-talk', v).textContent = talks[ti];
      e.currentTarget.classList.remove('bounce'); void e.currentTarget.offsetWidth; e.currentTarget.classList.add('bounce');
    };
    $$('.todo', v).forEach((el) => el.onclick = () => {
      const k = el.dataset.k;
      state.todos[k] = !state.todos[k];
      save();
      el.classList.toggle('done', state.todos[k]);
      el.setAttribute('aria-checked', state.todos[k]);
      $('.box', el).textContent = state.todos[k] ? '✓' : '';
    });
  }

  // ---------- 영양 챙기기 (애니메이션) ----------
  function nutrition(v) {
    const baby = state.profile.babyName || '아기';
    v.innerHTML = `
      <div class="row between"><a href="#/home" class="btn ghost small">‹ 홈</a><h2 style="margin:0">영양 챙기기</h2><span style="width:60px"></span></div>
      <div class="nutri-stage" id="stage">${Nutrition.SCENE}</div>
      <div class="nutri-dots">${Nutrition.STEPS.map(() => '<i></i>').join('')}</div>
      <div class="nutri-step" id="nstep">무엇을 챙겼나요? 눌러 보세요</div>
      <div class="nutri-grid" id="ngrid">${NUTRIENTS.map((n) => `
        <button data-id="${n.id}">${n.kind === 'pill' ? `<span class="pill" style="background:${n.color}"></span>` : `<span class="ni">${n.emoji}</span>`}${n.name}</button>`).join('')}
      </div>
      <div class="card" style="margin-top:12px">
        <h3>오늘 챙긴 영양</h3>
        <div id="nlog"></div>
      </div>
      <p class="muted small">영양소는 위와 장에서 흡수되어 혈액을 타고 태반과 탯줄을 거쳐 ${esc(baby)}에게 전해져요. 애니메이션은 이해를 돕기 위한 표현이며 실제 흡수 시간·양과는 달라요. 영양제 종류와 복용량은 의료진과 상담하세요.</p>`;

    const drawLog = () => {
      const items = state.nutrition.filter((n) => dateStr(new Date(n.ts)) === today()).sort((a, b) => b.ts - a.ts);
      $('#nlog', v).innerHTML = items.length
        ? items.map((it) => { const n = NUTRIENTS.find((x) => x.id === it.id) || { name: it.id }; return `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--line)"><span>${n.emoji || '💊'} ${esc(n.name)}</span><span class="row"><span class="muted small">${hm(it.ts)}</span><button class="line small" data-del="${it.ts}" aria-label="삭제">✕</button></span></div>`; }).join('')
        : '<p class="muted">아직 기록이 없어요</p>';
      $$('[data-del]', v).forEach((b) => b.onclick = () => {
        state.nutrition = state.nutrition.filter((x) => String(x.ts) !== b.dataset.del);
        save(); drawLog();
      });
    };
    drawLog();

    let busy = false;
    const dots = $$('.nutri-dots i', v);
    $$('#ngrid button', v).forEach((b) => b.onclick = async () => {
      if (busy) return;
      const n = NUTRIENTS.find((x) => x.id === b.dataset.id);
      if (n.kind === 'pill' && state.nutrition.some((x) => x.id === n.id && dateStr(new Date(x.ts)) === today())) {
        if (!confirm(`${n.name}은(는) 오늘 이미 기록했어요.\n복용량은 의료진 안내를 따라 주세요. 그래도 기록할까요?`)) return;
      }
      busy = true;
      $$('#ngrid button', v).forEach((x) => (x.disabled = true));
      state.nutrition.push({ ts: Date.now(), id: n.id });
      save(); drawLog();
      await Nutrition.play($('#stage', v), n, (i) => {
        $('#nstep', v).textContent = Nutrition.STEPS[i];
        dots.forEach((d, j) => d.classList.toggle('on', j <= i));
      });
      $('#nstep', v).textContent = `${baby}가 좋아해요! 💗`;
      busy = false;
      $$('#ngrid button', v).forEach((x) => (x.disabled = false));
    });
  }

  // ---------- F04·F08 기록 ----------
  function records(v, sub) {
    sub = sub || 'diary';
    const tabs = [['diary', '일기'], ['body', '체중·증상'], ['kick', '태동'], ['nutri', '영양']];
    v.innerHTML = `<h1>기록</h1><div class="seg">${tabs.map(([k, l]) => `<a href="#/records/${k}" class="${k === sub ? 'on' : ''}">${l}</a>`).join('')}</div><div id="rec"></div>`;
    const r = $('#rec', v);
    ({ diary: diaryView, body: bodyView, kick: kickView, nutri: nutriHistory })[sub](r);
  }

  const MOODS = ['😊', '🥰', '😌', '😴', '🤢', '😢', '😤'];
  let diaryDate = null;
  function diaryView(r) {
    diaryDate = diaryDate || today();
    const d = state.diary[diaryDate] || { text: '', toBaby: '', mood: '', photos: [] };
    r.innerHTML = `
      <div class="row between" style="margin-bottom:8px">
        <button class="ghost small" id="dprev" aria-label="이전 날">‹</button>
        <b>${prettyDate(diaryDate)}</b>
        <button class="ghost small" id="dnext" aria-label="다음 날" ${diaryDate >= today() ? 'disabled' : ''}>›</button>
      </div>
      <div class="card">
        <label style="margin-top:0">오늘 기분</label>
        <div class="moods" id="moods">${MOODS.map((m) => `<button class="${d.mood === m ? 'on' : ''}" data-m="${m}">${m}</button>`).join('')}</div>
        <label>오늘의 기록</label>
        <textarea id="dtext" placeholder="오늘 있었던 일, 몸 상태, 떠오르는 생각을 자유롭게 적어 보세요">${esc(d.text)}</textarea>
        <label>${esc(state.profile.babyName || '아기')}에게 한 마디</label>
        <input id="dbaby" value="${esc(d.toBaby)}" placeholder="예: 오늘 처음 태동을 느꼈어!">
        <label>사진 (최대 10장)</label>
        <input type="file" id="dphoto" accept="image/*" multiple>
        <div class="photos" id="photos"></div>
        <div class="row between" style="margin-top:10px"><span class="saved" id="saved">${d.updatedAt ? '자동 저장됨 · ' + hms(d.updatedAt) : '입력하면 자동으로 저장돼요'}</span></div>
      </div>
      <p class="muted small">저장 버튼이 없어요. 입력하는 즉시 이 기기에 저장됩니다. 배우자와 공유는 <span class="soon-tag">업데이트 예정</span></p>`;

    const entry = () => (state.diary[diaryDate] = state.diary[diaryDate] || { text: '', toBaby: '', mood: '', photos: [] });
    let t;
    const persist = () => {
      const e = entry();
      e.updatedAt = Date.now();
      if (save()) $('#saved', r).textContent = '자동 저장됨 · ' + hms(e.updatedAt);
    };
    const debounced = () => { clearTimeout(t); t = setTimeout(persist, 400); };
    $('#dtext', r).oninput = (e) => { entry().text = e.target.value; debounced(); };
    $('#dbaby', r).oninput = (e) => { entry().toBaby = e.target.value; debounced(); };
    const flush = () => { clearTimeout(t); if (state.diary[diaryDate]) persist(); };
    document.addEventListener('visibilitychange', flush);
    onLeave(() => { document.removeEventListener('visibilitychange', flush); clearTimeout(t); });
    $$('#moods button', r).forEach((b) => b.onclick = () => {
      const e = entry(); e.mood = e.mood === b.dataset.m ? '' : b.dataset.m; persist();
      $$('#moods button', r).forEach((x) => x.classList.toggle('on', x.dataset.m === e.mood));
    });
    $('#dprev', r).onclick = () => { flush(); diaryDate = addDays(diaryDate, -1); diaryView(r); };
    $('#dnext', r).onclick = () => { flush(); diaryDate = addDays(diaryDate, 1); diaryView(r); };

    const drawPhotos = () => {
      const ps = (state.diary[diaryDate] || {}).photos || [];
      $('#photos', r).innerHTML = ps.map((src, i) => `<div class="ph"><img src="${src}" alt="일기 사진 ${i + 1}"><div class="acts"><button data-rot="${i}" aria-label="회전">⟳</button><button data-rm="${i}" aria-label="삭제">✕</button></div></div>`).join('');
      $$('[data-rm]', r).forEach((b) => b.onclick = () => { entry().photos.splice(+b.dataset.rm, 1); persist(); drawPhotos(); });
      $$('[data-rot]', r).forEach((b) => b.onclick = async () => {
        const e = entry(); e.photos[+b.dataset.rot] = await rotateImage(e.photos[+b.dataset.rot]); persist(); drawPhotos();
      });
    };
    drawPhotos();
    $('#dphoto', r).onchange = async (ev) => {
      const e = entry();
      e.photos = e.photos || [];
      for (const f of Array.from(ev.target.files)) {
        if (e.photos.length >= 10) { toast('사진은 10장까지 넣을 수 있어요'); break; }
        e.photos.push(await shrinkImage(f));
      }
      ev.target.value = '';
      persist(); drawPhotos();
    };
  }

  function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
  async function shrinkImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImg(url);
      const max = 900, k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.75);
    } finally { URL.revokeObjectURL(url); }
  }
  async function rotateImage(src) {
    const img = await loadImg(src);
    const c = document.createElement('canvas');
    c.width = img.height; c.height = img.width;
    const g = c.getContext('2d');
    g.translate(c.width / 2, c.height / 2); g.rotate(Math.PI / 2); g.drawImage(img, -img.width / 2, -img.height / 2);
    return c.toDataURL('image/jpeg', 0.8);
  }

  function bodyView(r) {
    const w = state.weights.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    const sym = state.symptoms[today()] || [];
    r.innerHTML = `
      <div class="card">
        <h2>체중</h2>
        <div class="row"><input type="date" id="wdate" value="${today()}" style="flex:1.2"><input type="number" id="wkg" step="0.1" min="30" max="200" placeholder="kg" inputmode="decimal" style="flex:1"><button id="wadd" class="small" style="min-height:48px">추가</button></div>
        ${w.length >= 2 ? sparkline(w.map((x) => x.kg)) : ''}
        <div>${w.slice().reverse().slice(0, 8).map((x) => `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--line)"><span>${prettyDate(x.date)}</span><span class="row"><b>${x.kg}kg</b><button class="line small" data-wd="${x.date}" aria-label="삭제">✕</button></span></div>`).join('') || '<p class="muted">주 1회 기록을 권장해요</p>'}</div>
      </div>
      <div class="card">
        <h2>오늘의 증상</h2>
        <div class="row wrap">${SYMPTOMS.map((s) => `<button class="chip ${sym.includes(s) ? 'on' : ''}" data-s="${s}">${s}</button>`).join('')}</div>
        <p class="muted small" style="margin-top:8px">평소와 다르게 심하거나 걱정되는 증상은 의료진과 상담하세요.</p>
      </div>
      <div class="card soft">
        <h3>🩺 진료용 요약</h3>
        <p class="muted small">최근 4주 체중·증상을 한 화면으로 모아 진료 때 보여 주세요.</p>
        ${summary()}
      </div>`;
    $('#wadd', r).onclick = () => {
      const date = $('#wdate', r).value, kg = parseFloat($('#wkg', r).value);
      if (!date || !(kg >= 30 && kg <= 200)) { toast('날짜와 체중을 확인해 주세요'); return; }
      state.weights = state.weights.filter((x) => x.date !== date).concat({ date, kg });
      save(); bodyView(r); toast('저장했어요');
    };
    $$('[data-wd]', r).forEach((b) => b.onclick = () => { state.weights = state.weights.filter((x) => x.date !== b.dataset.wd); save(); bodyView(r); });
    $$('[data-s]', r).forEach((b) => b.onclick = () => {
      const list = state.symptoms[today()] = state.symptoms[today()] || [];
      const i = list.indexOf(b.dataset.s);
      i >= 0 ? list.splice(i, 1) : list.push(b.dataset.s);
      save(); b.classList.toggle('on', i < 0);
    });
  }

  function summary() {
    const from = addDays(today(), -28);
    const w = state.weights.filter((x) => x.date >= from).sort((a, b) => (a.date < b.date ? -1 : 1));
    const counts = {};
    Object.entries(state.symptoms).forEach(([d, l]) => { if (d >= from) l.forEach((s) => (counts[s] = (counts[s] || 0) + 1)); });
    const sym = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return `<p class="small">체중: ${w.length ? `${w[0].kg}kg → ${w[w.length - 1].kg}kg (${w.length}회 기록)` : '기록 없음'}</p>
      <p class="small">증상: ${sym.length ? sym.map(([s, c]) => `${esc(s)} ${c}일`).join(', ') : '기록 없음'}</p>`;
  }

  function sparkline(vals) {
    const W = 300, H = 70, min = Math.min(...vals) - 0.5, max = Math.max(...vals) + 0.5;
    const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * (W - 16) + 8},${H - 8 - ((v - min) / (max - min)) * (H - 16)}`).join(' ');
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="체중 변화 그래프"><polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
  }

  let kickSession = null;
  function kickView(r) {
    const wk = preg().week;
    const history = state.kicks.slice().reverse().slice(0, 7);
    r.innerHTML = `
      <div class="card" style="text-align:center">
        <h2>태동 세기</h2>
        <p class="muted small">${wk < 28 ? '보통 28주 무렵부터 태동 세기를 권해요. 지금은 연습 삼아 써 보세요.' : '아기가 활발한 시간에 편하게 누워서, 움직임이 느껴질 때마다 눌러 주세요.'}</p>
        ${kickSession ? `
          <div class="ct-time" id="kt">${clock(Date.now() - kickSession.start)}</div>
          <button class="kick-btn" id="ktap">${kickSession.count}<small>눌러서 세기</small></button>
          <div class="row" style="justify-content:center"><button class="ghost" id="kundo">-1</button><button class="line" id="kend">기록 끝내기</button></div>`
        : `<button class="kick-btn" id="kstart">👶<small>시작</small></button>`}
      </div>
      <div class="card">
        <h3>최근 기록</h3>
        ${history.length ? history.map((k) => `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--line)"><span>${prettyDate(dateStr(new Date(k.start)))} ${hm(k.start)}</span><span>${k.count}회 · ${dur(k.end - k.start)}</span></div>`).join('') : '<p class="muted">아직 기록이 없어요</p>'}
        <p class="muted small" style="margin-top:8px">앱은 태동이 정상인지 판단하지 않아요. 평소보다 태동이 뚜렷하게 줄었다고 느껴지면 바로 병원에 연락하세요.</p>
      </div>`;
    if (!kickSession) { $('#kstart', r).onclick = () => { kickSession = { start: Date.now(), count: 0 }; kickView(r); }; return; }
    const iv = setInterval(() => { const e = $('#kt', r); if (e) e.textContent = clock(Date.now() - kickSession.start); }, 500);
    onLeave(() => clearInterval(iv));
    $('#ktap', r).onclick = () => { kickSession.count++; $('#ktap', r).firstChild.textContent = kickSession.count; if (navigator.vibrate) navigator.vibrate(30); };
    $('#kundo', r).onclick = () => { kickSession.count = Math.max(0, kickSession.count - 1); $('#ktap', r).firstChild.textContent = kickSession.count; };
    $('#kend', r).onclick = () => {
      if (kickSession.count > 0) { state.kicks.push({ start: kickSession.start, end: Date.now(), count: kickSession.count }); save(); }
      kickSession = null; clearInterval(iv); kickView(r);
    };
  }

  function nutriHistory(r) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(today(), -i));
    r.innerHTML = `
      <a class="btn block" href="#/nutrition" style="margin-bottom:12px">🍎 영양 챙기기 열기</a>
      <div class="card"><h2>최근 7일</h2>
      ${days.map((d) => {
        const items = state.nutrition.filter((n) => dateStr(new Date(n.ts)) === d);
        const names = items.map((it) => (NUTRIENTS.find((x) => x.id === it.id) || {}).name).filter(Boolean);
        return `<div style="padding:8px 0;border-bottom:1px solid var(--line)"><div class="row between"><b class="small">${prettyDate(d)}</b><span class="muted small">${items.length}회</span></div>${names.length ? `<div class="small">${names.map(esc).join(', ')}</div>` : ''}</div>`;
      }).join('')}</div>`;
  }

  // ---------- F06 일정 ----------
  function schedule(v) {
    const now = today();
    const list = state.appointments.slice().sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1));
    const upcoming = list.filter((a) => a.date >= now), past = list.filter((a) => a.date < now).reverse();
    const st = stageOf(preg().week);
    const suggest = st.todos.filter((t) => /검사|초음파|진료/.test(t));
    v.innerHTML = `
      <h1>일정</h1>
      ${suggest.length ? `<div class="card soft"><h3>이번 시기 권장 일정</h3>${suggest.map((s) => `<div class="row between" style="padding:6px 0"><span class="small grow">${esc(s)}</span><button class="small ghost" data-sg="${esc(s)}">일정에 추가</button></div>`).join('')}<p class="muted small">정확한 시기는 담당 의료진과 정하세요.</p></div>` : ''}
      <div class="card">
        <h2>새 일정</h2>
        <label>제목</label><input id="at" placeholder="예: 정기 검진" maxlength="40">
        <div class="row"><div class="grow"><label>날짜</label><input type="date" id="ad" value="${now}"></div><div class="grow"><label>시간</label><input type="time" id="atm" value="10:00"></div></div>
        <label>병원 (선택)</label><input id="ah" placeholder="예: OO여성병원" value="${esc(state.settings.hospitalName)}">
        <button class="block" id="aadd" style="margin-top:12px">추가</button>
      </div>
      <div class="card">
        <h2>다가오는 일정</h2>
        ${upcoming.length ? upcoming.map(apptRow).join('') : '<p class="muted">예정된 일정이 없어요</p>'}
      </div>
      ${past.length ? `<div class="card"><h3>지난 일정</h3>${past.slice(0, 10).map(apptRow).join('')}</div>` : ''}
      <div class="card">
        <div class="row between"><h3>알림 · 배우자 공유 · 기기 캘린더 연동</h3><span class="soon-tag">업데이트 예정</span></div>
        <p class="muted small">전날·당일 알림과 배우자 공유는 앱 버전에서 제공돼요.</p>
      </div>`;
    $$('[data-sg]', v).forEach((b) => b.onclick = () => { $('#at', v).value = b.dataset.sg.replace(/ ?(일정 )?(의료진과 )?상담하기|확인하기|받기/g, '').trim(); $('#at', v).focus(); });
    $('#aadd', v).onclick = () => {
      const title = $('#at', v).value.trim(), date = $('#ad', v).value;
      if (!title || !date) { toast('제목과 날짜를 입력해 주세요'); return; }
      state.appointments.push({ id: uid(), title, date, time: $('#atm', v).value, hospital: $('#ah', v).value.trim() });
      save(); toast('일정을 추가했어요'); schedule(v);
    };
    $$('[data-ad]', v).forEach((b) => b.onclick = () => {
      if (!confirm('이 일정을 삭제할까요?')) return;
      state.appointments = state.appointments.filter((a) => a.id !== b.dataset.ad); save(); schedule(v);
    });
  }
  function apptRow(a) {
    const d = Math.round((parseDate(a.date) - parseDate(today())) / DAY);
    return `<div class="row between" style="padding:10px 0;border-bottom:1px solid var(--line)">
      <div><b>${esc(a.title)}</b><div class="muted small">${prettyDate(a.date)} ${esc(a.time || '')}${a.hospital ? ' · ' + esc(a.hospital) : ''}</div></div>
      <div class="row">${d >= 0 ? `<span class="badge mint">${d === 0 ? '오늘' : 'D-' + d}</span>` : ''}<button class="line small" data-ad="${a.id}" aria-label="삭제">✕</button></div></div>`;
  }

  // ---------- 더보기 ----------
  function more(v) {
    v.innerHTML = `
      <h1>더보기</h1>
      <div class="card">
        ${linkRow('#/contraction', '⏱️', '진통 측정')}
        ${linkRow('#/nutrition', '🍎', '영양 챙기기')}
        ${linkRow('#/benefits', '🎁', '지원제도 체크리스트', `<span class="muted small">${Object.values(state.benefits).filter(Boolean).length}/${BENEFITS.length}</span>`)}
        ${linkRow('#/settings', '⚙️', '설정')}
      </div>
      <div class="card">
        <h3 style="padding:4px">곧 만나요</h3>
        ${soonRow('partner', '👫', '배우자 연동·실시간 공유')}
        ${soonRow('ultrasound', '🩻', '초음파 통합 앨범·수치 자동 인식')}
        ${soonRow('family', '👵', '가족 읽기 전용 공유')}
        ${soonRow('bag', '🧳', '출산 가방·출산 계획서')}
        ${soonRow('mood', '💬', '산전·산후 우울 자가검진')}
        ${soonRow('baby', '🍼', '출산 후 육아 기록 모드')}
        ${soonRow('photobook', '📚', '포토북 만들기')}
        ${soonRow('community', '🤝', '출산 예정월 동기 모임')}
        ${soonRow('ttc', '🌸', '임신 준비 모드')}
        ${soonRow('lang', '🌏', '다국어 지원')}
      </div>
      <div class="card">
        <a class="list-row" href="javascript:void 0" id="export"><span class="ic">📤</span><span class="grow">내 데이터 내보내기(JSON)</span></a>
        <a class="list-row" href="javascript:void 0" id="wipe" style="color:var(--danger)"><span class="ic">🗑️</span><span class="grow">모든 데이터 삭제</span></a>
      </div>
      <p class="muted small" style="text-align:center">토닥(가칭) MVP 프로토타입 · 광고 없음</p>`;
    $('#export', v).onclick = () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `todak-${today()}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $('#wipe', v).onclick = () => {
      if (!confirm('모든 기록이 이 기기에서 삭제돼요. 되돌릴 수 없어요. 삭제할까요?')) return;
      state = defaults();
      try { localStorage.removeItem(STORE_KEY); } catch (e) {}
      location.hash = '#/onboarding';
    };
  }

  const SOON = {
    partner: ['👫', '배우자 연동·실시간 공유', '초대 코드로 연동하면 일기·일정·할 일을 함께 보고, 진통이 시작되면 배우자에게 바로 알림이 가요.', 'MVP 정식 버전'],
    ultrasound: ['🩻', '초음파 통합 앨범', '병원이 달라도 초음파 사진·영상을 한 곳에 모으고, 사진 속 수치를 자동으로 읽어 성장 기록을 만들어요.', 'Phase 2'],
    family: ['👵', '가족 읽기 전용 공유', '조부모님은 앱 설치 없이 카카오톡 링크로 초음파와 소식을 볼 수 있어요.', 'Phase 2'],
    bag: ['🧳', '출산 가방·출산 계획서', '병원별 준비물 체크리스트와 출산 계획서를 배우자와 함께 준비해요.', 'Phase 2'],
    mood: ['💬', '산전·산후 우울 자가검진', '표준화된 자가검진 문항과 상담 기관 연결을 제공해요.', 'Phase 2'],
    baby: ['🍼', '출산 후 육아 기록 모드', '출산일을 입력하면 수유·수면·기저귀 기록 화면으로 바뀌어요.', 'Phase 2'],
    photobook: ['📚', '포토북 만들기', '임신 일기와 초음파 사진을 자동으로 엮어 실물 포토북으로 만들어요.', 'Phase 3'],
    community: ['🤝', '출산 예정월 동기 모임', '같은 달 출산 예정인 부모들과 이야기를 나눠요. 기본은 비공개예요.', 'Phase 3'],
    ttc: ['🌸', '임신 준비 모드', '배란일 계산과 난임 시술 일정을 관리해요.', 'Phase 3'],
    lang: ['🌏', '다국어 지원', '영어·베트남어·중국어 등으로 이용할 수 있어요.', 'Phase 3'],
  };
  function soon(v, key) {
    const s = SOON[key] || ['🛠️', '준비 중인 기능', '곧 찾아올게요.', ''];
    v.innerHTML = `<a href="#/more" class="btn ghost small">‹ 더보기</a>
      <div class="card soon"><div class="big">${s[0]}</div><h1>${s[1]}</h1><span class="badge">업데이트 예정${s[3] ? ' · ' + s[3] : ''}</span><p class="muted" style="margin-top:12px">${s[2]}</p></div>`;
  }

  // ---------- F07 지원제도 ----------
  function benefits(v) {
    v.innerHTML = `<a href="#/more" class="btn ghost small">‹ 더보기</a>
      <h1 style="margin-top:12px">지원제도 체크리스트</h1>
      <p class="muted small">2026년 11월 공개 자료 기준 정리예요. 금액·조건은 바뀔 수 있으니 신청 전 <a href="https://www.bokjiro.go.kr" target="_blank" rel="noopener">복지로</a>·<a href="https://www.gov.kr" target="_blank" rel="noopener">정부24</a>에서 꼭 확인하세요. 앱은 신청을 대신하지 않아요.</p>
      ${BENEFITS.map((b) => {
        const done = !!state.benefits[b.id];
        return `<div class="card"><div class="todo ${done ? 'done' : ''}" data-b="${b.id}" role="checkbox" aria-checked="${done}" style="border:none;padding:0"><span class="box">${done ? '✓' : ''}</span><div><b class="tt">${esc(b.title)}</b>
          <div class="small">${esc(b.amount)}</div><div class="muted small">시기: ${esc(b.when)} · 신청: ${esc(b.where)}</div></div></div></div>`;
      }).join('')}`;
    $$('[data-b]', v).forEach((el) => el.onclick = () => {
      const k = el.dataset.b; state.benefits[k] = !state.benefits[k]; save();
      el.classList.toggle('done', state.benefits[k]); $('.box', el).textContent = state.benefits[k] ? '✓' : '';
    });
  }

  // ---------- 설정 ----------
  function settings(v) {
    const p = state.profile, s = state.settings;
    v.innerHTML = `<a href="#/more" class="btn ghost small">‹ 더보기</a>
      <h1 style="margin-top:12px">설정</h1>
      <div class="card">
        <label style="margin-top:0">출산 예정일</label><input type="date" id="sdue" value="${p.dueDate}">
        <label>태명</label><input id="sname" value="${esc(p.babyName)}" maxlength="12">
        <label>보기 모드 (프로토타입 체험용)</label>
        <select id="srole"><option value="mom" ${p.role === 'mom' ? 'selected' : ''}>엄마(산모)</option><option value="partner" ${p.role === 'partner' ? 'selected' : ''}>배우자</option></select>
      </div>
      <div class="card">
        <h3>분만 병원</h3>
        <label>병원 이름</label><input id="shn" value="${esc(s.hospitalName)}" placeholder="예: OO여성병원">
        <label>전화번호 (진통 측정 화면에서 바로 전화)</label><input type="tel" id="shp" value="${esc(s.hospitalPhone)}" placeholder="예: 02-123-4567">
        <label>진통 안내 기준</label>
        <select id="srule">
          <option value="5-1-1" ${s.rule === '5-1-1' ? 'selected' : ''}>5-1-1 (5분 간격, 1분 지속, 1시간)</option>
          <option value="4-1-1" ${s.rule === '4-1-1' ? 'selected' : ''}>4-1-1 (경산모·병원이 먼 경우)</option>
        </select>
        <p class="muted small" style="margin-top:6px">담당 의료진이 알려준 기준이 있다면 그 기준을 따르세요.</p>
      </div>
      <button class="block" id="ssave">저장</button>`;
    $('#ssave', v).onclick = () => {
      if (!$('#sdue', v).value) { toast('예정일을 입력해 주세요'); return; }
      Object.assign(p, { dueDate: $('#sdue', v).value, babyName: $('#sname', v).value.trim(), role: $('#srole', v).value });
      Object.assign(s, { hospitalName: $('#shn', v).value.trim(), hospitalPhone: $('#shp', v).value.trim(), rule: $('#srule', v).value });
      save(); toast('저장했어요');
    };
  }

  // ---------- F05 진통 측정 ----------
  let wakeLock = null;
  async function keepAwake(on) {
    try {
      if (on && 'wakeLock' in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (e) { /* 지원하지 않는 브라우저 */ }
  }

  function activeSession() {
    const c = state.contractions;
    return c.sessions.find((s) => s.id === c.activeId) || null;
  }

  function ctStats(items, rule) {
    const now = Date.now();
    const done = items.filter((x) => x.end);
    const win = done.filter((x) => x.start >= now - 60 * MIN);
    const avg = (a) => (a.length ? a.reduce((p, c) => p + c, 0) / a.length : null);
    const avgDur = avg(win.map((x) => x.end - x.start));
    const ints = [];
    for (let i = 1; i < win.length; i++) ints.push(win[i].start - win[i - 1].start);
    const avgInt = avg(ints);
    const thr = (rule === '4-1-1' ? 4 : 5) * MIN;
    const span = win.length ? now - win[0].start : 0;
    let level = 'calm';
    if (win.length >= 4 && avgInt && avgInt <= thr && avgDur >= 55000 && span >= 50 * MIN) level = 'met';
    else if (win.length >= 3 && avgInt && avgInt <= thr + 2 * MIN && avgDur >= 45000) level = 'near';
    return { count: win.length, avgDur, avgInt, level };
  }

  function contraction(v) {
    const s = state.settings;
    const sess = activeSession();
    const items = sess ? sess.items : [];
    const running = items.length && !items[items.length - 1].end ? items[items.length - 1] : null;
    const st = ctStats(items, s.rule);
    const last = items[items.length - 1];
    const statusText = {
      met: `${s.rule} 기준에 도달했어요. 지금 분만 병원에 연락하세요.`,
      near: '진통 간격이 가까워지고 있어요. 병원 갈 준비를 하세요.',
      calm: items.length ? `기준(${s.rule})까지 계속 기록해 주세요.` : '진통이 시작되면 아래 버튼을 눌러 주세요.',
    }[st.level];

    v.innerHTML = `
      <div class="row between"><a href="#/home" class="btn ghost small">‹ 홈</a><b>진통 측정</b><span style="width:60px"></span></div>
      <div class="ct-wrap">
        <div class="ct-alert" style="margin-top:12px">⚠️ <b>양수가 흐르거나, 출혈이 있거나, 태동이 평소보다 확 줄었다면</b> 타이머와 상관없이 바로 병원에 연락하세요.</div>
        <div class="ct-status ${st.level}" role="status">${statusText}</div>
        <div class="muted small" id="ct-label">${running ? '진통 중' : last && last.end ? '마지막 진통 이후' : '대기 중'}</div>
        <div class="ct-time" id="ct-time">00:00</div>
        <button class="ct-btn ${running ? 'active' : ''}" id="ct-btn">${running ? '진통 끝' : '진통 시작'}</button>
        <div class="ct-stats">
          <div><b>${st.count}</b><span>최근 1시간 횟수</span></div>
          <div><b>${st.avgInt ? clock(st.avgInt) : '--:--'}</b><span>평균 간격</span></div>
          <div><b>${st.avgDur ? clock(st.avgDur) : '--:--'}</b><span>평균 지속</span></div>
        </div>
        <div class="row" style="justify-content:center;gap:8px;flex-wrap:wrap">
          ${s.hospitalPhone ? `<a class="btn" href="tel:${esc(s.hospitalPhone.replace(/[^0-9+]/g, ''))}" style="background:var(--mint)">📞 ${esc(s.hospitalName || '분만 병원')} 전화</a>` : `<a class="btn ghost" href="#/settings">📞 병원 번호 등록하기</a>`}
          ${items.length ? '<button class="ghost" id="ct-undo">마지막 기록 취소</button>' : ''}
        </div>
      </div>
      <div class="card" style="margin-top:12px">
        <div class="row between"><h3>이번 기록</h3>${sess ? '<button class="line small" id="ct-new">새 기록 시작</button>' : ''}</div>
        ${items.length ? `<table class="ct"><thead><tr><th>시작</th><th>지속</th><th>간격</th></tr></thead><tbody>
          ${items.map((x, i) => ({ x, i })).reverse().slice(0, 12).map(({ x, i }) => `<tr><td>${hms(x.start)}</td><td>${x.end ? dur(x.end - x.start) : '진행 중'}</td><td>${i ? dur(x.start - items[i - 1].start) : '-'}</td></tr>`).join('')}
        </tbody></table>` : '<p class="muted">아직 기록이 없어요</p>'}
      </div>
      <div class="card soft small">
        <div class="row between"><b>화면이 꺼져도 측정이 이어져요</b><span class="badge mint">적용됨</span></div>
        <p class="muted" style="margin-top:4px">시간을 누른 시각 그대로 저장하기 때문에, 화면이 꺼지거나 전화를 받거나 앱을 닫았다 열어도 기록이 정확해요. 측정 중에는 화면 꺼짐도 막아 둬요(지원 브라우저).</p>
        <div class="row between" style="margin-top:8px"><span>잠금화면 표시 · 배우자 자동 알림</span><span class="soon-tag">업데이트 예정</span></div>
      </div>
      ${state.contractions.sessions.filter((x) => x.id !== state.contractions.activeId && x.items.length).length ? `
      <div class="card"><h3>지난 기록</h3>${state.contractions.sessions.filter((x) => x.id !== state.contractions.activeId && x.items.length).reverse().map((x) => `
        <div class="row between" style="padding:8px 0;border-bottom:1px solid var(--line)"><span class="small">${prettyDate(dateStr(new Date(x.items[0].start)))} ${hm(x.items[0].start)} · ${x.items.length}회</span><button class="line small" data-cs="${x.id}">삭제</button></div>`).join('')}</div>` : ''}
      <p class="muted small" style="text-align:center">이 화면에는 광고가 나오지 않아요.</p>`;

    const tick = () => {
      const t = $('#ct-time', v); if (!t) return;
      const it = activeSession() ? activeSession().items : [];
      const r = it.length && !it[it.length - 1].end ? it[it.length - 1] : null;
      const l = it[it.length - 1];
      t.textContent = r ? clock(Date.now() - r.start) : l && l.end ? clock(Date.now() - l.end) : '00:00';
    };
    tick();
    const iv = setInterval(tick, 250);
    const onVis = () => { if (document.visibilityState === 'visible') { tick(); if (activeSession()) keepAwake(true); } };
    document.addEventListener('visibilitychange', onVis);
    if (sess) keepAwake(true);
    onLeave(() => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); keepAwake(false); });

    $('#ct-btn', v).onclick = () => {
      const c = state.contractions;
      let se = activeSession();
      if (!se) { se = { id: uid(), items: [] }; c.sessions.push(se); c.activeId = se.id; }
      const lastI = se.items[se.items.length - 1];
      if (lastI && !lastI.end) lastI.end = Date.now();
      else se.items.push({ start: Date.now(), end: null });
      if (navigator.vibrate) navigator.vibrate(60);
      save();
      contraction(v);
    };
    const undo = $('#ct-undo', v);
    if (undo) undo.onclick = () => {
      const se = activeSession(); if (!se) return;
      const l = se.items[se.items.length - 1];
      if (l.end) l.end = null; else se.items.pop();
      save(); contraction(v); toast('마지막 기록을 취소했어요');
    };
    const nw = $('#ct-new', v);
    if (nw) nw.onclick = () => {
      if (!confirm('지금 기록은 "지난 기록"에 보관되고 새 기록을 시작해요.')) return;
      const se = activeSession();
      if (se) { const l = se.items[se.items.length - 1]; if (l && !l.end) l.end = Date.now(); }
      state.contractions.activeId = null; save(); contraction(v);
    };
    $$('[data-cs]', v).forEach((b) => b.onclick = () => {
      if (!confirm('이 기록을 삭제할까요? 되돌릴 수 없어요.')) return;
      state.contractions.sessions = state.contractions.sessions.filter((x) => x.id !== b.dataset.cs); save(); contraction(v);
    });
  }

  // ---------- 시작 ----------
  window.addEventListener('hashchange', route);
  window.addEventListener('storage', (e) => { if (e.key === STORE_KEY) { state = load(); route(); } });
  route();
})();
