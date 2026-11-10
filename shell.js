// Comportements de l'en-tête commun aux pages secondaires (copiés de script.js : menu mobile + mini PC rebondissant).

// Animation Rebond Mini PC
document.addEventListener('DOMContentLoaded', () => {
  const nav = document.getElementById('nav-container');
  const pc = document.getElementById('mini-pc');
  const screen = document.getElementById('pc-screen');
  const neonLine = document.getElementById('neon-line');

  if (!nav || !pc || !neonLine) return;

  const colors = ['#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#f59e0b'];
  let colorIndex = 0;

  let x = 10;
  let y = 10;
  let dx = 1.2;
  let dy = 1.2;
  let fadeTimeout;

  function showNeonImpact(side, xPos, yPos, pcW, pcH) {
    const navW = nav.clientWidth;
    const navH = nav.clientHeight;
    const thickness = 4;

    if (side === 'top') {
      neonLine.style.left = `${xPos}px`;
      neonLine.style.top = '0px';
      neonLine.style.width = `${pcW}px`;
      neonLine.style.height = `${thickness}px`;
    } else if (side === 'bottom') {
      neonLine.style.left = `${xPos}px`;
      neonLine.style.top = `${navH - thickness}px`;
      neonLine.style.width = `${pcW}px`;
      neonLine.style.height = `${thickness}px`;
    } else if (side === 'left') {
      neonLine.style.left = '0px';
      neonLine.style.top = `${yPos}px`;
      neonLine.style.width = `${thickness}px`;
      neonLine.style.height = `${pcH}px`;
    } else if (side === 'right') {
      neonLine.style.left = `${navW - thickness}px`;
      neonLine.style.top = `${yPos}px`;
      neonLine.style.width = `${thickness}px`;
      neonLine.style.height = `${pcH}px`;
    }

    neonLine.classList.add('active');

    clearTimeout(fadeTimeout);
    fadeTimeout = setTimeout(() => {
      neonLine.classList.remove('active');
    }, 180);
  }

  function animate() {
    const navW = nav.clientWidth;
    const navH = nav.clientHeight;
    const pcW = pc.offsetWidth || 50;
    const pcH = pc.offsetHeight || 42;

    let bounced = false;
    const hitSides = [];

    if (x > navW - pcW) x = Math.max(0, navW - pcW);
    if (y > navH - pcH) y = Math.max(0, navH - pcH);

    if (x + dx >= navW - pcW) {
      x = navW - pcW;
      dx = -dx;
      bounced = true;
      hitSides.push('right');
    } else if (x + dx <= 0) {
      x = 0;
      dx = -dx;
      bounced = true;
      hitSides.push('left');
    }

    if (y + dy >= navH - pcH) {
      y = navH - pcH;
      dy = -dy;
      bounced = true;
      hitSides.push('bottom');
    } else if (y + dy <= 0) {
      y = 0;
      dy = -dy;
      bounced = true;
      hitSides.push('top');
    }

    if (bounced) {
      colorIndex = (colorIndex + 1) % colors.length;
      if (screen) screen.setAttribute('fill', colors[colorIndex]);
      hitSides.forEach(side => showNeonImpact(side, x, y, pcW, pcH));
    }

    x += dx;
    y += dy;

    pc.style.transform = `translate3d(${x}px, ${y}px, 0)`;

    requestAnimationFrame(animate);
  }

  animate();
});

function toggleMobileMenu() {
  const menu = document.getElementById('mobile-menu');
  const icon = document.getElementById('menu-icon');

  if (!menu || !icon) return;

  menu.classList.toggle('hidden');

  if (menu.classList.contains('hidden')) {
    icon.classList.remove('fa-xmark');
    icon.classList.add('fa-bars');
  } else {
    icon.classList.remove('fa-bars');
    icon.classList.add('fa-xmark');
  }
}
