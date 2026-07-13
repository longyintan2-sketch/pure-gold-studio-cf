/* ============================================================
 * starfield.js —— 全局星空特效层（所有页面共用）
 *   1) 持续渲染的闪烁星空背景
 *   2) 不间断横向流动的流星
 *   3) 鼠标点击任意位置触发「打铁花」四散光斑
 * 使用单一 fixed canvas + 单一 requestAnimationFrame 循环。
 * ============================================================ */
(function () {
  const canvas = document.createElement('canvas');
  canvas.id = 'starfield-canvas';
  Object.assign(canvas.style, {
    position: 'fixed', inset: '0', width: '100%', height: '100%',
    zIndex: '0', pointerEvents: 'none', display: 'block',
  });
  document.addEventListener('DOMContentLoaded', () => {
    document.body.insertBefore(canvas, document.body.firstChild);
  });

  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);

  let stars = [];
  let meteors = [];
  let sparks = [];      // 打铁花光斑
  let nebula = [];      // 远景星云光点

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    initStars();
  }

  function initStars() {
    const count = Math.round((W * H) / 4000);
    stars = new Array(count).fill(0).map(() => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.3 + 0.2,
      base: Math.random() * 0.5 + 0.3,
      tw: Math.random() * 0.02 + 0.005,
      ph: Math.random() * Math.PI * 2,
    }));
    nebula = new Array(6).fill(0).map(() => ({
      x: Math.random() * W, y: Math.random() * H,
      r: Math.random() * 260 + 160,
      hue: [220, 265, 200, 280][Math.floor(Math.random() * 4)],
      a: Math.random() * 0.05 + 0.03,
    }));
  }

  // ---------------- 流星 ----------------
  function spawnMeteor() {
    const fromLeft = Math.random() > 0.35;
    const y = Math.random() * H * 0.6;
    const speed = Math.random() * 4 + 5;
    const len = Math.random() * 160 + 120;
    meteors.push({
      x: fromLeft ? -120 : W + 120,
      y,
      vx: fromLeft ? speed : -speed,
      vy: speed * (Math.random() * 0.25 + 0.12),
      len, life: 1,
      dir: fromLeft ? 1 : -1,
    });
  }
  let meteorTimer = 0, nextMeteor = 60;

  // ---------------- 打铁花点击特效 ----------------
  function burst(x, y) {
    const n = 46 + Math.floor(Math.random() * 26);
    // 主体：金橙色铁花
    for (let i = 0; i < n; i++) {
      const ang = (Math.PI * 2 * i) / n + Math.random() * 0.4;
      const sp = Math.random() * 6.5 + 2.5;
      const hue = 30 + Math.random() * 25;   // 橙金
      sparks.push({
        x, y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: 1, decay: Math.random() * 0.015 + 0.012,
        r: Math.random() * 2.2 + 1,
        hue, sat: 90, lig: 62, trail: [],
      });
    }
    // 点缀：蓝白星火
    for (let i = 0; i < 14; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = Math.random() * 4 + 1;
      sparks.push({
        x, y,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        life: 1, decay: Math.random() * 0.02 + 0.02,
        r: Math.random() * 1.6 + 0.6,
        hue: 210, sat: 80, lig: 85, trail: [],
      });
    }
    // 中心闪光环
    sparks.push({ ring: true, x, y, life: 1, decay: 0.04, r: 4, hue: 45 });
  }

  function onPointer(e) {
    const x = e.clientX, y = e.clientY;
    if (x == null) return;
    burst(x, y);
  }
  window.addEventListener('pointerdown', onPointer, { passive: true });

  // ---------------- 主循环 ----------------
  function frame() {
    ctx.clearRect(0, 0, W, H);
    // 深空背景渐变
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#05060d');
    g.addColorStop(0.5, '#080a16');
    g.addColorStop(1, '#04050a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 星云
    ctx.globalCompositeOperation = 'lighter';
    for (const n of nebula) {
      const rg = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
      rg.addColorStop(0, `hsla(${n.hue},70%,60%,${n.a})`);
      rg.addColorStop(1, 'hsla(0,0%,0%,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';

    // 星星闪烁
    for (const s of stars) {
      s.ph += s.tw;
      const a = s.base + Math.sin(s.ph) * 0.35;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(210,225,255,${Math.max(0, a)})`;
      ctx.fill();
    }

    // 流星
    meteorTimer++;
    if (meteorTimer >= nextMeteor) {
      spawnMeteor(); meteorTimer = 0;
      nextMeteor = 45 + Math.floor(Math.random() * 90);
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      m.x += m.vx; m.y += m.vy;
      const tailX = m.x - m.vx * (m.len / 8);
      const tailY = m.y - m.vy * (m.len / 8);
      const mg = ctx.createLinearGradient(m.x, m.y, tailX, tailY);
      mg.addColorStop(0, 'rgba(255,255,255,0.95)');
      mg.addColorStop(0.3, 'rgba(150,190,255,0.6)');
      mg.addColorStop(1, 'rgba(120,160,255,0)');
      ctx.strokeStyle = mg;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y); ctx.lineTo(tailX, tailY); ctx.stroke();
      // 头部亮点
      ctx.beginPath();
      ctx.arc(m.x, m.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
      if (m.x < -200 || m.x > W + 200 || m.y > H + 120) meteors.splice(i, 1);
    }

    // 打铁花光斑
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      if (p.ring) {
        p.r += 3.2; p.life -= p.decay;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${p.hue},90%,70%,${Math.max(0, p.life) * 0.6})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        if (p.life <= 0) sparks.splice(i, 1);
        continue;
      }
      p.vx *= 0.96; p.vy *= 0.96; p.vy += 0.08; // 阻力+重力
      p.x += p.vx; p.y += p.vy;
      p.life -= p.decay;
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 6) p.trail.shift();
      // 拖尾
      for (let t = 0; t < p.trail.length; t++) {
        const tp = p.trail[t];
        const a = (t / p.trail.length) * p.life;
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, p.r * (t / p.trail.length), 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue},${p.sat}%,${p.lig}%,${a * 0.5})`;
        ctx.fill();
      }
      // 主体光斑
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue},${p.sat}%,${p.lig}%,${Math.max(0, p.life)})`;
      ctx.shadowBlur = 12;
      ctx.shadowColor = `hsla(${p.hue},${p.sat}%,${p.lig}%,${Math.max(0, p.life)})`;
      ctx.fill();
      ctx.shadowBlur = 0;
      if (p.life <= 0) sparks.splice(i, 1);
    }
    ctx.globalCompositeOperation = 'source-over';

    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  function boot() { resize(); requestAnimationFrame(frame); }
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(boot, 0);
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }

  // 暴露给程序化触发（可选）
  window.StarBurst = burst;
})();
