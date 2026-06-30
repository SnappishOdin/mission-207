/* =====================================================================
   B.R.S. // MISSION 207
   Terminal de consultation — DOSSIER BRS-207 (2 rapports PDF).
   main.js — moteur unique, vanilla, sans dépendance.

   REPRISE INTÉGRALE de l'ossature du site « enquete » :
   moteur audio (Web Audio API), champ d'étoiles <canvas> (parallax + warp),
   écran d'amorçage, intro « ouverture de session » (pluie de code + lignes
   de code + barre de déchiffrement + tampon DOSSIER OUVERT + warp), bouton
   PASSER, son/muet + equalizer, télémétrie, localStorage, reduced-motion,
   lien REJOUER L'INTRO.

   RETIRÉ par rapport à enquete : la liste dynamique de rapports, la recherche
   plein-texte, le lecteur modale, la révélation recruteur (Konami) et toute
   la « solution ». Ici, deux cartes-rapport statiques renvoient vers des PDF.

   Sommaire :
   1. Utilitaires & état global
   2. Moteur audio (Web Audio API, 100% synthétique)
   3. Champ d'étoiles <canvas> (parallax + saut hyperespace)
   4. Intro : OUVERTURE DE SESSION (lignes de code) -> terminal
   5. Comportements live (télémétrie, equalizer) + beep des boutons
   6. Son / rejouer
   ===================================================================== */

(() => {
'use strict';

document.body.classList.remove('no-js');

/* =====================================================================
   1. UTILITAIRES & ÉTAT GLOBAL
   ===================================================================== */
const $  = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
const rand = (a, b) => a + Math.random() * (b - a);
const pad  = (n, l = 2) => String(n).padStart(l, '0');
const delay = ms => new Promise(r => setTimeout(r, ms));

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const LS_KEY  = 'brs_corsaire_intro_vue';

let soundOn  = true;
let hudReady = false;
let accessGranted = false;        // le mot de passe a-t-il été validé ?
let cryptoKey = null;             // clé AES dérivée du mot de passe (en mémoire après déverrouillage)

/* =====================================================================
   SÉCURITÉ — les PDF sont chiffrés (AES-256-GCM) avec une clé dérivée
   du mot de passe (PBKDF2). Le mot de passe N'APPARAÎT PAS en clair ici :
   seul un « témoin » chiffré sert à valider la saisie. Sans le bon code,
   les fichiers .enc sont inexploitables.
   (Pour changer le mot de passe ou les PDF, il faut re-chiffrer à partir
    des PDF d'origine — voir le script d'encryption.)
   ===================================================================== */
const SEC = {
  salt: 'cxDU9w5q36kNG/KgIDyr+w==',
  iter: 200000,
  sentinel: '9lJcZg5fS7ZxpipjRT610XZ9eQohmV8Vw9p3CCvIRGD+jg=='
};
const b64ToBuf = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

/* dérive la clé AES-GCM depuis le mot de passe saisi (PBKDF2-SHA256) */
async function deriveKey(pw) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b64ToBuf(SEC.salt), iterations: SEC.iter, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
  );
}
/* déchiffre un buffer « IV(12o) || ciphertext+tag » */
async function decryptBuf(buf, key) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12)));
}
/* tente de déverrouiller : dérive la clé et déchiffre le témoin */
async function tryUnlock(pw) {
  try {
    const key = await deriveKey(pw);
    const out = await decryptBuf(b64ToBuf(SEC.sentinel), key);
    if (new TextDecoder().decode(out) === 'BRS-OK') { cryptoKey = key; return true; }
  } catch (e) {}
  return false;
}

/* =====================================================================
   2. MOTEUR AUDIO — Web Audio API (repris d'enquete, identique)
   ===================================================================== */
let AC = null, masterGain = null, analyser = null, freqData = null;
let droneOsc1 = null, droneOsc2 = null, droneGain = null;

function armAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  AC = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = AC.createGain();
  masterGain.gain.value = 0.9;
  analyser = AC.createAnalyser();
  analyser.fftSize = 64;
  freqData = new Uint8Array(analyser.frequencyBinCount);
  masterGain.connect(analyser);
  analyser.connect(AC.destination);
}

function beep(freq = 660, dur = 0.09, type = 'square', gain = 0.16) {
  if (!AC || !soundOn) return;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, AC.currentTime);
  g.gain.linearRampToValueAtTime(gain, AC.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
  o.connect(g).connect(masterGain);
  o.start(); o.stop(AC.currentTime + dur);
}

function lockSound() {
  beep(180, 0.12, 'sine', 0.22);
  setTimeout(() => beep(90, 0.22, 'sawtooth', 0.2), 110);
}

function hyperdrive() {
  if (!AC || !soundOn) return;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(60, AC.currentTime);
  o.frequency.exponentialRampToValueAtTime(900, AC.currentTime + 1.6);
  g.gain.setValueAtTime(0.0001, AC.currentTime);
  g.gain.linearRampToValueAtTime(0.22, AC.currentTime + 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + 1.9);
  o.connect(g).connect(masterGain);
  o.start(); o.stop(AC.currentTime + 2);
}

function bootSequence() {
  [523, 659, 784, 1046].forEach((f, i) =>
    setTimeout(() => beep(f, 0.07, 'square', 0.12), i * 120));
}

function startDrone() {
  if (!AC || !soundOn || droneOsc1) return;
  try {
    droneGain = AC.createGain();
    droneGain.gain.setValueAtTime(0.0001, AC.currentTime);
    droneGain.gain.linearRampToValueAtTime(0.06, AC.currentTime + 2.0);
    
    droneOsc1 = AC.createOscillator();
    droneOsc1.type = 'sine';
    droneOsc1.frequency.setValueAtTime(55, AC.currentTime);
    
    droneOsc2 = AC.createOscillator();
    droneOsc2.type = 'triangle';
    droneOsc2.frequency.setValueAtTime(55.4, AC.currentTime);
    
    const filter = AC.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(110, AC.currentTime);
    
    droneOsc1.connect(filter);
    droneOsc2.connect(filter);
    filter.connect(droneGain).connect(masterGain);
    
    droneOsc1.start();
    droneOsc2.start();
  } catch (e) {
    console.error("Drone failed to start", e);
  }
}

function stopDrone() {
  if (droneGain) {
    try {
      droneGain.gain.setValueAtTime(droneGain.gain.value, AC.currentTime);
      droneGain.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + 0.5);
      const o1 = droneOsc1, o2 = droneOsc2;
      setTimeout(() => {
        try { o1.stop(); o2.stop(); } catch(e) {}
      }, 600);
    } catch(e) {}
    droneOsc1 = null;
    droneOsc2 = null;
    droneGain = null;
  }
}

function playKeySound() {
  if (!AC || !soundOn) return;
  try {
    const o = AC.createOscillator(), g = AC.createGain(), f = AC.createBiquadFilter();
    o.type = 'triangle';
    o.frequency.setValueAtTime(rand(900, 1500), AC.currentTime);
    
    f.type = 'highpass';
    f.frequency.setValueAtTime(1000, AC.currentTime);
    
    g.gain.setValueAtTime(0.0001, AC.currentTime);
    g.gain.linearRampToValueAtTime(0.012, AC.currentTime + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + 0.025);
    
    o.connect(f).connect(g).connect(masterGain);
    o.start();
    o.stop(AC.currentTime + 0.03);
  } catch (e) {}
}

/* =====================================================================
   3. CHAMP D'ÉTOILES <canvas> : parallax + saut hyperespace
   ===================================================================== */
const cv  = $('#starfield');
const ctx = cv.getContext('2d');
let W, H, stars = [];
let mouseX = 0, mouseY = 0;
let warp = 0, warping = false;

function resize() {
  W = cv.width  = window.innerWidth;
  H = cv.height = window.innerHeight;
  const n = Math.min(420, Math.floor((W * H) / 2600));
  stars = Array.from({ length: n }, () => ({
    x: Math.random() * W, y: Math.random() * H,
    z: rand(0.2, 1), r: rand(0.3, 1.6)
  }));
}
window.addEventListener('resize', resize);
resize();

window.addEventListener('mousemove', e => {
  mouseX = (e.clientX / W - 0.5);
  mouseY = (e.clientY / H - 0.5);
});

function drawStars() {
  if (warping) {
    ctx.fillStyle = 'rgba(5,7,11,.35)';
    ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    for (const s of stars) {
      const dx = s.x - cx, dy = s.y - cy;
      const stretch = 1 + warp * 14;
      ctx.strokeStyle = 'rgba(33,230,255,' + (0.25 + 0.6 * warp) + ')';
      ctx.lineWidth = 1 + warp * 1.5;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(cx + dx * stretch, cy + dy * stretch);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = 'rgba(5,7,11,.55)';
    ctx.fillRect(0, 0, W, H);
    const px = REDUCED ? 0 : mouseX * 26, py = REDUCED ? 0 : mouseY * 26;
    for (const s of stars) {
      const x = s.x + px * s.z, y = s.y + py * s.z;
      const a = 0.4 + s.z * 0.6;
      ctx.fillStyle = s.z > 0.85
        ? 'rgba(33,230,255,' + a + ')'
        : 'rgba(234,246,255,' + a + ')';
      ctx.beginPath();
      ctx.arc(x, y, s.r * s.z, 0, 6.283);
      ctx.fill();
      if (!REDUCED) { s.y += 0.02 * s.z; if (s.y > H) s.y = 0; }
    }
  }
  requestAnimationFrame(drawStars);
}
drawStars();

function doWarp() {
  return new Promise(resolve => {
    if (REDUCED) { resolve(); return; }
    warping = true; warp = 0;
    hyperdrive();
    const t0 = performance.now();
    const dur = 1700;
    (function step(t) {
      if (hudReady) { warping = false; resolve(); return; }
      warp = Math.min(1, (t - t0) / dur);
      if (warp < 1) requestAnimationFrame(step);
      else { flash(0.45); setTimeout(() => { warping = false; resolve(); }, 200); }
    })(t0);
  });
}

function flash(hold = 0.2, color) {
  const f = $('#flash');
  if (color) f.style.background = color; else f.style.background = '#fff';
  f.classList.add('go');
  setTimeout(() => { f.classList.remove('go'); f.style.background = '#fff'; }, hold * 1000);
}

/* =====================================================================
   4. INTRO : OUVERTURE DE SESSION -> TERMINAL DE CONSULTATION
   (même mécanisme/timing qu'enquete ; lignes thématisées 207)
   ===================================================================== */
const scBoot  = $('#screen-boot');
const scCrawl = $('#screen-crawl');
const hud     = $('#hud');

let breachOn = false;
let breachWaiters = [];

const sleep = ms => new Promise(r => {
  if (!breachOn) { r(); return; }
  const w = { r };
  w.id = setTimeout(r, ms);
  breachWaiters.push(w);
});
function flushBreachWaiters() {
  const ws = breachWaiters; breachWaiters = [];
  ws.forEach(w => { clearTimeout(w.id); w.r(); });
}
const GLYPHS = 'アカサタナハマヤラ0123456789{}[]()<>/\\;:=+*$#@%&';

let rainCols = [];
function startCodeRain() {
  const cvR = $('#codeRain');
  if (!cvR || REDUCED) return;
  const cx = cvR.getContext('2d');
  const fs = 16;
  cvR.width  = cvR.clientWidth  || window.innerWidth;
  cvR.height = cvR.clientHeight || window.innerHeight;
  rainCols = Array.from({ length: Math.ceil(cvR.width / fs) }, () => rand(-40, 0));
  (function draw() {
    if (!breachOn) return;
    cx.fillStyle = 'rgba(5,7,11,.10)';
    cx.fillRect(0, 0, cvR.width, cvR.height);
    cx.font = fs + 'px "Share Tech Mono", monospace';
    for (let i = 0; i < rainCols.length; i++) {
      const ch = GLYPHS[(Math.random() * GLYPHS.length) | 0];
      const y = rainCols[i] * fs;
      cx.fillStyle = Math.random() < 0.05 ? 'rgba(234,246,255,.9)' : 'rgba(33,230,255,.5)';
      cx.fillText(ch, i * fs, y);
      if (y > cvR.height && Math.random() > 0.975) rainCols[i] = 0;
      rainCols[i] += 1;
    }
    requestAnimationFrame(draw);
  })();
}

function codeLine(html, freq) {
  if (!breachOn) return;
  const out = $('#sessionLog');
  if (!out) return;
  const parsed = html
    .replace(/<k>(.*?)<\/k>/g,   '<span class="k">$1</span>')
    .replace(/<s>(.*?)<\/s>/g,   '<span class="s">$1</span>')
    .replace(/<n>(.*?)<\/n>/g,   '<span class="n">$1</span>')
    .replace(/<f>(.*?)<\/f>/g,   '<span class="f">$1</span>')
    .replace(/<c>(.*?)<\/c>/g,   '<span class="c">$1</span>')
    .replace(/<ok>(.*?)<\/ok>/g, '<span class="ok">$1</span>')
    .replace(/<d>(.*?)<\/d>/g,   '<span class="dim">$1</span>');
  out.innerHTML += parsed + '\n';
  out.scrollTop = out.scrollHeight;
  if (freq) beep(freq, 0.03, 'square', 0.05);
  else playKeySound();
}

async function decryptBar(label) {
  const out = $('#sessionLog');
  if (!out || !breachOn) return;
  const span = document.createElement('span');
  out.appendChild(span);
  const WB = 22;
  for (let p = 0; p <= 100; p += 4) {
    if (!breachOn) return;
    const fill = Math.round(WB * p / 100);
    span.innerHTML = label + ' <span class="dim">[' +
      '█'.repeat(fill) + '░'.repeat(WB - fill) + ']</span> <span class="ok">' + p + '%</span>\n';
    out.scrollTop = out.scrollHeight;
    if (p % 16 === 0) beep(rand(480, 760), 0.02, 'square', 0.04);
    await sleep(REDUCED ? 0 : 34);
  }
}

function setStatus(txt, ok) {
  const s = $('#sessionStatus');
  if (!s) return;
  s.textContent = txt;
  s.classList.toggle('ok', !!ok);
}

$('#btnInit').addEventListener('click', async () => {
  if (accessGranted) return;
  armAudio();                                   // le clic est un geste utilisateur → arme l'audio
  const input = $('#passInput');
  const val = input ? input.value : '';
  const err = $('#passError');
  const btn = $('#btnInit');

  // --- vérification du mot de passe (déchiffre le témoin) ---
  if (err) { err.textContent = 'vérification…'; err.classList.remove('ok'); }
  if (btn) btn.disabled = true;
  const okPw = await tryUnlock(val);
  if (btn) btn.disabled = false;

  if (!okPw) {
    beep(160, 0.18, 'sawtooth', 0.16);          // buzz d'erreur
    if (err) { err.textContent = '✕ CODE INCORRECT — ACCÈS REFUSÉ'; err.classList.remove('ok'); }
    const bi = $('.boot-inner');
    if (bi) { bi.classList.remove('shake'); void bi.offsetWidth; bi.classList.add('shake'); }
    if (input) { input.value = ''; input.focus(); }
    return;
  }

  // --- code accepté : clé en mémoire (cryptoKey) ---
  accessGranted = true;
  if (err) { err.textContent = '✓ CODE ACCEPTÉ'; err.classList.add('ok'); }
  if (input) input.blur();
  beep(120, 0.25, 'sine', 0.22);                // bip grave d'amorçage
  const lg = $('#bootLogo');
  lg.style.transition = 'filter .6s ease, transform .6s ease';
  lg.style.filter = 'drop-shadow(0 0 22px rgba(33,230,255,.8))';
  lg.style.transform = 'scale(1.06)';
  setTimeout(() => { lockSound(); flash(0.18); }, 450);
  const returning = localStorage.getItem(LS_KEY) === '1';
  setTimeout(() => {
    if (hudReady) return;            // l'utilisateur a déjà PASSÉ pendant le délai
    scBoot.classList.add('hidden');
    if (returning) runReturnSession();
    else runSession();
  }, 1000);
});

/* validation au clavier (Entrée) + focus automatique sur le champ code */
if ($('#passInput')) {
  $('#passInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#btnInit').click(); } });
  $('#passInput').focus();
}

$('#btnSkip').addEventListener('click', () => { beep(300, 0.06); enterHud(true); });
/* Échap passe l'intro (uniquement APRÈS validation du code, sinon la porte ne sert à rien) */
window.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const ov = $('#dlOverlay');
  if (ov && !ov.classList.contains('hidden')) { ov.classList.add('hidden'); return; }
  if (accessGranted && !hudReady) enterHud(true);
});

/* --- intro complète (lignes thématisées MISSION 207) --- */
async function runSession() {
  if (breachOn) return;
  breachOn = true;
  scCrawl.classList.remove('hidden');
  startCodeRain();

  if (REDUCED) { await reducedOpen(); return; }

  setStatus('LIAISON');
  codeLine('<c># visor // déchiffrement dossier 207</c>', 0);              await sleep(280);
  codeLine('<k>import</k> renseignement, crypt, comlink', 720);                await sleep(240);
  codeLine('<k>from</k> brs.dossier <k>import</k> Mission207, Rapport', 760);   await sleep(320);
  codeLine('', 0);
  codeLine('comlink.<f>handshake</f>(<s>relais holonet GAR</s>) <d>…</d>', 600); await sleep(460);
  codeLine('comlink.<f>connect</f>(<s>comlink://brs-core:7.71</s>) <d>→</d> <ok>liaison établie</ok>', 900); await sleep(380);
  codeLine('auth.<f>clearance</f>(agent) <d>→</d> <ok>accès confidentiel ✓</ok>', 940); await sleep(460);
  codeLine('', 0);

  setStatus('DÉCHIFFREMENT');
  codeLine('dossier = crypt.<f>open</f>(<s>~/.brs/207.vault</s>)', 820);    await sleep(340);
  await decryptBar('decrypt(dossier 207)');
  codeLine('', 0);
  codeLine('Mission207.<f>load</f>(<s>Rapport_Surveillance_212e.pdf</s>) <d>→</d> <ok>monté</ok>', 740); await sleep(300);
  codeLine('Mission207.<f>load</f>(<s>Rapport_Final_212e.pdf</s>)        <d>→</d> <ok>monté</ok>', 740); await sleep(340);
  codeLine('', 0);

  setStatus('INDEXATION');
  codeLine('Mission207.<f>index</f>(rapports) <d>…</d>', 700);                   await sleep(440);
  await decryptBar('indexation(BRS-207)');
  codeLine('', 0);
  codeLine('Mission207.<f>render</f>()', 880); await sleep(320);

  await sessionOpen();
}

/* --- intro courte (visite de retour, dossier en cache) --- */
async function runReturnSession() {
  if (breachOn) return;
  breachOn = true;
  scCrawl.classList.remove('hidden');
  startCodeRain();

  if (REDUCED) { await reducedOpen(); return; }

  setStatus('SESSION');
  codeLine('<c># dossier 207 déjà déchiffré (cache)</c>', 0);             await sleep(140);
  codeLine('crypt.<f>resume</f>(<s>~/.brs/207.vault</s>) <d>→</d> <ok>ok</ok>', 820); await sleep(160);
  await decryptBar('remount(207)');
  codeLine('', 0);
  await sessionOpen();
}

async function sessionOpen() {
  if (hudReady) return;
  setStatus('DOSSIER OUVERT', true);
  codeLine('<d>></d> <ok>dossier 207 ouvert.</ok> bonne consultation, agent.', 0);
  const g = $('#granted');
  if (g) { g.hidden = false; void g.offsetWidth; g.classList.add('go'); }
  lockSound();
  setTimeout(bootSequence, 160);
  flash(0.26);
  await sleep(900);
  await goTerminal();
}

async function reducedOpen() {
  setStatus('DOSSIER OUVERT', true);
  codeLine('<d>></d> <ok>dossier 207 ouvert</ok> — bonne consultation, agent.', 700);
  await sleep(900);
  enterHud(false);
}

/* ---- transition intro -> terminal (warp hyperespace) ---- */
async function goTerminal() {
  if (hudReady) return;
  scCrawl.classList.add('hidden');
  await doWarp();
  enterHud(false);
}

function enterHud(skipped) {
  if (hudReady) return;
  hudReady = true;
  breachOn = false;
  flushBreachWaiters();
  warping = false;
  const g = $('#granted'); if (g) { g.classList.remove('go'); g.hidden = true; }
  scBoot.classList.add('hidden');
  scCrawl.classList.add('hidden');
  hud.classList.remove('hidden');
  localStorage.setItem(LS_KEY, '1');
  if (!skipped) bootSequence();
  if (soundOn) startDrone();
  initHud();
}

/* visite de retour : adapte le sous-titre du bouton d'amorçage */
if (localStorage.getItem(LS_KEY) === '1') {
  const sub = $('.btn-init .btn-sub');
  if (sub) sub.textContent = 'réouverture du dossier 207';
}

/* =====================================================================
   5. COMPORTEMENTS LIVE : télémétrie, equalizer, beep des boutons
   ===================================================================== */
function initHud() {
  startTelemetry();
  startEqualizer();
  wireCardButtons();
  wireDownloads();
  initOscilloscope();
  initConsole();
  initLiveFeed();
  initPdfModal();
  $('#cRapports').textContent = '02';
  $('#year').textContent = new Date().getFullYear();
}

function startTelemetry() {
  const sectors = ['BORDURE', 'CONVOI C7', 'FLOTTE COSMOS', 'NAVY RÉPUB.', 'ESCORTE'];
  function tick() {
    $('#tSector').textContent = sectors[Math.floor(rand(0, sectors.length))];
    $('#tCoord').textContent  = `${pad(Math.floor(rand(0,360)),3)}.${pad(Math.floor(rand(0,99)))}.${pad(Math.floor(rand(0,99)))}`;
    const d = new Date();
    $('#tTime').textContent   = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  tick(); setInterval(tick, 1000);
}

function startEqualizer() {
  const bars = $$('.eq i');
  function frame() {
    if (analyser && soundOn) {
      analyser.getByteFrequencyData(freqData);
      bars.forEach((b, i) => {
        const v = freqData[i % freqData.length] / 255;
        b.style.height = (3 + v * 17).toFixed(0) + 'px';
      });
    } else {
      bars.forEach((b, i) =>
        b.style.height = (3 + (Math.sin(performance.now()/300 + i) * 0.5 + 0.5) * (REDUCED?0:5)).toFixed(0) + 'px');
    }
    requestAnimationFrame(frame);
  }
  frame();
}

/* petit beep au clic des boutons télécharger / consulter */
function wireCardButtons() {
  $$('[data-beep]').forEach(btn =>
    btn.addEventListener('click', () => beep(740, 0.06)));
}

/* === TÉLÉCHARGEMENT : animation + déchiffrement du .enc, puis download forcé === */
function wireDownloads() {
  $$('.rc-btn-dl').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    const href = a.getAttribute('href');                       // ...pdf.enc
    if (href) startDownload(href, href.split('/').pop().replace(/\.enc$/i, ''));
  }));
  // fermeture de l'overlay par clic sur le fond
  const ov = $('#dlOverlay');
  if (ov) ov.addEventListener('click', e => { if (e.target === ov) ov.classList.add('hidden'); });
}

let dlBusy = false;
async function startDownload(encHref, name) {
  const ov = $('#dlOverlay');
  if (!ov || dlBusy) return;
  dlBusy = true;
  const bar = $('#dlBar'), status = $('#dlStatus'), pctEl = $('#dlPct'), fileEl = $('#dlFile');
  ov.classList.remove('hidden');
  fileEl.textContent = name;
  bar.style.width = '0%'; pctEl.textContent = '0%';
  status.textContent = 'connexion au coffre B.R.S…';
  beep(660, 0.05);

  // récupère le fichier chiffré puis le DÉCHIFFRE en mémoire (clé issue du mot de passe)
  let blobUrl = null, ok = true;
  const work = (async () => {
    if (!cryptoKey) throw 0;
    const buf = new Uint8Array(await (await fetch(encHref)).arrayBuffer());
    const clear = await decryptBuf(buf, cryptoKey);
    blobUrl = URL.createObjectURL(new Blob([clear], { type: 'application/pdf' }));
  })().catch(() => { ok = false; });

  // animation de la barre
  const steps = [
    [12, 'authentification de l’agent…'],
    [34, 'déchiffrement du document…'],
    [58, 'transfert sécurisé…'],
    [82, 'vérification d’intégrité…'],
    [100, 'finalisation…']
  ];
  for (const [pct, label] of steps) {
    status.textContent = label;
    bar.style.width = pct + '%'; pctEl.textContent = pct + '%';
    beep(rand(520, 900), 0.03, 'square', 0.05);
    await delay(REDUCED ? 70 : 440);
  }

  await work;
  if (!ok || !blobUrl) {
    status.textContent = '✕ ÉCHEC DU DÉCHIFFREMENT';
    beep(160, 0.18, 'sawtooth', 0.14);
    await delay(1600); ov.classList.add('hidden'); dlBusy = false; return;
  }
  // téléchargement forcé du PDF déchiffré
  const t = document.createElement('a');
  t.href = blobUrl; t.download = name;
  document.body.appendChild(t); t.click(); t.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
  status.textContent = '✓ TÉLÉCHARGEMENT LANCÉ';
  lockSound();
  await delay(1400); ov.classList.add('hidden'); dlBusy = false;
}

function initOscilloscope() {
  const canvas = $('#oscilloscope');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let width = canvas.width = canvas.parentElement.clientWidth;
  let height = canvas.height = canvas.parentElement.clientHeight || 100;
  
  window.addEventListener('resize', () => {
    if (canvas.parentElement) {
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight || 100;
    }
  });

  const bufferLength = analyser ? analyser.frequencyBinCount : 32;
  const timeData = new Uint8Array(bufferLength);
  let phase = 0;
  
  function draw() {
    if (!hudReady) return;
    requestAnimationFrame(draw);
    
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(33, 230, 255, 0.85)';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 4;
    ctx.shadowColor = 'rgba(33, 230, 255, 0.6)';
    ctx.beginPath();
    
    if (analyser && soundOn) {
      analyser.getByteTimeDomainData(timeData);
      const sliceWidth = width / bufferLength;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const v = timeData[i] / 128.0;
        const y = v * (height / 2);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
    } else {
      phase += REDUCED ? 0.02 : 0.08;
      const sliceWidth = width / 100;
      let x = 0;
      for (let i = 0; i <= 100; i++) {
        const amp = height * 0.25;
        const y = (height / 2) + 
                  Math.sin(i * 0.15 - phase) * amp + 
                  Math.cos(i * 0.05 + phase * 0.5) * (amp * 0.3);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  
  draw();
}

function initConsole() {
  const input = $('#consoleInput');
  const history = $('#consoleHistory');
  if (!input || !history) return;
  
  function printLine(text, type = 'dim') {
    const div = document.createElement('div');
    div.className = `con-line ${type}`;
    div.textContent = text;
    history.appendChild(div);
    history.scrollTop = history.scrollHeight;
  }
  
  async function printLinesSlow(lines, type = 'dim') {
    input.disabled = true;
    for (const line of lines) {
      printLine(line, type);
      beep(880, 0.02, 'sine', 0.05);
      await delay(150);
    }
    input.disabled = false;
    input.focus();
  }

  input.addEventListener('keydown', async e => {
    if (e.key === 'Enter') {
      const rawCmd = input.value.trim();
      input.value = '';
      if (!rawCmd) return;
      
      playKeySound();
      printLine(`> ${rawCmd}`, 'info');
      
      const cmd = rawCmd.toLowerCase();
      
      if (cmd === 'clear') {
        history.innerHTML = '';
        return;
      }
      
      if (cmd === 'help') {
        printLine("DIRECTIVES ACCESSIBLES :", "warn");
        printLine("- help      : Liste des directives du terminal.", "dim");
        printLine("- status    : Exécute un diagnostic complet.", "dim");
        printLine("- logs      : Consulte les logs de transmission.", "dim");
        printLine("- decrypt   : Teste la liaison de clé Holonet.", "dim");
        printLine("- clearance : Affiche vos autorisations de sécurité.", "dim");
        printLine("- cody      : Fiche Renseignement Cody (CC-2224).", "dim");
        printLine("- airo      : Fiche Renseignement Airo (CD-L 9771).", "dim");
        printLine("- zouro     : Fiche Renseignement Compagnie Zouro.", "dim");
        printLine("- clear     : Efface l'historique de la console.", "dim");
        return;
      }
      
      if (cmd === 'status') {
        await printLinesSlow([
          "Lancement du diagnostic global...",
          "  Liaison BRS-Core : OK (Accès chiffré)",
          "  Intégrité mémoire : 100% (Aucun bloc corrompu)",
          "  Signal Réseau Holonet : EXCELLENT (98.4%)",
          "  Système Audio : EN SERVICE (Synthétiseur actif)",
          "Diagnostic : NOMINAL ✓"
        ], "ok");
        return;
      }
      
      if (cmd === 'logs') {
        printLine("LOGS DE TRANSMISSION RÉCENTS :", "warn");
        const t = new Date();
        const timeStr = () => `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
        printLine(`[${timeStr()}] Connexion cryptée établie.`, "dim");
        printLine(`[${timeStr()}] Chargement dossier M-207 en mémoire tampon.`, "dim");
        printLine(`[${timeStr()}] Rapport_Surveillance_212e_BRS.pdf scanné.`, "dim");
        printLine(`[${timeStr()}] Rapport_Final_212e_BRS.pdf scanné.`, "dim");
        printLine(`[${timeStr()}] Prêt pour consultation sécurisée.`, "ok");
        return;
      }
      
      if (cmd === 'clearance') {
        printLine("DÉTAIL D'ACCRÉDITATION :", "warn");
        printLine("  GRADE : Agent Spécialisé B.R.S.", "dim");
        printLine("  NIVEAU D'ACCÈS : Niveau 4 (Confidentiel Amirauté)", "dim");
        printLine("  SECTEUR D'OPÉRATIONS : Bordure Extérieure", "dim");
        printLine("  MANDAT ACTUEL : Mission 207 (Surveillance 212e)", "dim");
        beep(900, 0.08, 'square', 0.08);
        return;
      }
      
      if (cmd === 'decrypt') {
        input.disabled = true;
        printLine("Test de clé de chiffrement...", "info");
        beep(440, 0.1, 'sine', 0.1);
        await delay(500);
        
        const WB = 15;
        const lineDiv = document.createElement('div');
        lineDiv.className = 'con-line dim';
        history.appendChild(lineDiv);
        
        for (let p = 0; p <= 100; p += 10) {
          const fill = Math.round(WB * p / 100);
          lineDiv.textContent = `  Décryptage Holonet [${'█'.repeat(fill)}${'░'.repeat(WB - fill)}] ${p}%`;
          history.scrollTop = history.scrollHeight;
          beep(600 + p*2, 0.03, 'sine', 0.04);
          await delay(100);
        }
        
        printLine("Clé Holonet validée. Liaison 100% sécurisée.", "ok");
        input.disabled = false;
        input.focus();
        return;
      }
      
      if (cmd === 'cody') {
        printLine("DOSSIER CODEX // CC-2224 \"CODY\"", "warn");
        printLine("  FONCTION : Commandant Clone du 212e Bataillon", "dim");
        printLine("  DEGRÉ DE LOYAUTÉ : 100% (Directives directes)", "dim");
        printLine("  RAPPORTS BRS : R.A.S. Tactique militaire irréprochable.", "dim");
        return;
      }
      
      if (cmd === 'airo') {
        printLine("DOSSIER CODEX // CD-L 9771 \"AIRO\"", "warn");
        printLine("  FONCTION : Officier de Liaison BRS", "dim");
        printLine("  NOTE : Responsable des relevés d'interception comlink.", "dim");
        printLine("  STATUT : Actif. Transmission du dossier en cours.", "dim");
        return;
      }
      
      if (cmd === 'zouro') {
        printLine("DOSSIER CODEX // COMPAGNIE ZOURO", "warn");
        printLine("  UNITÉ : Compagnie Zouro (212e Bataillon)", "dim");
        printLine("  EFFECTIFS : 144 unités de combat clones", "dim");
        printLine("  SURVEILLANCE BRS : Communications infiltrées.", "dim");
        return;
      }
      
      printLine(`Directives '${rawCmd}' non reconnues.`, 'err');
      printLine("Taper 'help' pour la liste des directives.", 'dim');
      beep(180, 0.15, 'sawtooth', 0.12);
    }
  });
}

function initLiveFeed() {
  const feed = $('#feedBox');
  if (!feed) return;
  
  const logPool = [
    "SYS: COMLINK ACTIF",
    "COMLINK: PACKET INCOMING...",
    "COMLINK: BLOCK #4802 REÇU",
    "SECURE: CLE RSA CONFIRMÉE",
    "RESEAU: SYNC HOLONET RELAIS OK",
    "BRS: SCAN DE SÉCURITÉ EN COURS",
    "ALERTE: PORT COLLISION (CORRIGÉ)",
    "INFO: TRANSFERT DE FLUX CHIFFRÉ M-207",
    "SYS: COMPILATION LOGS BATAILLON",
    "COMLINK: LATENCE 42ms STABLE",
    "SYS: MEMOIRE TAMPON NETTOYEE",
    "SECURE: CLE PRIVEE MISE A JOUR",
    "BRS: INTERCEPTION FLUX COD Cody",
    "COMLINK: LIAISON DU CONVOI EN COURS"
  ];
  
  setInterval(() => {
    if (!hudReady) return;
    const txt = logPool[Math.floor(rand(0, logPool.length))];
    const t = new Date();
    const timeStr = `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
    
    const div = document.createElement('div');
    div.className = 'feed-line';
    div.textContent = `[${timeStr}] ${txt}`;
    feed.appendChild(div);
    
    while (feed.children.length > 5) {
      feed.removeChild(feed.firstChild);
    }
  }, 4000);
}

function initPdfModal() {
  const modal = $('#pdfModal');
  const overlay = $('#pdfModalOverlay');
  const closeBtn = $('#pdfModalClose');
  const title = $('#pdfModalTitle');
  const frame = $('#pdfFrame');
  const loader = $('#pdfLoader');
  const openExternal = $('#pdfModalOpenExternal');
  
  if (!modal || !closeBtn || !frame || !loader) return;
  let curBlobUrl = null;
  
  $$('.rc-btn-view').forEach(btn => {
    btn.addEventListener('click', async () => {
      const encUrl = btn.getAttribute('data-pdf');
      const docTitle = btn.getAttribute('data-title');
      
      title.textContent = docTitle;
      frame.style.display = 'none';
      loader.style.display = 'flex';
      
      modal.classList.remove('hidden');
      modal.setAttribute('aria-hidden', 'false');
      
      beep(440, 0.12, 'sine', 0.15);
      setTimeout(() => beep(660, 0.1, 'sine', 0.12), 80);

      try {
        if (!cryptoKey) throw 0;
        const buf = new Uint8Array(await (await fetch(encUrl)).arrayBuffer());
        const clear = await decryptBuf(buf, cryptoKey);
        if (curBlobUrl) URL.revokeObjectURL(curBlobUrl);
        curBlobUrl = URL.createObjectURL(new Blob([clear], { type: 'application/pdf' }));
        openExternal.setAttribute('href', curBlobUrl);
        frame.src = curBlobUrl;
      } catch (e) {
        const lt = loader.querySelector('.loader-text');
        if (lt) lt.textContent = '✕ ÉCHEC DU DÉCHIFFREMENT';
        beep(160, 0.18, 'sawtooth', 0.14);
      }
    });
  });
  
  frame.addEventListener('load', () => {
    loader.style.display = 'none';
    frame.style.display = 'block';
    beep(880, 0.08, 'sine', 0.1);
  });
  
  function closeModal() {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    frame.src = '';
    if (curBlobUrl) { URL.revokeObjectURL(curBlobUrl); curBlobUrl = null; }
    beep(330, 0.1, 'sine', 0.1);
  }
  
  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', closeModal);
  
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeModal();
    }
  });
}

/* =====================================================================
   6. SON / REJOUER
   ===================================================================== */
$('#btnMute').addEventListener('click', e => {
  soundOn = !soundOn;
  e.currentTarget.setAttribute('aria-pressed', String(!soundOn));
  if (soundOn) {
    armAudio();
    beep(660, 0.08);
    if (hudReady) startDrone();
  } else {
    stopDrone();
  }
});

$('#btnReplay').addEventListener('click', e => {
  e.preventDefault();
  localStorage.removeItem(LS_KEY);
  location.reload();
});

})();
