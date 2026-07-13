/* ============================================================
 * engine.js —— 歌曲生成引擎（Web Audio 人声动态柔化处理链）
 * 每次成功「生成歌曲」由上层调用 Store.chargeSong() 扣 10 星币。
 * 本模块只负责音频处理与导出，不直接扣费（扣费在 app.js 里校验后进行）。
 * ============================================================ */

export const CONTROLS = [
  { key: 'throat',  name: '喉腔共振动态游离', unit: 'Hz', min: 20, max: 400, def: 120, group: '基础柔化' },
  { key: 'sat',     name: '非对称磁带饱和',   unit: '%',  min: 0, max: 100, def: 28, group: '基础柔化' },
  { key: 'rolloff', name: '高音滚降模拟',     unit: 'Hz', min: 4000, max: 20000, def: 9000, group: '基础柔化' },
  { key: 'beat',    name: '混沌节拍漂移',     unit: 'ms', min: 0, max: 50, def: 18, group: '基础柔化' },
  { key: 'vibrato', name: '自然颤音 Vibrato', unit: '%',  min: 0, max: 100, def: 25, group: '人声人化' },
  { key: 'reverb',  name: '卷积混响空间感',   unit: '%',  min: 0, max: 100, def: 18, group: '人声人化' },
];

export const PRESETS = {
  recommend: { throat: 120, sat: 28, rolloff: 9000, beat: 18, vibrato: 25, reverb: 18 },
  sleep:     { throat: 100, sat: 30, rolloff: 8000, beat: 25, vibrato: 30, reverb: 25 },
  podcast:   { throat: 120, sat: 25, rolloff: 11000, beat: 8, vibrato: 10, reverb: 8 },
  tape:      { throat: 90,  sat: 45, rolloff: 7000, beat: 22, vibrato: 15, reverb: 12 },
  space:     { throat: 110, sat: 22, rolloff: 10000, beat: 15, vibrato: 20, reverb: 40 },
  clear:     { throat: 100, sat: 18, rolloff: 13000, beat: 5, vibrato: 8, reverb: 5 },
};

function makeSaturationCurve(amount) {
  const n = 2048, curve = new Float32Array(n), k = amount * 60 + 0.001;
  for (let i = 0; i < n; i++) {
    let x = (i / (n - 1)) * 2 - 1;
    const asym = x >= 0 ? x * 1.15 : x * 0.92;
    curve[i] = Math.tanh(k * asym) / Math.tanh(k);
  }
  return curve;
}
function makeImpulse(ctx, seconds) {
  const rate = ctx.sampleRate, len = Math.max(1, rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
  }
  return buf;
}

export function buildGraph(ctx, source, p) {
  const throat = ctx.createBiquadFilter(); throat.type = 'peaking';
  throat.frequency.value = p.throat; throat.Q.value = 1.1; throat.gain.value = 4;

  const sat = ctx.createWaveShaper(); sat.curve = makeSaturationCurve(p.sat / 100); sat.oversample = '4x';

  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = p.rolloff; lp.Q.value = 0.7;

  const vibDelay = ctx.createDelay(0.05); vibDelay.delayTime.value = 0;
  const vibLFO = ctx.createOscillator(); vibLFO.frequency.value = 5.5;
  const vibDepth = ctx.createGain(); vibDepth.gain.value = (p.vibrato / 100) * 0.006;
  vibLFO.connect(vibDepth).connect(vibDelay.delayTime);

  const wowDelay = ctx.createDelay(0.1); wowDelay.delayTime.value = 0;
  const wowLFO = ctx.createOscillator(); wowLFO.frequency.value = 1.2;
  const wowDepth = ctx.createGain(); wowDepth.gain.value = (p.beat / 50) * 0.02;
  wowLFO.connect(wowDepth).connect(wowDelay.delayTime);

  const conv = ctx.createConvolver(); conv.buffer = makeImpulse(ctx, 1.5 + (p.reverb / 100) * 2.5);
  const wet = ctx.createGain(); wet.gain.value = (p.reverb / 100) * 0.8;
  const dry = ctx.createGain(); dry.gain.value = 1 - (p.reverb / 100) * 0.5;
  const master = ctx.createGain(); master.gain.value = 0.9;

  source.connect(throat); throat.connect(sat); sat.connect(lp);
  lp.connect(vibDelay); vibDelay.connect(wowDelay);
  wowDelay.connect(dry); dry.connect(master);
  wowDelay.connect(conv); conv.connect(wet); wet.connect(master);

  const lfos = [vibLFO, wowLFO]; lfos.forEach(l => l.start());
  return { output: master, stop() { lfos.forEach(l => { try { l.stop(); } catch (e) {} }); } };
}

export function audioBufferToWav(buffer) {
  const numCh = buffer.numberOfChannels, rate = buffer.sampleRate, frames = buffer.length;
  const blockAlign = numCh * 2, dataSize = frames * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize), view = new DataView(ab);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); ws(8, 'WAVE'); ws(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, numCh, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * blockAlign, true);
  view.setUint16(32, blockAlign, true); view.setUint16(34, 16, true);
  ws(36, 'data'); view.setUint32(40, dataSize, true);
  let off = 44; const chans = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
  for (let i = 0; i < frames; i++) for (let c = 0; c < numCh; c++) {
    let s = Math.max(-1, Math.min(1, chans[c][i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true); off += 2;
  }
  return new Blob([view], { type: 'audio/wav' });
}

/* 离线渲染生成歌曲成品 */
export async function renderSong(buffer, params) {
  const off = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const src = off.createBufferSource(); src.buffer = buffer;
  const g = buildGraph(off, src, params); g.output.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  return audioBufferToWav(rendered);
}
