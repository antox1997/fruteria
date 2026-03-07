import './style.css';
import { fetchData, addData, updateData, deleteData } from './db.js';
import { supabase } from './supabase.js';

// --- APPLICATION STATE ---
let user = null;
let currentModule = 'dashboard';
let currentAction = 'list'; // list, create, edit
let currentSale = []; // { product, quantity }
let isProcessing = false;

const app = document.getElementById('app');
const nav = document.querySelector('nav');
const modalOverlay = document.getElementById('modal-overlay');

// --- UTILITIES ---

const toast = (message, type = 'success') => {
  const t = document.createElement('div');
  t.className = `toast ${type} animate-fade-in`;
  t.innerText = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
};

const showLoading = (container) => {
  container.innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:300px; gap:1rem;">
      <div class="loading-spinner" style="border-top-color: var(--primary);"></div>
      <span style="color:var(--text-muted); font-size:0.9rem;">Sincronizando con la nube...</span>
    </div>
  `;
};

const setProcessing = (processing) => {
  isProcessing = processing;
  // This could disable all buttons globally if needed
};

// --- NAVIGATION ENGINE ---

const initNav = () => {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.onclick = (e) => {
      e.preventDefault();
      navigate(item.dataset.view);
    };
  });
};

const navigate = async (module, action = 'list', params = {}) => {
  currentModule = module;
  currentAction = action;

  // Update Bottom Nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === module);
  });

  if (nav) nav.style.display = user ? 'flex' : 'none';

  await renderView(module, action, params);
};

const renderBreadcrumbs = (module, action, itemName = '') => {
  const parts = [{ label: '🏠 Dashboard', module: 'dashboard', action: 'list' }];

  if (module !== 'dashboard') {
    const labels = {
      ventas: '🛒 Ventas',
      productos: '📦 Inventario',
      clientes: '👥 Clientes',
      compras: '🚚 Compras',
      reportes: '📊 Reportes'
    };
    parts.push({ label: labels[module], module, action: 'list' });
  }

  if (action === 'create') parts.push({ label: '➕ Nuevo', module, action: 'create' });
  if (action === 'edit') parts.push({ label: `✏️ Editar ${itemName}`, module, action: 'edit' });

  return `
    <div class="breadcrumb">
      ${parts.map((p, i) => {
    const isLast = i === parts.length - 1;
    return `
          <span class="${isLast ? 'current' : ''}" onclick="${!isLast ? `navigate('${p.module}', '${p.action}')` : ''}">${p.label}</span>
          ${!isLast ? '<span class="separator">/</span>' : ''}
        `;
  }).join('')}
    </div>
  `;
};

// --- VIEWS ---

const renderView = async (module, action, params) => {
  app.innerHTML = '';
  app.className = 'animate-fade-in';

  if (!user) {
    renderLogin();
    return;
  }

  const header = document.createElement('div');
  header.innerHTML = renderBreadcrumbs(module, action, params.name);
  app.appendChild(header);

  const container = document.createElement('div');
  app.appendChild(container);

  if (module === 'dashboard') await renderDashboard(container);
  else if (module === 'ventas') await renderVentas(container, action);
  else if (module === 'productos') await renderInventario(container, action, params);
  else if (module === 'clientes') await renderClientes(container, action, params);
  else if (module === 'compras') await renderCompras(container, action, params);
  else if (module === 'reportes') await renderReportes(container);
};

// --- LOGIN & AUTH ---
const renderLogin = (mode = 'login') => {
  const nav = document.querySelector('nav');
  if (nav) nav.style.display = 'none';

  if (mode === 'success_register') {
    app.innerHTML = `
      <div style="max-width: 450px; margin: 80px auto; padding: 3rem; text-align: center; background: white; border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);">
        <div style="font-size: 5rem; margin-bottom: 1.5rem;">📧</div>
        <h1 style="color: var(--primary); margin-bottom: 1rem;">¡Casi listo!</h1>
        <p style="font-size: 1.1rem; color: var(--text-main); margin-bottom: 1.5rem; line-height: 1.6;">
          Hemos enviado un <strong>enlace de confirmación</strong> a tu correo electrónico.
        </p>
        <div style="background: var(--primary-light); padding: 1.5rem; border-radius: var(--radius-md); text-align: left; margin-bottom: 2rem; border-left: 4px solid var(--primary);">
          <p style="font-size: 0.9rem; color: var(--primary-dark); font-weight: 600;">
            ⚠️ IMPORTANTE: Debes hacer clic en el botón dentro del correo para activar tu cuenta y poder entrar a tu tienda.
          </p>
        </div>
        <button class="btn btn-secondary btn-block" onclick="navigate('login')">VOLVER AL INICIO DE SESIÓN</button>
        <p style="margin-top: 1.5rem; font-size: 0.85rem; color: var(--text-muted);">
          ¿No recibiste nada? Revisa tu carpeta de <strong>SPAM</strong>.
        </p>
      </div>
    `;
    return;
  }

  app.innerHTML = `
    <div style="max-width: 420px; margin: 60px auto; padding: 2.5rem; text-align: center; background: white; border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);">
      <div style="font-size: 4rem; margin-bottom: 1rem;">🍎</div>
      <h1 style="margin-bottom: 0.5rem; font-size: 2.2rem;">Frutería SaaS</h1>
      <p style="color: var(--text-muted); margin-bottom: 2.5rem; font-size: 1.1rem;">Tu negocio, bajo control y en la nube.</p>
      
      <form id="authForm" style="text-align: left;">
        <div class="form-group">
          <label style="color: var(--text-main); font-weight: 700;">Correo electrónico</label>
          <input type="email" id="authEmail" placeholder="ejemplo@correo.com" required style="padding: 1rem; border-width: 2px;">
        </div>
        <div class="form-group">
          <label style="color: var(--text-main); font-weight: 700;">Contraseña</label>
          <input type="password" id="authPassword" placeholder="••••••••" required style="padding: 1rem; border-width: 2px;">
        </div>
        
        <button type="submit" id="mainAuthBtn" class="btn btn-primary btn-block" style="padding: 1.2rem; font-size: 1.1rem; letter-spacing: 0.5px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);">
          ${mode === 'login' ? 'ENTRAR A MI TIENDA' : 'CREAR MI CUENTA GRATIS'}
        </button>
        
        <div style="margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--border);">
          <p id="toggleAuth" style="color: var(--info); font-size: 0.95rem; font-weight: 700; cursor: pointer; display: inline-block;">
            ${mode === 'login' ? '¿Eres nuevo? Regístrate aquí' : '¿Ya tienes cuenta? Inicia sesión'}
          </p>
        </div>
      </form>
      <p id="authError" style="color: var(--danger); font-size: 0.9rem; margin-top: 1.5rem; padding: 1rem; background: #fef2f2; border-radius: var(--radius-sm); border-left: 4px solid var(--danger); display: none; text-align: left;"></p>
    </div>
  `;

  document.getElementById('toggleAuth').onclick = () => renderLogin(mode === 'login' ? 'register' : 'login');

  document.getElementById('authForm').onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    const btn = document.getElementById('mainAuthBtn');
    const errBox = document.getElementById('authError');

    errBox.style.display = 'none';
    btn.disabled = true;
    btn.innerHTML = '<div class="loading-spinner" style="margin: 0 auto;"></div>';

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        renderLogin('success_register');
      }
    } catch (err) {
      errBox.innerText = "❌ " + err.message;
      errBox.style.display = 'block';
      btn.disabled = false;
      btn.innerText = mode === 'login' ? 'ENTRAR A MI TIENDA' : 'CREAR MI CUENTA GRATIS';
    }
  };
};

// --- MODULES ---

const renderDashboard = async (container) => {
  showLoading(container);
  const [productos, ventas, clientes] = await Promise.all([
    fetchData('productos'),
    fetchData('ventas'),
    fetchData('clientes')
  ]);

  const todayStr = new Date().toISOString().split('T')[0];
  const totalSalesToday = ventas.filter(v => v.fecha?.startsWith(todayStr)).reduce((a, b) => a + Number(b.total), 0);
  const totalDebts = clientes.reduce((a, b) => a + (Number(b.saldo_deuda) || 0), 0);
  const lowStock = productos.filter(p => Number(p.stock) <= Number(p.stock_minimo || 5));

  container.innerHTML = `
    <div class="card" style="background: var(--primary); color: white; border: none; padding: 2rem;">
      <h2 style="margin: 0;">¡Hola de nuevo! 👋</h2>
      <p style="opacity: 0.9; margin-top: 5px;">${user.email} (${user.rol || 'Staff'})</p>
    </div>

    <div class="stats-grid">
      <div class="card" onclick="navigate('reportes')">
        <span class="card-title">Ventas Hoy</span>
        <span class="card-value primary">$${totalSalesToday.toFixed(2)}</span>
      </div>
      <div class="card" onclick="navigate('clientes')">
        <span class="card-title">Por Cobrar</span>
        <span class="card-value danger">$${totalDebts.toFixed(2)}</span>
      </div>
    </div>

    <div style="margin-bottom: 2rem; display:grid; gap:10px;">
      <button class="btn btn-primary" style="padding: 1.5rem; font-size: 1.2rem; border-radius: var(--radius-lg);" onclick="navigate('ventas')">
        🚀 NUEVA VENTA RÁPIDA
      </button>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
         <button class="btn btn-secondary" onclick="navigate('productos')">📦 Stock</button>
         <button class="btn btn-secondary" onclick="navigate('compras')">🚚 Compras</button>
      </div>
    </div>

    ${lowStock.length > 0 ? `
      <div class="card" style="border-left: 4px solid var(--danger);">
        <h3 style="color: var(--danger); margin-bottom: 10px;">⚠️ Alertas de Inventario</h3>
        ${lowStock.map(p => `<div style="display:flex; justify-content:space-between; font-size:0.9rem; margin-bottom:5px;">
          <span>${p.nombre}</span>
          <span class="stock-badge stock-critical">${p.stock} ${p.unidad}</span>
        </div>`).join('')}
      </div>
    ` : ''}

    <button class="btn btn-ghost btn-block" id="btnLogout" style="margin-top: 2rem;">🔒 Cerrar Sesión</button>
  `;

  document.getElementById('btnLogout').onclick = () => supabase.auth.signOut();
};

const renderVentas = async (container, action) => {
  showLoading(container);
  const [productos, clientes] = await Promise.all([fetchData('productos'), fetchData('clientes')]);
  currentSale = [];

  container.innerHTML = `
    <div class="form-group" style="position: sticky; top: 0; background: var(--bg-app); z-index: 10; padding: 10px 0;">
      <input type="text" id="vSearch" placeholder="🔍 Buscar producto por nombre..." style="box-shadow: var(--shadow-md);">
    </div>

    <div class="quick-sale-grid" id="productGrid">
      ${productos.filter(p => Number(p.stock) > 0).map(p => `
        <div class="product-item" data-id="${p.id}" data-name="${p.nombre.toLowerCase()}" onclick="window.vAdd(${p.id})">
          <div class="product-count" id="badge-${p.id}">0</div>
          <div style="font-size: 1.2rem; margin-bottom: 4px;">${p.unidad === 'kg' ? '⚖️' : '🍎'}</div>
          <div style="font-weight: 700; font-size: 0.9rem; margin-bottom: 4px;">${p.nombre}</div>
          <div style="color: var(--primary); font-weight: 800;">$${Number(p.precio_venta).toFixed(2)}</div>
          <div style="font-size: 0.7rem; color: var(--text-muted); opacity: 0.8;">DISP: ${p.stock}</div>
        </div>
      `).join('')}
    </div>

    <div id="vCart" style="display:none; position:fixed; bottom: 85px; left: 1rem; right: 1rem; background: var(--bg-card); padding: 1rem; border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); border: 2px solid var(--primary); z-index: 500;" class="animate-fade-in">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div id="vItems" style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">0 kg / unid</div>
            <div style="font-size: 1.6rem; font-weight: 900; color: var(--primary);">$<span id="vTotal">0.00</span></div>
          </div>
          <button class="btn btn-primary" style="padding: 1rem 2rem;" onclick="window.vCheckout()">CONTINUAR ➔</button>
        </div>
    </div>
  `;

  document.getElementById('vSearch').oninput = (e) => {
    const term = e.target.value.toLowerCase();
    document.querySelectorAll('.product-item').forEach(el => {
      el.style.display = el.dataset.name.includes(term) ? 'block' : 'none';
    });
  };

  // Logic globally attached for onclick
  window.vAdd = (pid) => {
    const p = productos.find(x => x.id === pid);
    const qty = prompt(`¿Cuánto vas a vender de ${p.nombre}? (${p.unidad})`, p.unidad === 'kg' ? '1.0' : '1');
    const nQty = parseFloat(qty);
    if (!nQty || nQty <= 0) return;
    if (nQty > Number(p.stock)) return toast("No hay suficiente stock", "error");

    const existing = currentSale.find(x => x.id === pid);
    if (existing) existing.quantity = nQty;
    else currentSale.push({ ...p, quantity: nQty });

    // Update UI
    const badge = document.getElementById(`badge-${pid}`);
    badge.innerText = p.unidad === 'kg' ? nQty.toFixed(1) : nQty;
    badge.classList.add('visible');

    const cart = document.getElementById('vCart');
    cart.style.display = 'block';

    const total = currentSale.reduce((a, b) => a + (Number(b.precio_venta) * b.quantity), 0);
    document.getElementById('vTotal').innerText = total.toFixed(2);
    document.getElementById('vItems').innerText = `${currentSale.length} productos / ${currentSale.reduce((a, b) => a + b.quantity, 0).toFixed(1)} ${p.unidad}`;
  };

  window.vCheckout = () => {
    modalOverlay.classList.add('active');
    const total = currentSale.reduce((a, b) => a + (Number(b.precio_venta) * b.quantity), 0);

    const content = document.getElementById('modal-content');
    content.innerHTML = `
      <h2>Confirmar Cobro</h2>
      <div style="margin-bottom: 2rem; max-height: 200px; overflow-y: auto;">
        ${currentSale.map(i => `<div style="display:flex; justify-content:space-between; padding: 8px 0; border-bottom: 1px solid var(--border);">
          <span>${i.quantity} ${i.unidad} ${i.nombre}</span>
          <span style="font-weight:700;">$${(Number(i.precio_venta) * i.quantity).toFixed(2)}</span>
        </div>`).join('')}
        <div style="display:flex; justify-content:space-between; padding: 1rem 0; font-size: 1.4rem; font-weight: 900; color: var(--primary);">
          <span>TOTAL</span>
          <span>$${total.toFixed(2)}</span>
        </div>
      </div>

      <div class="form-group">
        <label>Método de Pago</label>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <button class="btn btn-secondary" id="btnCash" style="border: 2px solid var(--primary);">💵 EFECTIVO</button>
          <button class="btn btn-secondary" id="btnCredit">🛡️ FIADO / DEUDA</button>
        </div>
      </div>

      <div id="clientSelect" style="display:none;" class="animate-fade-in">
        <div class="form-group">
          <label>Seleccionar Cliente</label>
          <select id="selClientId">
            <option value="">-- Elige un cliente --</option>
            ${clientes.map(c => `<option value="${c.id}">${c.nombre} (Debe: $${c.saldo_deuda})</option>`).join('')}
          </select>
        </div>
      </div>

      <div style="display:grid; gap: 10px; margin-top: 2rem;">
        <button class="btn btn-primary" id="btnFinish">FINALIZAR VENTA</button>
        <button class="btn btn-ghost" onclick="closeModal()">VOLVER ATRÁS</button>
      </div>
    `;

    let selectedClientId = null;
    document.getElementById('btnCash').onclick = () => {
      selectedClientId = null;
      document.getElementById('btnCash').style.border = '2px solid var(--primary)';
      document.getElementById('btnCredit').style.border = 'none';
      document.getElementById('clientSelect').style.display = 'none';
    };
    document.getElementById('btnCredit').onclick = () => {
      document.getElementById('btnCredit').style.border = '2px solid var(--primary)';
      document.getElementById('btnCash').style.border = 'none';
      document.getElementById('clientSelect').style.display = 'block';
    };

    document.getElementById('btnFinish').onclick = async () => {
      if (document.getElementById('clientSelect').style.display === 'block') {
        selectedClientId = document.getElementById('selClientId').value;
        if (!selectedClientId) return toast("Selecciona un cliente para fiar", "error");
      }

      const btn = document.getElementById('btnFinish');
      btn.disabled = true;
      btn.innerHTML = '<div class="loading-spinner"></div>';

      try {
        const sale = await addData('ventas', { total, cliente_id: selectedClientId });
        for (const item of currentSale) {
          await addData('detalles_venta', {
            venta_id: sale.id,
            producto_id: item.id,
            cantidad: item.quantity,
            precio_unitario: item.precio_venta
          });
          await updateData('productos', item.id, { stock: Number(item.stock) - item.quantity });
        }
        if (selectedClientId) {
          const c = clientes.find(x => x.id == selectedClientId);
          await updateData('clientes', selectedClientId, { saldo_deuda: Number(c.saldo_deuda) + total });
        }
        toast("Venta realizada con éxito");
        closeModal();
        navigate('dashboard');
      } catch (e) { toast("Error: " + e.message, "error"); btn.disabled = false; btn.innerText = 'FINALIZAR'; }
    };
  };
};

const renderInventario = async (container, action, params) => {
  if (action === 'list') {
    showLoading(container);
    const productos = await fetchData('productos');
    const isAdmin = user.rol === 'admin';

    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1.5rem;">
        <h3>${productos.length} Productos</h3>
        ${isAdmin ? `<button class="btn btn-primary" onclick="navigate('productos', 'create')">＋ NUEVO PRODUCTO</button>` : ''}
      </div>

      <div class="card" style="padding:0;">
        <table class="data-table" style="width:100%; border-collapse: collapse;">
          <thead style="background: var(--bg-app); font-size: 0.75rem; text-align:left;">
            <tr>
              <th style="padding:1rem;">Nombre</th>
              <th>Stock</th>
              <th>Venta</th>
              ${isAdmin ? '<th style="text-align:right; padding-right:1rem;">Opciones</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${productos.map(p => `
              <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding:1rem; font-weight:600;">${p.nombre}</td>
                <td><span class="stock-badge ${Number(p.stock) <= 5 ? 'stock-low' : ''}">${p.stock} ${p.unidad}</span></td>
                <td style="font-weight:700; color:var(--primary);">$${Number(p.precio_venta).toFixed(2)}</td>
                ${isAdmin ? `
                <td style="text-align:right; padding-right:1rem;">
                  <button class="btn btn-ghost" onclick="navigate('productos', 'edit', { id: ${p.id}, name: '${p.nombre}' })">✏️</button>
                  <button class="btn btn-ghost" onclick="window.vDeleteProd(${p.id}, '${p.nombre}')">🗑️</button>
                </td>` : ''}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    window.vDeleteProd = (id, name) => {
      if (confirm(`¿Estás seguro de eliminar "${name}"? Esta acción no se puede deshacer.`)) {
        deleteData('productos', id).then(() => {
          toast("Producto eliminado");
          navigate('productos');
        });
      }
    };
  } else {
    // FORM: CREATE or EDIT
    const isEdit = action === 'edit';
    let data = { nombre: '', precio_compra: '', precio_venta: '', stock: '', stock_minimo: 5, unidad: 'kg' };

    if (isEdit) {
      const prods = await fetchData('productos');
      data = prods.find(p => p.id == params.id);
    }

    container.innerHTML = `
      <div class="card animate-fade-in">
        <form id="prodForm">
          <div class="form-group">
            <label>Nombre del Producto</label>
            <input type="text" id="pName" value="${data.nombre}" placeholder="Ej: Manzana Roja" required>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div class="form-group">
              <label>Unidad</label>
              <select id="pUnit">
                <option value="kg" ${data.unidad === 'kg' ? 'selected' : ''}>Kilo (kg)</option>
                <option value="unid" ${data.unidad === 'unid' ? 'selected' : ''}>Unidad (unid)</option>
              </select>
            </div>
            <div class="form-group">
              <label>Stock Actual</label>
              <input type="number" id="pStock" value="${data.stock}" step="0.01" required>
            </div>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 15px;">
             <div class="form-group">
               <label>Precio Compra (Costo)</label>
               <input type="number" id="pCost" value="${data.precio_compra}" step="0.01" required>
             </div>
             <div class="form-group">
               <label>Precio Venta</label>
               <input type="number" id="pPrice" value="${data.precio_venta}" step="0.01" required>
             </div>
          </div>
          <div class="form-group">
            <label>Alerta Stock Mínimo</label>
            <input type="number" id="pMin" value="${data.stock_minimo}" required>
          </div>

          <div style="display:grid; gap:10px; margin-top: 1rem;">
            <button type="submit" class="btn btn-primary" id="btnSaveProd">💾 GUARDAR PRODUCTO</button>
            <button type="button" class="btn btn-secondary" onclick="navigate('productos')">❌ CANCELAR</button>
          </div>
        </form>
      </div>
    `;

    document.getElementById('prodForm').onsubmit = async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btnSaveProd');
      btn.disabled = true;
      btn.innerHTML = '<div class="loading-spinner"></div>';

      const payload = {
        nombre: document.getElementById('pName').value,
        unidad: document.getElementById('pUnit').value,
        stock: parseFloat(document.getElementById('pStock').value),
        precio_compra: parseFloat(document.getElementById('pCost').value),
        precio_venta: parseFloat(document.getElementById('pPrice').value),
        stock_minimo: parseInt(document.getElementById('pMin').value)
      };

      try {
        if (isEdit) await updateData('productos', params.id, payload);
        else await addData('productos', payload);
        toast("Inventario actualizado");
        navigate('productos');
      } catch (e) { toast("Error: " + e.message, "error"); btn.disabled = false; }
    };
  }
};

const renderClientes = async (container, action, params) => {
  if (action === 'list') {
    showLoading(container);
    const clientes = await fetchData('clientes');

    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1.5rem;">
        <h3>${clientes.length} Clientes registrados</h3>
        <button class="btn btn-primary" onclick="navigate('clientes', 'create')">＋ NUEVO CLIENTE</button>
      </div>

      ${clientes.map(c => `
        <div class="card animate-fade-in" style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-weight:800; font-size:1.1rem;">${c.nombre}</div>
            <div style="font-size:0.8rem; color:var(--text-muted);">ID: #${c.id.toString().slice(-4)}</div>
          </div>
          <div style="text-align:right;">
             <div style="color: ${Number(c.saldo_deuda) > 0 ? 'var(--danger)' : 'var(--primary)'}; font-weight:900; font-size:1.2rem;">
               $${Number(c.saldo_deuda).toFixed(2)}
             </div>
             <div style="display:flex; gap:5px; margin-top:5px;">
                <button class="btn btn-secondary" style="padding:5px 10px; font-size:0.7rem;" onclick="window.cPay(${c.id}, '${c.nombre}')">ABONAR</button>
                <button class="btn btn-ghost" style="padding:5px;" onclick="navigate('clientes', 'edit', { id: ${c.id}, name: '${c.nombre}' })">✏️</button>
             </div>
          </div>
        </div>
      `).join('')}
    `;

    window.cPay = async (id, name) => {
      const clis = await fetchData('clientes');
      const c = clis.find(x => x.id == id);
      const m = prompt(`¿Cuánto abona ${name}? (Deuda: $${c.saldo_deuda})`);
      const val = parseFloat(m);
      if (!val || val <= 0) return;

      try {
        await updateData('clientes', id, { saldo_deuda: Number(c.saldo_deuda) - val });
        await addData('pagos', { cliente_id: id, monto: val, fecha: new Date().toISOString() });
        toast("Pago registrado");
        navigate('clientes');
      } catch (e) { toast("Error: " + e.message, "error"); }
    };

  } else {
    // FORM: CREATE or EDIT
    const isEdit = action === 'edit';
    let data = { nombre: '', telefono: '' };
    if (isEdit) {
      const clis = await fetchData('clientes');
      data = clis.find(x => x.id == params.id);
    }

    container.innerHTML = `
      <div class="card">
        <form id="cliForm">
          <div class="form-group">
            <label>Nombre Completo</label>
            <input type="text" id="cName" value="${data.nombre}" placeholder="Nombre del cliente" required>
          </div>
          <div class="form-group">
            <label>Teléfono (Opcional)</label>
            <input type="tel" id="cTel" value="${data.telefono || ''}" placeholder="Ej: 0414-1234567">
          </div>

          <div style="display:grid; gap:10px; margin-top:2rem;">
            <button type="submit" class="btn btn-primary" id="btnSaveCli">👥 GUARDAR CLIENTE</button>
            <button type="button" class="btn btn-secondary" onclick="navigate('clientes')">❌ CANCELAR</button>
          </div>
        </form>
      </div>
    `;

    document.getElementById('cliForm').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const payload = { nombre: document.getElementById('cName').value, telefono: document.getElementById('cTel').value };
        if (isEdit) await updateData('clientes', params.id, payload);
        else await addData('clientes', { ...payload, saldo_deuda: 0 });
        toast("Cliente guardado");
        navigate('clientes');
      } catch (ex) { toast(ex.message, "error"); }
    };
  }
};

const renderCompras = async (container, action, params) => {
  if (action === 'list') {
    showLoading(container);
    const [productos, compras] = await Promise.all([fetchData('productos'), fetchData('compras')]);

    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1.5rem;">
        <h3>Historial de Abastecimiento</h3>
        <button class="btn btn-primary" onclick="navigate('compras', 'create')">🚚 REGISTRAR COMPRA</button>
      </div>

      ${compras.reverse().map(c => {
      const p = productos.find(x => x.id == c.producto_id);
      return `
          <div class="card animate-fade-in">
             <div style="display:flex; justify-content:space-between;">
                <span style="font-weight:700;">${p?.nombre || 'Producto eliminado'}</span>
                <span style="color:var(--danger); font-weight:800;">-$${Number(c.total).toFixed(2)}</span>
             </div>
             <div style="font-size:0.75rem; color:var(--text-muted); margin-top:5px;">
                ${c.cantidad} ${p?.unidad || ''} | ${new Date(c.fecha).toLocaleDateString()} ${new Date(c.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
             </div>
          </div>
        `;
    }).join('')}
    `;
  } else {
    showLoading(container);
    const productos = await fetchData('productos');

    container.innerHTML = `
      <div class="card">
        <form id="buyForm">
          <div class="form-group">
            <label>Producto a reponer</label>
            <select id="bProd" required>
              <option value="">-- Selecciona producto --</option>
               ${productos.map(p => `<option value="${p.id}">${p.nombre} (Libre: ${p.stock})</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Cantidad comprada</label>
            <input type="number" id="bQty" step="0.01" required placeholder="0.00">
          </div>
          <div class="form-group">
            <label>Precio de Compra x unidad/kg</label>
            <input type="number" id="bCost" step="0.01" required placeholder="0.00">
          </div>
          <div style="display:grid; gap:10px; margin-top:2rem;">
            <button type="submit" class="btn btn-primary" id="btnDoBuy">📦 REGISTRAR Y ACTUALIZAR STOCK</button>
            <button type="button" class="btn btn-secondary" onclick="navigate('compras')">CANCELAR</button>
          </div>
        </form>
      </div>
    `;

    document.getElementById('buyForm').onsubmit = async (e) => {
      e.preventDefault();
      const pid = parseInt(document.getElementById('bProd').value);
      const qty = parseFloat(document.getElementById('bQty').value);
      const cost = parseFloat(document.getElementById('bCost').value);

      try {
        await addData('compras', { producto_id: pid, cantidad: qty, costo_unidad: cost, total: qty * cost, fecha: new Date().toISOString() });
        const p = productos.find(x => x.id == pid);
        await updateData('productos', pid, { stock: Number(p.stock) + qty, precio_compra: cost });
        toast("Stock actualizado con éxito");
        navigate('compras');
      } catch (ex) { toast(ex.message, "error"); }
    };
  }
};

const renderReportes = async (container) => {
  showLoading(container);
  const [ventas, compras] = await Promise.all([fetchData('ventas'), fetchData('compras')]);

  const totalVentas = ventas.reduce((a, b) => a + Number(b.total), 0);
  const totalCompras = compras.reduce((a, b) => a + Number(b.total), 0);
  const balance = totalVentas - totalCompras;

  container.innerHTML = `
    <div class="card">
      <span class="card-title">Balance Histórico Cloud</span>
      <div style="font-size: 2rem; font-weight: 900; color: ${balance >= 0 ? 'var(--primary)' : 'var(--danger)'}; margin: 10px 0;">
        $${balance.toFixed(2)}
      </div>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; border-top: 1px solid var(--border); padding-top:1rem;">
         <div>
            <div style="font-size:0.7rem; color:var(--text-muted);">TOTAL VENTAS</div>
            <div style="color:var(--primary); font-weight:700;">+$${totalVentas.toFixed(2)}</div>
         </div>
         <div>
            <div style="font-size:0.7rem; color:var(--text-muted);">TOTAL COMPRAS</div>
            <div style="color:var(--danger); font-weight:700;">-$${totalCompras.toFixed(2)}</div>
         </div>
      </div>
    </div>

    <div class="card">
       <h3>Últimas 10 Ventas</h3>
       <div style="margin-top:10px;">
          ${ventas.slice(-10).reverse().map(v => `
            <div style="display:flex; justify-content:space-between; font-size:0.85rem; padding:8px 0; border-bottom:1px solid var(--bg-app);">
              <span>${new Date(v.fecha).toLocaleDateString()}</span>
              <span style="font-weight:700;">$${Number(v.total).toFixed(2)}</span>
            </div>
          `).join('')}
       </div>
    </div>
  `;
};

// --- BOOTSTRAP ---

window.closeModal = () => modalOverlay.classList.remove('active');

const checkSession = async () => {
  const { data } = await supabase.auth.getSession();
  user = data.session?.user || null;
  if (user) {
    const { data: profile } = await supabase.from('perfiles').select('rol').eq('id', user.id).single();
    if (profile) user.rol = profile.rol;
  }
  initNav();
  navigate(user ? 'dashboard' : 'login');
};

// Handle all auth changes (login, logout, token refresh)
supabase.auth.onAuthStateChange((event, session) => {
  console.log("Auth Event:", event);
  if (event === 'SIGNED_OUT') {
    user = null;
    app.innerHTML = '';
    navigate('login');
  } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
    checkSession();
  }
});

checkSession();

// Global for nav/legacy
window.navigate = navigate;
window.closeModal = closeModal;
