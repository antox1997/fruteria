import './style.css';
import { supabase } from './supabase.js';

// Import Views
import { renderDashboard } from './modules/dashboard.js';
import { renderVentas } from './modules/ventas.js';
import { renderInventario } from './modules/inventario.js';
import { renderClientes } from './modules/clientes.js';
import { renderCompras } from './modules/compras.js';
import { renderReportes } from './modules/reportes_view.js';

// --- STATE ---
export let user = null;
const app = document.getElementById('app');
const nav = document.querySelector('nav');
import { showLoading, toast, closeModal } from './ui/helpers.js';
window.closeModal = closeModal;

// --- NAVIGATION ---
export const navigate = async (module, action = 'list', params = {}) => {
  // Update Bottom Nav Active State
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === module);
  });

  if (nav) nav.style.display = user ? 'flex' : 'none';

  // Render View
  app.innerHTML = '';
  app.className = 'animate-fade-in';

  if (!user) {
    renderLogin();
    return;
  }

  // Breadcrumbs
  const header = document.createElement('div');
  header.innerHTML = renderBreadcrumbs(module, action, params.name);
  app.appendChild(header);

  const container = document.createElement('div');
  app.appendChild(container);

  // Routing Logic
  const views = {
    dashboard: renderDashboard,
    ventas: renderVentas,
    productos: renderInventario,
    clientes: renderClientes,
    compras: renderCompras,
    reportes: renderReportes
  };

  if (views[module]) {
    await views[module](container, action, params);
  }
};
window.navigate = navigate;

const renderBreadcrumbs = (module, action, itemName = '') => {
  const labels = { ventas: '🛒 Ventas', productos: '📦 Inventario', clientes: '👥 Clientes', compras: '🚚 Compras', reportes: '📊 Reportes' };
  const parts = [{ label: '🏠 Dashboard', module: 'dashboard', action: 'list' }];
  
  if (module !== 'dashboard') parts.push({ label: labels[module] || module, module, action: 'list' });
  if (action === 'create') parts.push({ label: '➕ Nuevo', module, action: 'create' });
  if (action === 'edit') parts.push({ label: `✏️ Editar ${itemName}`, module, action: 'edit' });

  return `<div class="breadcrumb">${parts.map((p, i) => {
    const isLast = i === parts.length - 1;
    return `<span class="${isLast ? 'current' : ''}" onclick="${!isLast ? `navigate('${p.module}', '${p.action}')` : ''}">${p.label}</span>${!isLast ? '<span class="separator">/</span>' : ''}`;
  }).join('')}</div>`;
};

// --- AUTH ---
const renderLogin = () => {
  if (nav) nav.style.display = 'none';
  app.innerHTML = `
    <div class="login-page animate-fade-in">
      <div class="login-card">
        <div class="login-header">
           <span class="login-logo">🍎</span>
           <h1>Frutería SaaS</h1>
           <p>Tu negocio bajo control y en la nube.</p>
        </div>
        
        <form id="authForm" novalidate>
          <div class="input-icon-group">
            <label>Correo Electrónico</label>
            <input type="email" id="authEmail" placeholder="ejemplo@correo.com" required autocomplete="email">
          </div>
          
          <div class="input-icon-group">
            <label>Contraseña</label>
            <input type="password" id="authPassword" placeholder="••••••••" required autocomplete="current-password">
          </div>
          
          <button type="submit" id="mainAuthBtn" class="btn btn-login">
            ENTRAR AL SISTEMA
          </button>
        </form>
        
        <div id="authError" class="error-box-login" style="display:none;"></div>
      </div>
    </div>`;

  document.getElementById('authForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('mainAuthBtn');
    const errBox = document.getElementById('authError');
    
    // UI Loading State
    btn.disabled = true;
    btn.innerHTML = '<div class="loading-spinner"></div>';
    errBox.style.display = 'none';

    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // Navigate is handled by onAuthStateChange in main script
    } catch (err) {
      errBox.innerHTML = `⚠️ <span>${err.message}</span>`;
      errBox.style.display = 'flex';
      btn.disabled = false;
      btn.innerText = 'ENTRAR AL SISTEMA';
      
      // Visual feedback on failure
      document.querySelector('.login-card').animate([
        { transform: 'translateX(-5px)' },
        { transform: 'translateX(5px)' },
        { transform: 'translateX(-5px)' },
        { transform: 'translateX(0)' }
      ], { duration: 300 });
    }
  };
};

// --- BOOTSTRAP ---
const init = () => {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => { item.onclick = () => navigate(item.dataset.view); });

  supabase.auth.onAuthStateChange((event, session) => {
    user = session?.user || null;
    navigate(user ? 'dashboard' : 'login');
  });
};

init();
