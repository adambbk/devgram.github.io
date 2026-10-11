// Données des partenaires et exemples
const CLIENTS_DATA = [
  {
    id: 'boomerang',
    name: 'Le Boomerang',
    category: 'Restauration',
    city: 'Saint-Savournin',
    slogan: 'Restaurant & Cuisine conviviale au cœur du village.',
    description: '<p class="font-bold text-white text-sm mb-1">Cuisine conviviale & Produits frais.</p><p class="text-gray-300">Un espace chaleureux pour vos repas entre amis ou en famille, proposant des menus de saison élaborés localement.</p>',
    icon: 'fa-utensils',
    siteUrl: '#',
    stats: { visitors: [240, 310, 450, 520, 680, 890], contacts: [18, 25, 42, 50, 68, 95], conversion: '10.6%', score: '96/100' }
  },
  {
    id: 'bois-metal',
    name: 'Atelier Bois & Métal',
    category: 'Artisans',
    city: 'Aix-en-Provence',
    slogan: 'Création de mobilier sur-mesure et ferronnerie d’art.',
    description: '<p class="font-bold text-white text-sm mb-1">Artisanat & Design Industriel.</p><p class="text-gray-300">Conception de verrières, tables et garde-corps personnalisés sur toute la région PACA.</p>',
    icon: 'fa-hammer',
    siteUrl: '#',
    stats: { visitors: [150, 210, 280, 390, 420, 510], contacts: [8, 12, 19, 24, 30, 38], conversion: '7.4%', score: '91/100' }
  },
  {
    id: 'eleganza',
    name: 'Boutique Éléganza',
    category: 'Commerces',
    city: 'Marseille',
    slogan: 'Prêt-à-porter féminin & Accessoires de créateurs.',
    description: '<p class="font-bold text-white text-sm mb-1">Collection Mode & Tendances.</p><p class="text-gray-300">Sélection exclusive de vêtements et accessoires italiens et français en plein centre-ville.</p>',
    icon: 'fa-bag-shopping',
    siteUrl: '#',
    stats: { visitors: [500, 620, 780, 910, 1100, 1420], contacts: [35, 48, 60, 75, 90, 125], conversion: '8.8%', score: '94/100' }
  },
  {
    id: 'dracode',
    name: 'Dracode Digital',
    category: 'Services',
    city: 'Saint-Savournin',
    slogan: 'Solutions web & Automatismes de contenu.',
    description: '<p class="font-bold text-white text-sm mb-1">Créez votre site en quelques clics.</p><p class="text-gray-300">Pas besoin de connaissances techniques : choisissez votre modèle, ajoutez vos informations et recevez votre site prêt à être mis en ligne.</p>',
    icon: 'fa-code',
    siteUrl: '#',
    stats: { visitors: [320, 410, 500, 620, 800, 1050], contacts: [20, 31, 40, 52, 71, 88], conversion: '8.3%', score: '98/100' }
  },
  {
    id: 'auto-diag',
    name: 'Auto Diag 13',
    category: 'Services',
    city: 'Gardanne',
    slogan: 'Entretien automobile & Diagnostic électronique.',
    description: '<p class="font-bold text-white text-sm mb-1">Garage & Mécanique de précision.</p><p class="text-gray-300">Réparation multimarques, révision et diagnostic rapide avec équipements haute précision.</p>',
    icon: 'fa-wrench',
    siteUrl: '#',
    stats: { visitors: [210, 300, 390, 480, 560, 690], contacts: [15, 22, 31, 39, 45, 58], conversion: '8.4%', score: '89/100' }
  },
  {
    id: 'coiffure-studio',
    name: 'Studio Coiffure & Beauté',
    category: 'Commerces',
    city: 'Auriol',
    slogan: 'Salon de coiffure mixte & Soins capillaires bio.',
    description: '<p class="font-bold text-white text-sm mb-1">Coiffure & Visagisme.</p><p class="text-gray-300">Prestations de coiffure sur-mesure dans une ambiance cocooning et avec des produits écoresponsables.</p>',
    icon: 'fa-scissors',
    siteUrl: '#',
    stats: { visitors: [180, 240, 310, 410, 490, 620], contacts: [12, 18, 26, 34, 41, 52], conversion: '8.3%', score: '92/100' }
  }
];

let currentCategory = 'all';
let currentStep = 1;
let chartInstance = null;
let selectedModelForCustom = null;

// Initialisation au chargement du DOM
document.addEventListener('DOMContentLoaded', () => {
  renderCatalogue();
  initDashboardSelect();
  initChart();
  updateDashboardData(CLIENTS_DATA[0].id);
  updateCategoryCounts();
});

// Changement de vue (SPA)
function switchView(viewId) {
  const views = ['landing', 'catalogue', 'dashboard', 'onboarding'];
  
  views.forEach(id => {
    const sec = document.getElementById(`view-${id}`);
    const btn = document.getElementById(`nav-${id}`);

    if (!sec) return;

    if (id === viewId) {
      sec.classList.remove('hidden');
      if (btn) {
        btn.classList.add('text-[#00f0ff]', 'bg-[#00f0ff]/10', 'border-[#00f0ff]', 'backdrop-blur-md', 'shadow-[0_0_15px_rgba(0,240,255,0.3)]');
        btn.classList.remove('text-white/80', 'bg-transparent', 'border-white/10');
      }
    } else {
      sec.classList.add('hidden');
      if (btn) {
        btn.classList.remove('text-[#00f0ff]', 'bg-[#00f0ff]/10', 'border-[#00f0ff]', 'backdrop-blur-md', 'shadow-[0_0_15px_rgba(0,240,255,0.3)]');
        btn.classList.add('text-white/80', 'bg-transparent', 'border-white/10');
      }
    }
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Affichage du catalogue
function renderCatalogue() {
  const grid = document.getElementById('catalogue-grid');
  if (!grid) return;
  
  const searchVal = (document.getElementById('catalogue-search')?.value || '').toLowerCase().trim();

  const filtered = CLIENTS_DATA.filter(item => {
    const matchCat = (currentCategory === 'all' || item.category === currentCategory);
    const matchSearch = item.name.toLowerCase().includes(searchVal) || 
                        item.city.toLowerCase().includes(searchVal) || 
                        item.slogan.toLowerCase().includes(searchVal);
    return matchCat && matchSearch;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full text-center py-12 space-y-3">
        <i class="fa-solid fa-folder-open text-4xl text-cyborg-text"></i>
        <p class="text-sm text-cyborg-text">Aucun partenaire trouvé pour ces critères de recherche.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(item => `
    <div class="bg-cyborg-card rounded-[23px] p-6 border border-cyborg-border hover:border-cyborg-orange transition-all duration-300 flex flex-col justify-between space-y-4 group card-hover-effect">
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-cyborg-orange/20 text-cyborg-orange border border-cyborg-orange/30">${item.category}</span>
          <span class="text-xs text-cyborg-text"><i class="fa-solid fa-location-dot text-cyborg-orange mr-1"></i>${item.city}</span>
        </div>
        <div class="flex items-center gap-3 pt-2">
          <div class="w-12 h-12 rounded-2xl bg-cyborg-bg border border-cyborg-border flex items-center justify-center text-cyborg-orange text-xl group-hover:scale-110 transition-transform flex-shrink-0">
            <i class="fa-solid ${item.icon}"></i>
          </div>
          <div>
            <h3 class="font-extrabold text-base uppercase text-white group-hover:text-cyborg-orange transition-colors line-clamp-1">${item.name}</h3>
            <p class="text-xs text-cyborg-text line-clamp-2">${item.slogan}</p>
          </div>
        </div>
      </div>
      <button onclick="openModal('${item.id}')" class="w-full py-2.5 rounded-full text-xs font-bold uppercase bg-cyborg-bg hover:bg-cyborg-orange hover:text-white text-cyborg-text border border-cyborg-border transition-all flex items-center justify-center gap-2">
        <i class="fa-solid fa-eye"></i>
        <span>VOIR LA MAQUETTE</span>
      </button>
    </div>
  `).join('');
}

// Filtres
function setCategoryFilter(cat) {
  currentCategory = cat;
  document.querySelectorAll('.cat-btn').forEach(btn => {
    if (btn.dataset.cat === cat) {
      btn.className = 'cat-btn px-5 py-2 rounded-full text-xs font-bold uppercase bg-cyborg-orange text-white glow-orange transition-all whitespace-nowrap';
    } else {
      btn.className = 'cat-btn px-5 py-2 rounded-full text-xs font-bold uppercase bg-cyborg-card text-cyborg-text border border-cyborg-border hover:text-white transition-all whitespace-nowrap';
    }
  });
  renderCatalogue();
}

function filterCatalogue() {
  renderCatalogue();
}

function updateCategoryCounts() {
  const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
  setTxt('cnt-all', CLIENTS_DATA.length);
  setTxt('cnt-restauration', CLIENTS_DATA.filter(c => c.category === 'Restauration').length);
  setTxt('cnt-artisans', CLIENTS_DATA.filter(c => c.category === 'Artisans').length);
  setTxt('cnt-commerces', CLIENTS_DATA.filter(c => c.category === 'Commerces').length);
  setTxt('cnt-services', CLIENTS_DATA.filter(c => c.category === 'Services').length);
}

// Modal
function openModal(clientId) {
  const client = CLIENTS_DATA.find(c => c.id === clientId);
  if (!client) return;

  selectedModelForCustom = client;

  const modalIcon = document.getElementById('modal-icon');
  const modalCategory = document.getElementById('modal-category');
  const modalTitle = document.getElementById('modal-title');
  const modalLocation = document.getElementById('modal-location');
  const modalDescription = document.getElementById('modal-description');

  if (modalIcon) modalIcon.innerHTML = `<i class="fa-solid ${client.icon}"></i>`;
  if (modalCategory) modalCategory.innerText = client.category;
  if (modalTitle) modalTitle.innerText = client.name;
  if (modalLocation) modalLocation.innerHTML = `<i class="fa-solid fa-location-dot text-cyborg-orange mr-1"></i>${client.city}`;
  if (modalDescription) modalDescription.innerHTML = client.description;

  document.getElementById('modal-client')?.classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-client')?.classList.add('hidden');
}

function customizeCurrentModel() {
  if (selectedModelForCustom) {
    const companyEl = document.getElementById('ob-company');
    if (companyEl) companyEl.value = selectedModelForCustom.name;
    
    showToast('Modèle chargé !', `Établissement "${selectedModelForCustom.name}" pré-rempli pour la personnalisation.`);
  }
  
  closeModal();
  switchView('onboarding');
}

// Dashboard
function initDashboardSelect() {
  const select = document.getElementById('dashboard-client-select');
  if (!select) return;
  select.innerHTML = CLIENTS_DATA.map(c => `<option value="${c.id}">${c.name} (${c.city})</option>`).join('');
}

function changeDashboardClient() {
  const select = document.getElementById('dashboard-client-select');
  if (select) updateDashboardData(select.value);
}

function updateDashboardData(clientId) {
  const client = CLIENTS_DATA.find(c => c.id === clientId) || CLIENTS_DATA[0];

  const totalVisitors = client.stats.visitors.reduce((a, b) => a + b, 0);
  const totalContacts = client.stats.contacts.reduce((a, b) => a + b, 0);

  const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
  setTxt('kpi-visitors', totalVisitors.toLocaleString('fr-FR'));
  setTxt('kpi-contacts', totalContacts);
  setTxt('kpi-conversion', client.stats.conversion);
  setTxt('kpi-score', client.stats.score);

  if (chartInstance) {
    chartInstance.data.datasets[0].data = client.stats.visitors;
    chartInstance.data.datasets[1].data = client.stats.contacts;
    chartInstance.update();
  }
}

function initChart() {
  const canvas = document.getElementById('performanceChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre'],
      datasets: [
        {
          label: 'Visiteurs Uniques',
          data: [0, 0, 0, 0, 0, 0],
          borderColor: '#e75e8d',
          backgroundColor: 'rgba(231, 94, 141, 0.15)',
          fill: true,
          tension: 0.4,
          borderWidth: 3,
          pointBackgroundColor: '#e75e8d'
        },
        {
          label: 'Demandes de Contact',
          data: [0, 0, 0, 0, 0, 0],
          borderColor: '#00f0ff',
          backgroundColor: 'rgba(0, 240, 255, 0.1)',
          fill: true,
          tension: 0.4,
          borderWidth: 3,
          pointBackgroundColor: '#00f0ff'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#afb0b2', font: { family: 'Poppins', size: 11 } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#afb0b2', font: { family: 'Poppins', size: 11 } }
        }
      }
    }
  });
}

// Onboarding & Stepper
function validateCurrentStep() {
  if (currentStep === 1) {
    const companyInput = document.getElementById('ob-company');
    if (companyInput && !companyInput.value.trim()) {
      companyInput.reportValidity();
      return false;
    }
  }
  return true;
}

function changeStep(delta) {
  if (delta === 1 && !validateCurrentStep()) return;

  currentStep += delta;
  if (currentStep < 1) currentStep = 1;
  if (currentStep > 5) currentStep = 5;

  const tabColors = [
    'border-cyborg-pink text-cyborg-pink',
    'border-cyborg-cyan text-cyborg-cyan',
    'border-emerald-400 text-emerald-400',
    'border-yellow-400 text-yellow-400',
    'border-purple-400 text-purple-400'
  ];

  for (let i = 1; i <= 5; i++) {
    const content = document.getElementById(`step-content-${i}`);
    const tab = document.getElementById(`step-tab-${i}`);

    if (i === currentStep) {
      if (content) content.classList.remove('hidden');
      if (tab) tab.className = `step-tab text-center space-y-1 pb-2 border-b-2 font-bold transition-colors ${tabColors[i-1]}`;
    } else {
      if (content) content.classList.add('hidden');
      if (tab) tab.className = 'step-tab text-center space-y-1 pb-2 border-b-2 border-cyborg-border text-cyborg-text font-bold transition-colors';
    }
  }
}

function showToast(title, message) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  const tTitle = document.getElementById('toast-title');
  const tMsg = document.getElementById('toast-msg');

  if (tTitle) tTitle.innerText = title;
  if (tMsg) tMsg.innerText = message;

  toast.classList.remove('translate-y-32', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');

  setTimeout(() => {
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('translate-y-32', 'opacity-0');
  }, 3500);
}

// Animation Décodage Texte
const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function cyberDecodeText(element) {
  if (!element || element.dataset.animated === "true") return;

  if (!element.dataset.value) {
    element.dataset.value = element.innerText.trim();
  }

  const originalText = element.dataset.value;
  element.dataset.animated = "true";
  let iteration = 0;

  const interval = setInterval(() => {
    element.innerText = originalText
      .split("")
      .map((letter, index) => {
        if (index < iteration) return originalText[index];
        if (letter === " ") return " ";
        return letters[Math.floor(Math.random() * letters.length)];
      })
      .join("");

    if (iteration >= originalText.length) {
      clearInterval(interval);
      element.innerText = originalText;
    }

    iteration += 1;
  }, 40);
}

function runHeroAnimation() {
  const title = document.getElementById("hero-title");
  if (title) cyberDecodeText(title);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", runHeroAnimation);
} else {
  runHeroAnimation();
}

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

// Canvas d'arrière-plan Cyber
(function initCyberBackground() {
  const canvas = document.getElementById('cyber-bg');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let width, height;
  let particles = [];
  const mouse = { x: null, y: null, radius: 180 };

  class Particle {
    constructor() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.vx = (Math.random() - 0.5) * 0.6;
      this.vy = (Math.random() - 0.5) * 0.6;
      this.radius = Math.random() * 2 + 1;
    }

    update() {
      if (this.x < 0 || this.x > width) this.vx *= -1;
      if (this.y < 0 || this.y > height) this.vy *= -1;
      this.x += this.vx;
      this.y += this.vy;
    }

    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#00f0ff';
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#00f0ff';
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  function resizeCanvas() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;

    particles = [];
    const particleCount = Math.max(80, Math.floor((width * height) / 12000));
    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle());
    }
  }

  window.addEventListener('resize', resizeCanvas);

  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  window.addEventListener('mouseleave', () => {
    mouse.x = null;
    mouse.y = null;
  });

  function animate() {
    ctx.clearRect(0, 0, width, height);

    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, '#05060a');
    bgGradient.addColorStop(1, '#090c15');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    for (let a = 0; a < particles.length; a++) {
      particles[a].update();
      particles[a].draw();

      for (let b = a + 1; b < particles.length; b++) {
        const dx = particles[a].x - particles[b].x;
        const dy = particles[a].y - particles[b].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 130) {
          ctx.beginPath();
          ctx.moveTo(particles[a].x, particles[a].y);
          ctx.lineTo(particles[b].x, particles[b].y);
          ctx.strokeStyle = `rgba(0, 240, 255, ${0.35 - dist / 370})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }

      if (mouse.x !== null && mouse.y !== null) {
        const mdx = particles[a].x - mouse.x;
        const mdy = particles[a].y - mouse.y;
        const mdist = Math.sqrt(mdx * mdx + mdy * mdy);

        if (mdist < mouse.radius) {
          ctx.beginPath();
          ctx.moveTo(particles[a].x, particles[a].y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.strokeStyle = `rgba(0, 240, 255, ${0.7 - mdist / mouse.radius})`;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(animate);
  }

  resizeCanvas();
  animate();
})();