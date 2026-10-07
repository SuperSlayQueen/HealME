(function () {
'use strict';
const P = window.PSY, TIMES = window.TIMES, OPT = window.OPT;
const app = document.getElementById('app'), modal = document.getElementById('modal');
const $ = (s, r = document) => r.querySelector(s);

/* ---------- хранилище ---------- */
const ls = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem('hm.' + k)); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('hm.' + k, JSON.stringify(v)); } catch (e) {} }
};
const bookings = () => ls.get('b', []);
const saveB = a => ls.set('b', a);
const pad = n => String(n).padStart(2, '0');
const key = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
if (!ls.get('init', 0)) { // демо-запись в прошлом, чтобы можно было оставить отзыв
  const d = new Date(); d.setDate(d.getDate() - 5);
  saveB([{ id: 'demo1', pid: 'maria', day: key(d), t: '18:00', name: 'Демо', mail: 'demo@example.com', st: 'ok', moves: 0 }]);
  ls.set('init', 1);
}

/* ---------- даты и слоты ---------- */
const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MG = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MN = ['ЯНВАРЬ', 'ФЕВРАЛЬ', 'МАРТ', 'АПРЕЛЬ', 'МАЙ', 'ИЮНЬ', 'ИЮЛЬ', 'АВГУСТ', 'СЕНТЯБРЬ', 'ОКТЯБРЬ', 'НОЯБРЬ', 'ДЕКАБРЬ'];
const MS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const days = () => Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i + 1); return d; });
const at = (day, t) => new Date(day + 'T' + t + ':00');
const long = (day, t) => { const d = at(day, t); return WD[d.getDay()] + ', ' + d.getDate() + ' ' + MG[d.getMonth()] + ' · ' + t; };
const hash = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const taken = (pid, day, t, ign) => bookings().some(b => b.st === 'ok' && b.pid === pid && b.day === day && b.t === t && b.id !== ign);
const busy = (pid, day, t, ign) => hash(pid + day + t) % 4 === 0 || taken(pid, day, t, ign);
const state = b => b.st === 'cancelled' ? 'cancelled' : (+at(b.day, b.t) + 50 * 6e4 < Date.now() ? 'past' : 'up');
const money = n => n.toLocaleString('ru-RU') + '\u00A0₽';
const psy = id => P.find(p => p.id === id);
const fmtTxt = p => p.fmt.length > 1 ? 'Онлайн и очно' : (p.fmt[0] === 'online' ? 'Онлайн' : 'Очно');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- иконки ---------- */
const sv = (p, s = 24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const I = {
  menu: sv('<path d="M3 7h18M3 12h18M3 17h18"/>', 28), close: sv('<path d="M5 5l14 14M19 5L5 19"/>', 28),
  arr: sv('<path d="M5 12h14M13 6l6 6-6 6"/>', 18), up: sv('<path d="M7 17L17 7M8 7h9v9"/>', 20),
  info: sv('<circle cx="12" cy="12" r="9" fill="currentColor" stroke="none"/><path d="M12 11v5M12 8h.01" stroke="#C2F439" stroke-width="2.2"/>', 22),
  pen: sv('<path d="M4 20l1-4L16 5l3 3L8 19zM14 7l3 3" fill="currentColor"/>', 18),
  lock: sv('<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 018 0v3M12 15v2"/>'),
  shield: sv('<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>', 18),
  cal: sv('<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M9 14l4 4M13 14l-4 4M8 3v4M16 3v4"/>', 18),
  nophone: sv('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2zM3 3l18 18"/>'),
  bell: sv('<path d="M6 16V11a6 6 0 0112 0v5l2 2H4zM10 21h4"/>'),
  trash: sv('<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6"/>'),
  check: sv('<path d="M5 12l5 5 9-10"/>', 22)
};

/* ---------- каркас страницы ---------- */
const NAV = [['#/psychologists', 'Психологи', 'psychologists'], ['#/my', 'Мои записи', 'my'], ['#/?s=how', 'Как это работает', 'how'], ['#/help', 'Срочная помощь', 'help']];
const logo = w => `<a class="logo" href="#/"><img src="assets/logo-${w ? 'white' : 'dark'}.png" alt="HEALME"></a>`;
const header = (w, cur) => `<header class="hd${w ? ' w' : ''}"><div class="wrap hdin">${logo(w)}
  <nav class="dn">${NAV.map(n => `<a href="${n[0]}" class="${n[2] === cur ? 'cur' : ''}">${n[1]}</a>`).join('')}</nav>
  <button class="bg" data-act="menu" aria-label="Меню">${I.menu}</button></div></header>`;
const footer = cta => `<footer class="ft${cta ? ' cta' : ''}"><div class="wrap"><img class="flogo" src="assets/logo-white.png" alt="HEALME">
  ${cta ? '<h2>Готовы начать?</h2><a class="btn lm" href="#/psychologists">ЗАПИСАТЬСЯ</a>' : ''}
  <nav class="fn"><a href="#/psychologists">Психологи</a><a href="#/my">Мои записи</a><a href="#/?s=how">Как это работает</a><a href="#/help">Срочная помощь</a></nav>
  <p class="fd">Сервис не оказывает неотложной медицинской помощи. При острой кризисной ситуации звоните по единому номеру <a href="#/help">112</a>.</p>
  <p class="fd">© ${new Date().getFullYear()} HEALME. Конфиденциально и защищено. Демо-проект: специалисты и отзывы вымышленные.</p></div></footer>`;
const page = (cur, body, o = {}) => (o.hero ? '' : header(false, cur)) + `<main class="${o.cls || ''}">${body}</main>` + footer(o.cta);

/* ---------- карточка психолога в списках ---------- */
const pcard = (p, home) => `<article class="pc"><a class="ph" href="#/psychologist/${p.id}"><img src="${p.photo}" alt="${esc(p.name)}" loading="lazy"><span class="inf" aria-hidden="true">${I.info}</span></a>
  <div class="pr"><h3>${p.name}</h3><span class="mut">стаж ${p.exp} лет</span></div><div class="mut">${p.role}</div>
  <div class="pf"><b>${money(p.price)}</b>${home ? '' : '<small>50 мин</small>'}<a class="lk" href="#/time/${p.id}">Записаться ${I.arr}</a></div></article>`;

/* ---------- состояния ---------- */
let Q = {}, D = {}, F = { tag: '', fmt: '', price: '', tm: '', open: '' }, loaded = false, RV = { r: 0, txt: '' };

/* ---------- экраны ---------- */
function home() {
  const hero = `<section class="hero">${header(true, '')}<div class="wrap hin"><h1>Забота о себе начинается с одной записи</h1>
    <p>Подберите психолога по запросу и удобному времени. Без&nbsp;звонков и лишних шагов.</p><a class="btn lm" href="#/psychologists">ЗАПИСАТЬСЯ</a></div></section>`;
  const steps = [['01', 'Подберите психолога', 'Фильтры по опыту, методу и теме запроса без анкетных перегрузок.'], ['02', 'Выберите время', 'Актуальные слоты в вашем часовом поясе, синхронизация с календарём.'], ['03', 'Подтвердите запись', 'Сессия закрепляется моментально, ссылка на видеозвонок приходит сразу.']];
  const tl = [['Тревога и стресс', 'Тревога'], ['Выгорание', 'Выгорание'], ['Отношения', 'Отношения'], ['Самооценка', 'Самооценка'], ['Подростки', 'Подростки'], ['Сон и привычки', 'Сон и привычки']];
  const priv = [[I.nophone, 'Без звонков', 'Никаких подтверждений по телефону или назойливых операторов.'], [I.bell, 'Нейтральные напоминания', 'Уведомления без упоминания диагнозов и подробностей запроса.'], [I.trash, 'Удалить всё — в один клик', 'Полное стирание истории встреч и заметок в любое удобное время.']];
  return hero + `<main>
  <section class="wrap sec" id="how"><div class="sh"><div><h2>Три шага до встречи</h2><p class="mut">Выберите психолога, время и подтвердите запись. Всё занимает пару минут.</p></div></div>
    <div class="steps">${steps.map(s => `<div class="plate st"><small class="eyebrow">ШАГ ${s[0]}</small><h3>${s[1]}</h3><p class="mut">${s[2]}</p></div>`).join('')}</div></section>
  <section class="wrap sec"><div class="sh"><div><h2>Наши психологи</h2><p class="mut">Специалисты с подтверждённой квалификацией.</p></div><a class="btn dk sm" href="#/psychologists">Все ${I.arr}</a></div>
    <div class="pcs scroll">${P.map(p => pcard(p, true)).join('')}</div></section>
  <section class="wrap sec"><div class="sh"><h2>С чем приходят</h2></div><div class="tiles">${tl.map(t => `<a class="plate tl" href="#/psychologists?tag=${encodeURIComponent(t[1])}"><span>${t[0]}</span>${I.up}</a>`).join('')}</div></section>
  <section class="wrap sec"><div class="sh"><h2>Ваши данные — только ваши</h2></div><div class="plate priv">${priv.map(p => `<div class="pv"><span class="ic">${p[0]}</span><div><b>${p[1]}</b><p class="mut">${p[2]}</p></div></div>`).join('')}</div></section></main>` + footer(true);
}

function slotsAny(p, tm) {
  const [a, b] = tm === 'Утро' ? [0, 12] : tm === 'День' ? [12, 17] : [17, 24];
  return days().some(d => TIMES.some(t => { const h = +t.slice(0, 2); return h >= a && h < b && !busy(p.id, key(d), t); }));
}
function filtered() {
  return P.filter(p => (!F.tag || p.tags.includes(F.tag)) && (!F.fmt || p.fmt.includes(F.fmt === 'Онлайн' ? 'online' : 'offline')) &&
    (!F.price || p.price <= parseInt(F.price.replace(/\D/g, ''), 10)) && (!F.tm || slotsAny(p, F.tm)));
}
function catalog() {
  let body;
  if (Q.fail !== undefined) body = `<div class="empty"><h3>Не удалось загрузить список</h3><p class="mut">Проверьте соединение и попробуйте ещё раз.</p><button class="btn lm" data-act="retry">Повторить</button></div>`;
  else if (!loaded) body = `<div class="pcs">${'<div class="pc sk"></div>'.repeat(4)}</div>`;
  else {
    const list = filtered(), any = F.tag || F.fmt || F.price || F.tm;
    body = `<div class="cnt"><span class="mut">Найдено ${list.length} ${list.length === 1 ? 'специалист' : (list.length > 1 && list.length < 5 ? 'специалиста' : 'специалистов')}</span>${any ? '<button class="lk" data-act="reset">Сбросить</button>' : ''}</div>` +
      (list.length ? `<div class="pcs">${list.map(p => pcard(p)).join('')}</div>` : `<div class="empty"><h3>Никого не нашли</h3><p class="mut">Попробуйте изменить фильтры.</p><button class="btn pu" data-act="reset">Сбросить фильтры</button></div>`);
  }
  const chips = Object.keys(OPT).map(k => {
    const L = { tag: 'Запрос', fmt: 'Формат', price: 'Цена', tm: 'Время' }[k];
    return `<div class="dw"><button class="ch${F[k] ? ' on' : ''}" data-act="flt" data-v="${k}" aria-expanded="${F.open === k}">${F[k] || L} <i>▾</i></button>
      ${F.open === k ? `<div class="dd">${F[k] ? `<button data-act="opt" data-k="${k}" data-v="">Любой</button>` : ''}${OPT[k].map(o => `<button class="${F[k] === o ? 'sel' : ''}" data-act="opt" data-k="${k}" data-v="${o}">${o}</button>`).join('')}</div>` : ''}</div>`;
  }).join('');
  return page('psychologists', `<div class="wrap"><h1 class="t1">Психологи</h1><p class="lead mut">Подберите специалиста по запросу, формату и цене. Цена и ближайшее время видны сразу.</p>
    <div class="flt">${chips}</div>${body}</div>`);
}

function reviewsOf(p) {
  const mine = bookings().filter(b => b.pid === p.id && b.review).map(b => [b.name, 'недавно', b.review.txt || 'Оценка: ' + b.review.r + ' из 5', b.review.r]);
  const n = mine.length, avg = (p.rating * p.count + mine.reduce((s, r) => s + r[3], 0)) / (p.count + n);
  return { list: mine.concat(p.reviews), avg: avg.toFixed(1).replace('.', ','), count: p.count + n };
}
function card(id) {
  const p = psy(id); if (!p) return notFound();
  const r = reviewsOf(p);
  return page('psychologists', `<div class="wrap two"><div class="ph2"><a class="crumb" href="#/psychologists">Психологи</a> <span class="mut">/</span> <b>${p.name}</b><img class="big" src="${p.photo}" alt="${esc(p.name)}"></div>
    <div class="info"><h1 class="t1">${p.name}</h1><p class="mut">${p.role} · стаж ${p.exp} лет</p>
    <div class="tags">${p.tags.map(t => `<span class="tg">${t}</span>`).join('')}</div>
    <div class="plate facts"><div><span class="mut">Формат</span><b>${fmtTxt(p)}</b></div><div><span class="mut">Сессия</span><b>50 минут</b></div><div><span class="mut">Стоимость</span><b>${money(p.price)}</b></div></div>
    <section class="blk"><small class="eyebrow">О ПОДХОДЕ</small><p>${p.about}</p></section>
    <section class="blk"><small class="eyebrow">ОБРАЗОВАНИЕ</small>${p.edu.map(e => `<p><b>${e[0]}</b><br><span class="mut sm">${e[1]}</span></p>`).join('')}</section>
    <section class="blk"><small class="eyebrow">ОТЗЫВЫ</small><div class="rate"><span>${r.avg}</span><span class="mut">на основе ${r.count} отзывов</span></div>
      ${r.list.slice(0, 4).map(v => `<div class="plate rv"><div><b>${esc(v[0])}</b><span class="mut sm">${v[1]}</span></div><p>${esc(v[2])}</p></div>`).join('')}</section>
    <div class="sticky"><a class="btn lm" href="#/time/${p.id}">ДАЛЕЕ</a></div></div></div>`, { cls: 'pad' });
}

function sum(p, b) {
  return `<div class="plate sumc"><img src="${p.photo}" alt=""><div><h3>${p.name}</h3><span class="mut">${fmtTxt(p)} · 50 минут</span><b>${money(p.price)}</b></div></div>`;
}
function time(id) {
  const p = psy(id); if (!p) return notFound();
  const ds = days(), r = Q.r || '';
  if (D.pid !== id || (D.r || '') !== r) D = { pid: id, r, day: key(ds.find(d => TIMES.some(t => !busy(id, key(d), t, r))) || ds[0]), t: '' };
  const sd = at(D.day, '00:00'), free = TIMES.filter(t => !busy(id, D.day, t, r)).length;
  return page('psychologists', `<div class="wrap two t2"><aside>${sum(p)}${r ? `<div class="plate note2">Текущая запись: ${long(bookings().find(b => b.id === r).day, bookings().find(b => b.id === r).t)}</div>` : ''}</aside>
    <div><h1 class="t1">${r ? 'Перенос записи' : 'Выберите время'}</h1><div class="eyebrow mo">${MN[sd.getMonth()]} ${sd.getFullYear()} ${I.pen}</div>
    <div class="days">${ds.map(d => { const k = key(d); return `<button class="dc${k === D.day ? ' on' : ''}" data-act="day" data-v="${k}"><span>${WD[d.getDay()]}</span><b>${d.getDate()}</b><small>${MS[d.getMonth()]}</small></button>`; }).join('')}</div>
    <div class="slots">${TIMES.map(t => { const bz = busy(id, D.day, t, r); return `<button class="sl${bz ? ' bz' : ''}${t === D.t ? ' on' : ''}" ${bz ? 'disabled' : ''} data-act="slot" data-v="${t}">${t}</button>`; }).join('')}</div>
    ${free ? '' : '<p class="mut">На этот день свободного времени нет — выберите другой день.</p>'}
    <div class="sticky"><button class="btn lm" data-act="next" ${D.t ? '' : 'disabled'}>${r ? 'Подтвердить перенос' : 'Продолжить запись'}</button></div></div></div>`, { cls: 'pad' });
}

function form(id) {
  const p = psy(id); if (!p) return notFound();
  if (D.pid !== id || !D.t) return redirect('#/time/' + id);
  return page('psychologists', `<div class="wrap two t2"><aside><div class="plate meet"><small class="eyebrow">ВАША ВСТРЕЧА</small><div class="mrow"><img src="${p.photo}" alt=""><div><h3>${long(D.day, D.t).replace(' · ', ' · ')}</h3><span class="mut">${p.name} · 50 минут</span></div></div>
      <div class="mf"><a class="lk" href="#/time/${id}">Изменить время ${I.arr}</a><span class="mut">${money(p.price)}</span></div></div></aside>
    <div><h1 class="t1">Ваши данные</h1><div class="plate fm">
      <label class="fld" id="f-n"><span>Ваше имя</span><input id="fn" autocomplete="name" placeholder="Имя"><em class="em"></em></label>
      <label class="fld" id="f-m"><span>Ваш Email</span><input id="fm" type="email" autocomplete="email" placeholder="example@mail.ru"><em class="em"></em></label>
      <label class="fld" id="f-c"><span>Комментарий*</span><textarea id="fcm" rows="2" maxlength="300" placeholder="(Необязательно)"></textarea><small class="mut">Личные подробности писать не нужно</small></label>
      <label class="ck" id="f-k"><input type="checkbox" id="fk" checked><i>${I.check}</i><span>Согласен на обработку персональных данных. <a href="#/help" class="und">Подробнее</a></span></label><em class="em" id="e-k"></em></div>
    <div class="plate wh note"><span class="ic">${I.lock}</span><div><b>Приватность переписки и звонка</b><p class="mut">Напоминание придёт в нейтральной форме без упоминания ваших персональных данных.</p></div></div>
    <p class="mini mut"><span>${I.cal} Бесплатная отмена за 24ч</span><span>${I.shield} Защищённый канал</span></p><p class="em" id="e-g"></p>
    <div class="sticky"><button class="btn lm" data-act="submit">Продолжить запись</button></div></div></div>`, { cls: 'pad' });
}

function done(kind) {
  const b = bookings().find(x => x.id === Q.b), p = b && psy(b.pid);
  const V = {
    ok: ['Вы записаны', 'Запись подтверждена. Напоминание придёт в нейтральной форме.', 1],
    moved: ['Запись перенесена', 'Новое время сохранено, прежнее освобождено.', 1],
    cancelled: ['Запись отменена', 'Время снова доступно другим клиентам. Вы можете выбрать новое.', 0],
    review: ['Спасибо за отзыв', 'Он поможет другим выбрать специалиста.', 0],
    report: ['Мы получили обращение', 'Ответим на указанный контакт.', 0],
    wait: ['Вы в листе ожидания', 'Сообщим, если время освободится.', 0]
  }[kind] || null;
  if (!V) return notFound();
  const det = V[2] && b ? `<div class="plate det"><b>${long(b.day, b.t)}</b><span class="mut">${p.name} · ${fmtTxt(p)} · 50 минут</span></div>` : '';
  const btns = V[2] && b ? `<button class="btn lm" data-act="ics" data-v="${b.id}">Добавить в календарь</button><a class="btn dk" href="#/my">Мои записи</a>`
    : (kind === 'cancelled' || kind === 'wait' ? `<a class="btn lm" href="#/psychologists">Выбрать новое время</a><a class="btn dk" href="#/my">Мои записи</a>` : `<a class="btn lm" href="#/my">Мои записи</a><a class="btn dk" href="#/">На главную</a>`);
  return page('my', `<div class="wrap res"><div><span class="okmark">${I.check}</span><h1 class="t1">${V[0]}</h1><p class="lead mut">${V[1]}</p>${det}<div class="acts">${btns}</div></div></div>`);
}

function my() {
  const past = Q.t === 'past', all = bookings(), up = all.filter(b => state(b) === 'up').sort((a, b) => +at(a.day, a.t) - +at(b.day, b.t)),
    pa = all.filter(b => state(b) !== 'up').sort((a, b) => +at(b.day, b.t) - +at(a.day, a.t)), list = past ? pa : up;
  const row = b => { const d = at(b.day, b.t), p = psy(b.pid), s = state(b); return `<a class="row" href="#/my/${b.id}"><div class="rd"><b>${d.getDate()}</b><small>${MS[d.getMonth()]}</small></div>
    <div class="rm"><b>${p.name}</b><span class="mut">${b.t} · ${fmtTxt(p)} · 50 минут</span></div><span class="chip2 ${s}">${s === 'up' ? 'Предстоит' : s === 'past' ? (b.review ? 'Прошла' : 'Оставить отзыв') : 'Отменена'}</span>${I.arr}</a>`; };
  return page('my', `<div class="wrap"><h1 class="t1">Мои записи</h1>
    <div class="tabs"><a class="${past ? '' : 'on'}" href="#/my">Предстоящие <sup>${up.length}</sup></a><a class="${past ? 'on' : ''}" href="#/my?t=past">Прошедшие <sup>${pa.length}</sup></a></div>
    ${list.length ? `<div class="rows">${list.map(row).join('')}</div>` : `<div class="empty"><h3>Записей пока нет</h3><p class="mut">Когда вы запишетесь, встречи появятся здесь.</p><a class="btn lm" href="#/psychologists">Найти психолога</a></div>`}
    <div class="plate mydata"><div><b>Мои данные</b><p class="mut">Записи хранятся только на этом устройстве.</p></div><button class="btn ol sm" data-act="del-ask">Удалить мои данные</button></div></div>`);
}

function details(id) {
  const b = bookings().find(x => x.id === id); if (!b) return notFound();
  const p = psy(b.pid), s = state(b), h24 = +at(b.day, b.t) - Date.now() >= 864e5;
  let act;
  if (s === 'up') act = h24 ? `${b.moves ? '<p class="mut sm">Перенос уже использован.</p>' : `<a class="btn pu" href="#/time/${p.id}?r=${b.id}">Перенести</a>`}<button class="btn ol" data-act="cancel-ask" data-v="${b.id}">Отменить запись</button><p class="mut sm">Отмена и перенос возможны не позднее чем за 24 часа до начала.</p>`
    : `<p>До встречи меньше 24 часов — отмена и перенос недоступны.</p>`;
  if (s === 'past') act = b.review ? '<p class="mut">Отзыв оставлен. Спасибо!</p>' : `<a class="btn lm" href="#/review/${b.id}">Оставить отзыв</a>`;
  if (s === 'cancelled') act = '<p class="mut">Запись отменена.</p><a class="btn lm" href="#/psychologists">Выбрать новое время</a>';
  const F2 = [['Специалист', p.name], ['Формат', fmtTxt(p)], ['Длительность', '50 минут'], ['Контакт для связи', esc(b.mail)], ['Статус', s === 'up' ? 'Предстоит' : s === 'past' ? 'Прошла' : 'Отменена']];
  return page('my', `<div class="wrap two t3"><div><a class="crumb" href="#/my">Мои записи</a> <span class="mut">/</span> <b>Запись</b><h1 class="t1">${long(b.day, b.t).replace(' · ', ', ')}</h1>
    <div class="facts2">${F2.map(f => `<div><span class="mut">${f[0]}</span><b>${f[1]}</b></div>`).join('')}</div></div><aside><div class="plate acts2">${act}</div></aside></div>`);
}

function review(id) {
  const b = bookings().find(x => x.id === id); if (!b || state(b) !== 'past') return notFound();
  const p = psy(b.pid);
  return page('my', `<div class="wrap two t3"><div><h1 class="t1">Как прошла встреча?</h1><p class="mut">${p.name}</p></div><div><div class="plate fm"><div class="rt">${[1, 2, 3, 4, 5].map(n => `<button class="rb${RV.r === n ? ' on' : ''}" data-act="rate" data-v="${n}" aria-label="Оценка ${n}">${n}</button>`).join('')}</div><em class="em" id="e-r"></em>
    <label class="fld"><span>Расскажите подробнее (необязательно)</span><textarea id="rtx" rows="4" maxlength="500">${esc(RV.txt)}</textarea></label></div>
    ${RV.r && RV.r <= 2 ? `<div class="plate wh note"><div><b>Что-то пошло не так?</b><p class="mut">Вы можете сообщить о проблеме.</p><a class="lk" href="#/report/${b.id}">Сообщить о проблеме ${I.arr}</a></div></div>` : ''}
    <div class="sticky"><button class="btn lm" data-act="send-review" data-v="${b.id}">Отправить</button></div></div></div>`, { cls: 'pad' });
}
function report(id) {
  const b = bookings().find(x => x.id === id); if (!b) return notFound();
  return page('my', `<div class="wrap two t3"><div><h1 class="t1">Сообщить о проблеме</h1><p class="mut">Опишите ситуацию — мы ответим на ваш контакт.</p></div><div><div class="plate fm">
    ${['Организация записи', 'Опоздание или неявка специалиста', 'Нарушение этики', 'Другое'].map((c, i) => `<label class="rd2"><input type="radio" name="cat" value="${c}" ${i ? '' : 'checked'}><i></i><span>${c}</span></label>`).join('')}
    <label class="fld" id="f-t"><span>Опишите ситуацию (от 20 символов)</span><textarea id="rpt" rows="4" maxlength="1000"></textarea><em class="em"></em></label></div>
    <div class="sticky"><button class="btn lm" data-act="send-report" data-v="${b.id}">Отправить</button></div></div></div>`, { cls: 'pad' });
}
function help() {
  return page('help', `<div class="wrap two t3"><div><h1 class="t1">Нужна срочная помощь?</h1><p class="lead">HEALME — сервис записи на консультации. Он не предназначен для экстренных ситуаций. Если вам или кому-то рядом угрожает опасность, позвоните в экстренную службу прямо сейчас.</p></div>
    <div><div class="plate hl"><b>Единый номер экстренных служб</b><span class="num">112</span><a class="btn lm" href="tel:112">Позвонить</a></div>
    <p><a class="lk" href="#/">← Вернуться на главную</a></p></div></div>`);
}
function notFound() { return page('', `<div class="wrap res"><div><h1 class="t1">Страница не найдена</h1><div class="acts"><a class="btn lm" href="#/">На главную</a></div></div></div>`); }
function redirect(h) { setTimeout(() => { location.hash = h; }, 0); return ''; }

/* ---------- маршрутизация ---------- */
const R = [[/^\/?$/, home, 'Забота о себе начинается с одной записи'], [/^\/psychologists$/, catalog, 'Психологи'], [/^\/psychologist\/(\w+)$/, card, 'Психолог'], [/^\/time\/(\w+)$/, time, 'Выбор времени'],
  [/^\/form\/(\w+)$/, form, 'Ваши данные'], [/^\/done\/(\w+)$/, done, 'Готово'], [/^\/my$/, my, 'Мои записи'], [/^\/my\/(\w+)$/, details, 'Запись'],
  [/^\/review\/(\w+)$/, review, 'Отзыв'], [/^\/report\/(\w+)$/, report, 'Обращение'], [/^\/help$/, help, 'Срочная помощь']];
function render(keep) {
  const y = scrollY, dl = $('.days') ? $('.days').scrollLeft : 0, parts = (location.hash.slice(1) || '/').split('?');
  Q = Object.fromEntries(new URLSearchParams(parts[1] || '')); closeModal();
  if (parts[0] === '/psychologists' && Q.tag) { F.tag = Q.tag; history.replaceState(null, '', '#/psychologists'); }
  let html = null, title = '';
  for (const r of R) { const m = parts[0].match(r[0]); if (m) { html = r[1](m[1]); title = r[2]; break; } }
  if (html === null) html = notFound();
  document.title = 'HEALME — ' + title;
  app.innerHTML = html;
  if ($('.days')) $('.days').scrollLeft = dl;
  if (keep) scrollTo(0, y); else if (Q.s) { const el = document.getElementById(Q.s); el ? el.scrollIntoView() : scrollTo(0, 0); } else scrollTo(0, 0);
  if (parts[0] === '/psychologists' && !loaded && Q.fail === undefined) { setTimeout(() => { loaded = true; if (location.hash.indexOf('/psychologists') > 0) render(true); }, 350); }
}
window.addEventListener('hashchange', () => render(false));

/* ---------- модальные окна ---------- */
function openModal(html) { modal.innerHTML = `<div class="ov" data-act="close"><div class="md" role="dialog" aria-modal="true">${html}</div></div>`; document.body.classList.add('lock'); }
function closeModal() { modal.innerHTML = ''; document.body.classList.remove('lock'); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
const menuHtml = () => `<div class="mn"><div class="wrap hdin">${logo(false)}<button class="bg" data-act="close" aria-label="Закрыть">${I.close}</button></div><nav>${NAV.map(n => `<a href="${n[0]}">${n[1]}</a>`).join('')}</nav><a class="btn lm" href="#/psychologists">ЗАПИСАТЬСЯ</a></div>`;

/* ---------- действия ---------- */
function setErr(id, msg) { const f = $('#' + id); if (!f) return; f.classList.toggle('er', !!msg); const e = $('.em', f) || $('#e-k'); if (e) e.textContent = msg || ''; }
function submitForm() {
  const n = $('#fn').value.trim(), m = $('#fm').value.trim(), ok = $('#fk').checked, cm = $('#fcm').value.trim();
  const en = n.length < 2 ? 'Введите имя от 2 символов' : '', em = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m) ? '' : 'Укажите email в формате name@mail.ru';
  setErr('f-n', en); setErr('f-m', em); $('#e-k').textContent = ok ? '' : 'Нужно согласие на обработку данных'; $('#e-g').textContent = '';
  if (en || em || !ok) { const f = $('.fld.er input'); if (f) f.focus(); return; }
  if (bookings().some(b => b.st === 'ok' && b.day === D.day && b.t === D.t && state(b) === 'up')) { $('#e-g').textContent = 'У вас уже есть встреча на это время.'; return; }
  if (busy(D.pid, D.day, D.t)) return openModal(`<h3>Это время только что заняли</h3><p class="mut">Выберите другое время или мы сообщим, когда оно освободится.</p>
    <a class="btn lm" href="#/time/${D.pid}">Выбрать другое время</a><button class="btn pu" data-act="wait">Сообщить, когда освободится</button><a class="lk" href="#/psychologists">Другой психолог</a>`);
  const id = 'b' + Date.now().toString(36), a = bookings(); a.push({ id, pid: D.pid, day: D.day, t: D.t, name: n, mail: m, cm, st: 'ok', moves: 0 }); saveB(a);
  D = {}; location.hash = '#/done/ok?b=' + id;
}
function ics(b) {
  const d = at(b.day, b.t), e = new Date(+d + 50 * 6e4), f = x => x.getFullYear() + pad(x.getMonth() + 1) + pad(x.getDate()) + 'T' + pad(x.getHours()) + pad(x.getMinutes()) + '00';
  const txt = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HEALME//RU', 'BEGIN:VEVENT', 'UID:' + b.id + '@healme', 'DTSTAMP:' + f(new Date()), 'DTSTART:' + f(d), 'DTEND:' + f(e), 'SUMMARY:Встреча', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/calendar' })); a.download = 'healme-vstrecha.ics'; a.click();
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const a = t.dataset.act, v = t.dataset.v;
  if (a === 'close') { if (t.classList.contains('ov') && e.target !== t) return; closeModal(); }
  else if (a === 'menu') { modal.innerHTML = menuHtml(); document.body.classList.add('lock'); }
  else if (a === 'flt') { F.open = F.open === v ? '' : v; render(true); }
  else if (a === 'opt') { F[t.dataset.k] = v; F.open = ''; render(true); }
  else if (a === 'reset') { F = { tag: '', fmt: '', price: '', tm: '', open: '' }; render(true); }
  else if (a === 'retry') { location.hash = '#/psychologists'; }
  else if (a === 'day') { D.day = v; D.t = ''; render(true); }
  else if (a === 'slot') { D.t = v; render(true); }
  else if (a === 'next') {
    if (!D.t) return;
    if (D.r) { const arr = bookings(), b = arr.find(x => x.id === D.r); b.day = D.day; b.t = D.t; b.moves = (b.moves || 0) + 1; saveB(arr); const id = b.id; D = {}; location.hash = '#/done/moved?b=' + id; }
    else location.hash = '#/form/' + D.pid;
  }
  else if (a === 'submit') submitForm();
  else if (a === 'wait') { const w = ls.get('w', []); w.push({ pid: D.pid, day: D.day, t: D.t }); ls.set('w', w); D = {}; location.hash = '#/done/wait'; }
  else if (a === 'ics') ics(bookings().find(b => b.id === v));
  else if (a === 'rate') { RV.txt = $('#rtx') ? $('#rtx').value : RV.txt; RV.r = +v; render(true); }
  else if (a === 'send-review') {
    RV.txt = $('#rtx').value.trim(); if (!RV.r) { $('#e-r').textContent = 'Выберите оценку от 1 до 5'; return; }
    const arr = bookings(), b = arr.find(x => x.id === v); b.review = { r: RV.r, txt: RV.txt }; saveB(arr); RV = { r: 0, txt: '' }; location.hash = '#/done/review';
  }
  else if (a === 'send-report') { const tx = $('#rpt').value.trim(); if (tx.length < 20) { setErr('f-t', 'Опишите ситуацию подробнее — не меньше 20 символов'); return; } location.hash = '#/done/report'; }
  else if (a === 'cancel-ask') openModal(`<h3>Отменить запись?</h3><p class="mut">Время освободится для других клиентов.</p><button class="btn lm" data-act="close">Оставить запись</button><button class="btn ol" data-act="cancel-yes" data-v="${v}">Да, отменить</button>`);
  else if (a === 'cancel-yes') { const arr = bookings(), b = arr.find(x => x.id === v); b.st = 'cancelled'; saveB(arr); location.hash = '#/done/cancelled?b=' + v; }
  else if (a === 'del-ask') openModal(`<h3>Удалить все данные?</h3><p class="mut">Записи, заявки и отзывы будут стёрты с этого устройства. Это нельзя отменить.</p><button class="btn lm" data-act="close">Отмена</button><button class="btn ol" data-act="del-yes">Да, удалить</button>`);
  else if (a === 'del-yes') { saveB([]); ls.set('w', []); D = {}; render(false); }
});
document.addEventListener('input', e => { if (e.target.closest('.fld.er') && e.target.matches('input,textarea')) { const f = e.target.closest('.fld'); f.classList.remove('er'); const m = $('.em', f); if (m) m.textContent = ''; } });
document.addEventListener('click', e => { if (F.open && !e.target.closest('.dw')) { F.open = ''; if (location.hash.indexOf('/psychologists') > 0) render(true); } }, true);

render(false);
})();
