// 영양 전달 애니메이션: 입 → 식도 → 위(흡수) → 혈액 → 태반 → 탯줄 → 아기
(function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const SCENE = `
  <svg class="nutri-svg" viewBox="0 0 360 500" role="img" aria-label="영양이 엄마 몸을 지나 아기에게 전달되는 모습">
    <defs>
      <radialGradient id="ng-uterus" cx="50%" cy="45%" r="60%">
        <stop offset="0%" class="ns-uterus-in"/>
        <stop offset="100%" class="ns-uterus-out"/>
      </radialGradient>
    </defs>
    <!-- 몸 -->
    <path class="ns-body" d="M118 146 Q180 128 242 146 Q266 200 258 262 Q306 334 274 424 Q180 476 86 424 Q54 334 102 262 Q94 200 118 146 Z"/>
    <rect class="ns-body" x="164" y="108" width="32" height="44" rx="10"/>
    <!-- 머리 -->
    <circle class="ns-skin" cx="180" cy="66" r="46"/>
    <path class="ns-hair" d="M134 64 Q136 16 180 16 Q226 16 228 64 Q214 40 180 38 Q150 40 134 64 Z"/>
    <circle class="ns-eye" cx="164" cy="66" r="3.5"/>
    <circle class="ns-eye" cx="196" cy="66" r="3.5"/>
    <circle class="ns-cheek" cx="152" cy="82" r="7"/>
    <circle class="ns-cheek" cx="208" cy="82" r="7"/>
    <ellipse id="ns-mouth" class="ns-mouth" cx="180" cy="92" rx="8" ry="3"/>
    <!-- 소화 경로 -->
    <path id="ns-esophagus" class="ns-tube" d="M180 96 L180 150 C180 176 178 196 172 216"/>
    <path id="ns-stomach" class="ns-stomach" d="M168 210 C204 206 220 240 202 264 C186 286 148 284 136 264 C128 250 142 242 154 245 C166 248 170 232 162 222 Z"/>
    <path id="ns-blood" class="ns-vessel" d="M196 258 C236 262 258 286 236 316"/>
    <!-- 자궁·아기 -->
    <circle class="ns-uterus" cx="180" cy="362" r="74" fill="url(#ng-uterus)"/>
    <ellipse id="ns-placenta" class="ns-placenta" cx="228" cy="314" rx="24" ry="12" transform="rotate(35 228 314)"/>
    <path id="ns-cord" class="ns-cord" d="M224 326 C204 338 226 350 206 360 C194 366 200 374 190 376"/>
    <g id="ns-fetus">
      <ellipse class="ns-fetus" cx="182" cy="388" rx="27" ry="31"/>
      <circle class="ns-fetus" cx="164" cy="346" r="24"/>
      <path class="ns-fetus" d="M196 378 q16 4 12 18" fill="none" stroke-width="7" stroke-linecap="round"/>
      <path class="ns-fetus-line" d="M152 344 q4 -3 8 0"/>
      <path class="ns-fetus-line" d="M168 344 q4 -3 8 0"/>
      <circle id="ns-fcheek1" class="ns-fcheek" cx="150" cy="354" r="5"/>
      <circle id="ns-fcheek2" class="ns-fcheek" cx="178" cy="354" r="5"/>
      <path id="ns-fmouth" class="ns-fetus-line" d="M158 357 Q164 358 170 357"/>
    </g>
    <g id="ns-fx"></g>
    <g id="ns-bubble" opacity="0">
      <rect class="ns-bubble" x="20" y="430" width="200" height="40" rx="20"/>
      <text id="ns-bubble-text" class="ns-bubble-text" x="120" y="455" text-anchor="middle"></text>
    </g>
  </svg>`;

  const STEPS = ['입으로 냠', '식도를 지나요', '위·장에서 흡수돼요', '혈액을 타고', '태반과 탯줄을 거쳐', '아기에게 도착!'];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  function tween(dur, fn) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      function frame(now) {
        const t = Math.min(1, (now - t0) / dur);
        fn(ease(t), t);
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  function along(path, dur, place, opts = {}) {
    const len = path.getTotalLength();
    const from = opts.from || 0, to = opts.to == null ? 1 : opts.to;
    return tween(dur, (e, t) => {
      const p = path.getPointAtLength(len * (from + (to - from) * e));
      place(p, e, t);
    });
  }

  function el(tag, attrs) {
    const n = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function makeItem(n) {
    const g = el('g', { class: 'ns-item' });
    if (n.kind === 'pill') {
      g.appendChild(el('rect', { x: -13, y: -6, width: 26, height: 12, rx: 6, fill: n.color, stroke: 'rgba(0,0,0,.25)', 'stroke-width': 1 }));
      g.appendChild(el('rect', { x: 0, y: -6, width: 13, height: 12, rx: 6, fill: '#fff', opacity: 0.55 }));
    } else {
      const t = el('text', { 'text-anchor': 'middle', y: 8, 'font-size': 24 });
      t.textContent = n.emoji;
      g.appendChild(t);
    }
    return g;
  }

  function place(g, p, scale = 1, rot = 0) {
    g.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${rot}) scale(${scale})`);
  }

  async function play(root, n, onStep) {
    const svg = root.querySelector('svg');
    const $ = (id) => svg.querySelector('#' + id);
    const fx = $('ns-fx');
    const mouth = $('ns-mouth');
    fx.innerHTML = '';
    reset(svg);
    const color = n.color || '#f2a65a';

    // 1. 입으로
    onStep(0);
    const item = makeItem(n);
    fx.appendChild(item);
    await tween(500, (e) => {
      place(item, { x: 180, y: 10 + 82 * e }, 1.1, -20 + 20 * e);
      mouth.setAttribute('ry', 3 + 7 * Math.min(1, e * 1.5));
    });
    await tween(200, (e) => mouth.setAttribute('ry', 10 - 7 * e));

    // 2. 식도
    onStep(1);
    $('ns-esophagus').classList.add('glow');
    await along($('ns-esophagus'), 1100, (p, e) => place(item, p, 1 - 0.25 * e, 90 * e));
    $('ns-esophagus').classList.remove('glow');

    // 3. 위에서 흡수
    onStep(2);
    const stomach = $('ns-stomach');
    stomach.classList.add('glow');
    await tween(800, (e, t) => {
      place(item, { x: 172 + Math.sin(t * 18) * 4, y: 244 }, 0.75 * (1 - e), 90);
      item.setAttribute('opacity', 1 - e);
    });
    item.remove();

    // 4. 혈액을 타고 (반짝이 여러 개)
    onStep(3);
    $('ns-blood').classList.add('glow');
    const sparks = [];
    for (let i = 0; i < 5; i++) {
      const s = el('circle', { r: 4.5, fill: color, class: 'ns-spark' });
      fx.appendChild(s);
      sparks.push(s);
    }
    const blood = $('ns-blood');
    await Promise.all(sparks.map((s, i) => sleep(i * 140).then(() =>
      along(blood, 1100, (p) => { s.setAttribute('cx', p.x); s.setAttribute('cy', p.y); }))));
    stomach.classList.remove('glow');
    $('ns-blood').classList.remove('glow');

    // 5. 태반 → 탯줄
    onStep(4);
    const placenta = $('ns-placenta');
    placenta.classList.add('pulse');
    $('ns-cord').classList.add('glow');
    const cord = $('ns-cord');
    await Promise.all(sparks.map((s, i) => sleep(i * 120).then(() =>
      along(cord, 900, (p) => { s.setAttribute('cx', p.x); s.setAttribute('cy', p.y); })
        .then(() => tween(250, (e) => s.setAttribute('r', 4.5 * (1 - e)))))));
    sparks.forEach((s) => s.remove());
    placenta.classList.remove('pulse');
    $('ns-cord').classList.remove('glow');

    // 6. 아기 반응
    onStep(5);
    happy(svg, n);
    await sleep(2200);
  }

  function happy(svg, n) {
    const $ = (id) => svg.querySelector('#' + id);
    $('ns-fmouth').setAttribute('d', 'M156 354 Q164 366 172 354');
    $('ns-fcheek1').classList.add('on');
    $('ns-fcheek2').classList.add('on');
    $('ns-fetus').classList.add('wiggle');
    const fx = $('ns-fx');
    for (let i = 0; i < 5; i++) {
      const h = el('text', { x: 140 + i * 14, y: 320, 'font-size': 16, class: 'ns-heart', style: `animation-delay:${i * 0.18}s` });
      h.textContent = '💗';
      fx.appendChild(h);
    }
    $('ns-bubble-text').textContent = n.msg || '고마워요, 엄마!';
    $('ns-bubble').setAttribute('opacity', 1);
  }

  function reset(svg) {
    const $ = (id) => svg.querySelector('#' + id);
    $('ns-fmouth').setAttribute('d', 'M158 357 Q164 358 170 357');
    $('ns-fcheek1').classList.remove('on');
    $('ns-fcheek2').classList.remove('on');
    $('ns-fetus').classList.remove('wiggle');
    $('ns-bubble').setAttribute('opacity', 0);
    $('ns-mouth').setAttribute('ry', 3);
  }

  window.Nutrition = {
    SCENE,
    STEPS,
    play(root, n, onStep) {
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) {
        onStep(5);
        happy(root.querySelector('svg'), n);
        return Promise.resolve();
      }
      return play(root, n, onStep);
    },
  };
})();
