import './style.css';
import { fetchData, addData, updateData, deleteData } from './db.js';
import { supabase } from './supabase.js';
import { openReportModal } from './reportes.js';

// --- APPLICATION STATE ---
let user = null;
let profile = { nombre_tienda: 'Frutería Los Amigos' }; // Tienda única
let currentModule = 'dashboard';
let currentAction = 'list'; // list, create, edit
let currentSale = []; // { product, quantity }
let isProcessing = false;
let editingSaleId = null; // ID of the sale being edited
let editingMetodoPago = null; // Original payment method when editing

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
const renderLogin = () => {
  const nav = document.querySelector('nav');
  if (nav) nav.style.display = 'none';

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
          ENTRAR A MI TIENDA
        </button>
      </form>
      <p id="authError" style="color: var(--danger); font-size: 0.9rem; margin-top: 1.5rem; padding: 1rem; background: #fef2f2; border-radius: var(--radius-sm); border-left: 4px solid var(--danger); display: none; text-align: left;"></p>
    </div>
  `;

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
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err) {
      errBox.innerText = "❌ " + err.message;
      errBox.style.display = 'block';
      btn.disabled = false;
      btn.innerText = 'ENTRAR A MI TIENDA';
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
      <h2 style="margin: 0;">${profile.nombre_tienda} 🍎</h2>
      <p style="opacity: 0.9; margin-top: 5px;">Usuario: ${user.email}</p>
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
      <button class="btn btn-primary" style="padding: 1.5rem; font-size: 1.2rem; border-radius: var(--radius-lg);" onclick="navigate('ventas', 'create')">
        🚀 NUEVA VENTA RÁPIDA
      </button>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
         <button class="btn btn-secondary" onclick="navigate('productos')">📦 Stock</button>
         <button class="btn btn-secondary" onclick="navigate('compras')">🚚 Compras</button>
      </div>
      <button class="btn" id="btnGenerarReporte" style="background: linear-gradient(135deg, var(--secondary) 0%, #4f46e5 100%); color: white; padding: 0.9rem; border-radius: var(--radius-md); font-size: 1rem; letter-spacing: 0.3px; box-shadow: 0 4px 14px rgba(99,102,241,0.35);">
        📊 Generar Reporte
      </button>
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
  document.getElementById('btnGenerarReporte').onclick = () => openReportModal();
};

const renderVentas = async (container, action) => {
  if (action === 'list') {
    showLoading(container);
    const [ventas, clientes] = await Promise.all([fetchData('ventas'), fetchData('clientes')]);

    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1.5rem;">
        <h3>${ventas.length} Ventas realizadas</h3>
        <button class="btn btn-primary" onclick="navigate('ventas', 'create')">＋ NUEVA VENTA</button>
      </div>

      <div class="card" style="padding:0;">
        <table class="data-table" style="width:100%; border-collapse: collapse;">
          <thead style="background: var(--bg-app); font-size: 0.75rem; text-align:left;">
            <tr>
              <th style="padding:1rem;">Fecha</th>
              <th>Cliente</th>
              <th>Método</th>
              <th>Total</th>
              <th style="text-align:right; padding-right:1rem;">Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${ventas.reverse().map(v => {
      const cliente = clientes.find(c => c.id === v.cliente_id);
      const metodoIcon = {
        'efectivo': '💵',
        'pago_movil': '📱',
        'fiado': '🛡️'
      }[v.metodo_pago] || '💵';

      return `
                <tr style="border-bottom: 1px solid var(--border);">
                  <td style="padding:1rem; font-size: 0.85rem;">${new Date(v.fecha).toLocaleDateString()} ${new Date(v.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  <td style="font-size: 0.85rem;">${cliente ? cliente.nombre : '<span style="color:var(--text-muted)">Contado</span>'}</td>
                  <td style="font-size: 1.1rem; text-align: center;">${metodoIcon}</td>
                  <td style="font-weight:700; color:var(--primary);">$${Number(v.total).toFixed(2)}</td>
                  <td style="text-align:right; padding-right:1rem; display:flex; justify-content: flex-end; gap:5px;">
                    <button class="btn btn-ghost" onclick="window.vShowDetail(${v.id})" title="Ver detalle">👁️</button>
                    <button class="btn btn-ghost" onclick="window.vEditVenta(${v.id})" title="Editar venta">✏️</button>
                    <button class="btn btn-ghost" onclick="window.vDeleteVenta(${v.id})" title="Eliminar venta">🗑️</button>
                  </td>
                </tr>
              `;
    }).join('')}
          </tbody>
        </table>
      </div>
    `;

    window.vDeleteVenta = async (id) => {
      if (!confirm(`¿Estás seguro de eliminar la venta #${id}? Se restará de la deuda del cliente y se devolverá el stock.`)) return;

      try {
        const [detalles, venta, productos, todosClientes] = await Promise.all([
          fetchData('detalles_venta'),
          fetchData('ventas').then(vv => vv.find(x => x.id === id)),
          fetchData('productos'),
          fetchData('clientes')
        ]);

        const items = detalles.filter(d => d.venta_id === id);

        // 1. Devolver Stock
        for (const item of items) {
          const p = productos.find(x => x.id === item.producto_id);
          if (p) {
            await updateData('productos', p.id, { stock: Number(p.stock) + Number(item.cantidad) });
          }
        }

        // 2. Ajustar Deuda Cliente (si aplica)
        if (venta.cliente_id) {
          const c = todosClientes.find(x => x.id == venta.cliente_id);
          if (c) {
            await updateData('clientes', c.id, { saldo_deuda: Number(c.saldo_deuda) - Number(venta.total) });
          }
        }

        // 3. Eliminar detalles y venta (Supabase cascade might handle details, but let's be explicit if not sure)
        // Note: Assuming detalles_venta has a migration that deletes on cascade, if not we delete manually
        // We'll delete venta, assuming cascade or we can delete details first.
        // For safety in this environment where we don't see the schema:
        for (const item of items) {
          await deleteData('detalles_venta', item.id);
        }
        await deleteData('ventas', id);

        toast("Venta eliminada correctamente");
        navigate('ventas');
      } catch (e) {
        toast("Error al eliminar: " + e.message, "error");
      }
    };

    window.vEditVenta = async (id) => {
      showLoading(container);
      try {
        const [detalles, venta, productos] = await Promise.all([
          fetchData('detalles_venta'),
          fetchData('ventas').then(vv => vv.find(x => x.id === id)),
          fetchData('productos')
        ]);

        const items = detalles.filter(d => d.venta_id === id);
        currentSale = items.map(i => {
          const p = productos.find(x => x.id === i.producto_id);
          return { ...p, quantity: Number(i.cantidad) };
        });

        editingSaleId = id;
        editingMetodoPago = venta.metodo_pago;
        navigate('ventas', 'create');
      } catch (e) {
        toast("Error al cargar venta: " + e.message, "error");
        navigate('ventas');
      }
    };

    window.vShowDetail = async (id) => {
      showLoading(document.getElementById('modal-content'));
      modalOverlay.classList.add('active');
      const [detalles, productos] = await Promise.all([fetchData('detalles_venta'), fetchData('productos')]);
      const items = detalles.filter(d => d.venta_id === id);
      const venta = ventas.find(v => v.id === id);
      const cliente = clientes.find(c => c.id === venta.cliente_id);

      const content = document.getElementById('modal-content');
      content.innerHTML = `
        <h2>Detalle de Venta #${id.toString().slice(-4)}</h2>
        <div style="margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border);">
          <div style="font-size: 0.9rem; color: var(--text-muted);">Fecha: ${new Date(venta.fecha).toLocaleString()}</div>
          <div style="font-size: 0.9rem; color: var(--text-muted);">Cliente: ${cliente ? cliente.nombre : 'Contado'}</div>
          <div style="font-size: 0.9rem; color: var(--text-muted);">Método: ${venta.metodo_pago === 'pago_movil' ? '📱 Pago Móvil' : venta.metodo_pago === 'fiado' ? '🛡️ Crédito' : '💵 Efectivo'}</div>
        </div>
        <div style="margin-bottom: 2rem; max-height: 300px; overflow-y: auto;">
          ${items.map(i => {
        const p = productos.find(x => x.id === i.producto_id);
        return `
              <div style="display:flex; justify-content:space-between; padding: 8px 0; border-bottom: 1px solid var(--border);">
                <span>${i.cantidad} ${p?.unidad || ''} ${p?.nombre || 'Producto'}</span>
                <span style="font-weight:700;">$${(Number(i.precio_unitario) * i.cantidad).toFixed(2)}</span>
              </div>
            `;
      }).join('')}
          <div style="display:flex; justify-content:space-between; padding: 1rem 0; font-size: 1.4rem; font-weight: 900; color: var(--primary);">
            <span>TOTAL</span>
            <span>$${Number(venta.total).toFixed(2)}</span>
          </div>
        </div>
        <button class="btn btn-primary btn-block" onclick="closeModal()">CERRAR</button>
      `;
    };

  } else {
    // action === 'create'
    showLoading(container);
    const [productos, clientes] = await Promise.all([fetchData('productos'), fetchData('clientes')]);
<<<<<<< HEAD

    // Only clear if not editing
    if (!editingSaleId) {
      currentSale = [];
=======
    
    // currentSale persistency handled after success/cancel
    if (editingSaleId && currentSale.length === 0) {
      // should have been populated in Edit logic, but safe-guard
>>>>>>> 33d18632d202d37acdf32705f14bdbf414d75af0
    }

    container.innerHTML = `
      ${editingSaleId ? `<div style="background: var(--warning); color: white; padding: 10px; border-radius: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
          <span>✏️ Editando Venta #${editingSaleId}</span>
          <button class="btn btn-ghost" style="color:white; padding: 5px;" onclick="window.vCancelEdit()">CANCELAR EDICIÓN</button>
        </div>` : ''}
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

      <button id="vCartBtn" class="floating-cart-btn" onclick="window.vShowCart()">
        <span class="cart-icon">🛒</span>
        <span id="vBadge" class="cart-badge">0</span>
      </button>
    `;



    window.vCancelSale = () => {
      if (!confirm("¿Estás seguro de cancelar la venta actual?")) return;
      currentSale = [];
      editingSaleId = null;
      closeModal();
      navigate('dashboard');
    };

    window.vShowCart = () => {
      modalOverlay.classList.add('active');
      const content = document.getElementById('modal-content');
      const total = currentSale.reduce((a, b) => a + (Number(b.precio_venta) * b.quantity), 0);

      content.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
          <h2 style="margin:0;">Carrito de Venta</h2>
          <button class="btn btn-ghost" onclick="window.vCancelSale()" style="color:var(--danger);">CANCELAR VENTA</button>
        </div>
        
        <div style="margin-bottom: 2rem; max-height: 400px; overflow-y: auto;">
          ${currentSale.length === 0 ? '<p style="text-align:center; color:var(--text-muted); padding:2rem;">El carrito está vacío</p>' : 
            currentSale.map(i => `
              <div style="display:flex; flex-direction:column; padding: 12px 0; border-bottom: 1px solid var(--border);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                  <span style="font-weight:700;">${i.nombre}</span>
                  <span style="font-weight:800; color:var(--primary);">$${(Number(i.precio_venta) * i.quantity).toFixed(2)}</span>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <div style="display:flex; align-items:center; gap:10px;">
                    <button class="btn btn-secondary" style="padding:4px 10px;" onclick="window.vUpdateQty(${i.id}, -1)">-</button>
                    <span style="min-width:60px; text-align:center; font-weight:600;">${i.quantity} ${i.unidad}</span>
                    <button class="btn btn-secondary" style="padding:4px 10px;" onclick="window.vUpdateQty(${i.id}, 1)">+</button>
                  </div>
                  <button class="btn btn-ghost" style="color:var(--danger); padding:5px;" onclick="window.vRemove(${i.id})">🗑️</button>
                </div>
              </div>
            `).join('')}
        </div>

        ${currentSale.length > 0 ? `
          <div style="display:flex; justify-content:space-between; padding: 1rem 0; font-size: 1.6rem; font-weight: 900; color: var(--primary);">
            <span>TOTAL</span>
            <span>$${total.toFixed(2)}</span>
          </div>
          <div style="display:grid; gap: 10px; margin-top: 1rem;">
            <button class="btn btn-primary" onclick="window.vCheckout()">CONTINUAR AL PAGO ➔</button>
            <button class="btn btn-ghost" onclick="closeModal()">SEGUIR AGREGANDO</button>
          </div>
        ` : `
          <button class="btn btn-primary btn-block" onclick="closeModal()">VOLVER</button>
        `}
      `;
    };

    window.vUpdateQty = (pid, delta) => {
      const item = currentSale.find(x => x.id === pid);
      if (!item) return;
      
      const p = productos.find(x => x.id === pid);
      let newQty = item.quantity + (item.unidad === 'kg' ? delta * 0.1 : delta);
      
      if (newQty <= 0) return window.vRemove(pid);
      if (newQty > Number(p.stock)) return toast("No hay suficiente stock", "error");
      
      item.quantity = Number(newQty.toFixed(2));
      window.vSyncUI();
      window.vShowCart(); // Refresh modal
    };

    window.vRemove = (pid) => {
      currentSale = currentSale.filter(x => x.id !== pid);
      window.vSyncUI();
      window.vShowCart(); // Refresh modal
    };

    window.vSyncUI = () => {
      const btn = document.getElementById('vCartBtn');
      const badge = document.getElementById('vBadge');
      
      btn.style.display = 'flex'; // Always show button in create mode
      badge.innerText = currentSale.length;
      badge.style.display = currentSale.length > 0 ? 'flex' : 'none'; // Only show badge if > 0

      // Update product item badges in grid
      document.querySelectorAll('.product-count').forEach(b => {
        const pid = parseInt(b.id.split('-')[1]);
        const item = currentSale.find(x => x.id === pid);
        if (item) {
          b.innerText = item.unidad === 'kg' ? item.quantity.toFixed(1) : item.quantity;
          b.classList.add('visible');
        } else {
          b.innerText = '0';
          b.classList.remove('visible');
        }
      });
    };

    window.vSyncUI(); // Initial sync on load after definitions

    window.vCancelEdit = () => {
      editingSaleId = null;
      editingMetodoPago = null;
      currentSale = [];
      navigate('ventas');
    };

    document.getElementById('vSearch').oninput = (e) => {
      const term = e.target.value.toLowerCase();
      document.querySelectorAll('.product-item').forEach(el => {
        el.style.display = el.dataset.name.includes(term) ? 'block' : 'none';
      });
    };

    // Logic globally attached for onclick
    window.vAdd = (pid) => {
      const p = productos.find(x => x.id === pid);
      const existing = currentSale.find(x => x.id === pid);
      
      // If already in cart, just increment or prompt? 
      // User said "go adding", usually click = add 1 or prompt.
      // Let's keep prompt for kg, and maybe just add 1 for units?
      // Or always prompt to be safe. Let's keep the prompt but improve it.

      const defaultQty = existing ? existing.quantity : (p.unidad === 'kg' ? 1.0 : 1);
      const qty = prompt(`¿Cuánto vas a vender de ${p.nombre}? (${p.unidad})`, defaultQty);
      const nQty = parseFloat(qty);
      if (!nQty || nQty <= 0) return;
      if (nQty > Number(p.stock)) return toast("No hay suficiente stock", "error");

      if (existing) existing.quantity = nQty;
      else currentSale.push({ ...p, quantity: nQty });

      window.vSyncUI();
      toast(`${p.nombre} agregado`);
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
          <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
            <button class="btn btn-secondary" id="btnCash" style="border: 2px solid var(--primary); font-size: 0.8rem;">💵 EFECTIVO</button>
            <button class="btn btn-secondary" id="btnMobile" style="font-size: 0.8rem;">📱 PAGO MÓVIL</button>
            <button class="btn btn-secondary" id="btnCredit" style="font-size: 0.8rem;">🛡️ CRÉDITO</button>
          </div>
        </div>

        <div id="clientSelect" style="display:none;" class="animate-fade-in">
          <div class="form-group">
            <label>Seleccionar Cliente</label>
            <input type="text" id="cSearch" placeholder="🔍 Buscar cliente..." style="margin-bottom: 10px;">
            <select id="selClientId">
              <option value="">-- Elige un cliente --</option>
              ${clientes.map(c => {
        const saldo = Number(c.saldo_deuda);
        const label = saldo >= 0 ? 'Debe' : 'Favor';
        return `<option value="${c.id}">${c.nombre} (${label}: $${Math.abs(saldo).toFixed(2)})</option>`;
      }).join('')}
            </select>
          </div>
        </div>

        <div style="display:grid; gap: 10px; margin-top: 2rem;">
          <button class="btn btn-primary" id="btnFinish">FINALIZAR VENTA</button>
          <button class="btn btn-ghost" onclick="window.vShowCart()">VOLVER AL CARRITO</button>
        </div>
      `;

      let selectedClientId = null;
      let metodoPago = editingMetodoPago || 'efectivo';

      const updateUI = () => {
        document.getElementById('btnCash').style.border = metodoPago === 'efectivo' ? '2px solid var(--primary)' : 'none';
        document.getElementById('btnMobile').style.border = metodoPago === 'pago_movil' ? '2px solid var(--primary)' : 'none';
        document.getElementById('btnCredit').style.border = metodoPago === 'fiado' ? '2px solid var(--primary)' : 'none';
        document.getElementById('clientSelect').style.display = metodoPago === 'fiado' ? 'block' : 'none';
      };

      updateUI();

      document.getElementById('btnCash').onclick = () => {
        selectedClientId = null;
        metodoPago = 'efectivo';
        updateUI();
      };
      document.getElementById('btnMobile').onclick = () => {
        selectedClientId = null;
        metodoPago = 'pago_movil';
        updateUI();
      };
      document.getElementById('btnCredit').onclick = () => {
        metodoPago = 'fiado';
        updateUI();
        document.getElementById('cSearch').focus();
      };

      // logic for client search
      document.getElementById('cSearch').oninput = (e) => {
        const term = e.target.value.toLowerCase();
        const select = document.getElementById('selClientId');
        const currentValue = select.value;

        const filtered = clientes.filter(c => c.nombre.toLowerCase().includes(term));
        select.innerHTML = `
          <option value="">-- Elige un cliente --</option>
          ${filtered.map(c => {
          const saldo = Number(c.saldo_deuda);
          const label = saldo >= 0 ? 'Debe' : 'Favor';
          return `<option value="${c.id}" ${c.id == currentValue ? 'selected' : ''}>${c.nombre} (${label}: $${Math.abs(saldo).toFixed(2)})</option>`;
        }).join('')}
        `;
      };

      document.getElementById('btnFinish').onclick = async () => {
        if (document.getElementById('clientSelect').style.display === 'block') {
          selectedClientId = document.getElementById('selClientId').value;
          if (!selectedClientId) return toast("Selecciona un cliente para dar crédito", "error");
        }

        const btn = document.getElementById('btnFinish');
        btn.disabled = true;
        btn.innerHTML = '<div class="loading-spinner"></div>';

        try {
          if (editingSaleId) {
            // Revertir Venta Anterior
            const [oldVenta, oldDetalles, pList] = await Promise.all([
              fetchData('ventas').then(vv => vv.find(x => x.id === editingSaleId)),
              fetchData('detalles_venta'),
              fetchData('productos')
            ]);

            const oldItems = oldDetalles.filter(d => d.venta_id === editingSaleId);

            // Devolver stock anterior
            for (const item of oldItems) {
              const p = pList.find(x => x.id === item.producto_id);
              if (p) await updateData('productos', p.id, { stock: Number(p.stock) + Number(item.cantidad) });
            }
            // Devolver deuda anterior
            if (oldVenta.cliente_id) {
              const c = clientes.find(x => x.id == oldVenta.cliente_id);
              if (c) await updateData('clientes', c.id, { saldo_deuda: Number(c.saldo_deuda) - Number(oldVenta.total) });
            }
            // Eliminar detalles anteriores
            for (const item of oldItems) await deleteData('detalles_venta', item.id);

            // Actualizar Venta
            await updateData('ventas', editingSaleId, { total, cliente_id: selectedClientId, metodo_pago: metodoPago });
            var saleId = editingSaleId;
            editingSaleId = null; // Clear edit mode
            editingMetodoPago = null;
          } else {
            const sale = await addData('ventas', { total, cliente_id: selectedClientId, metodo_pago: metodoPago });
            var saleId = sale.id;
          }

          // Aplicar Nueva Venta
          const updatedProds = await fetchData('productos');
          for (const item of currentSale) {
            await addData('detalles_venta', {
              venta_id: saleId,
              producto_id: item.id,
              cantidad: item.quantity,
              precio_unitario: item.precio_venta
            });
            const pActual = updatedProds.find(x => x.id === item.id);
            await updateData('productos', item.id, { stock: Number(pActual.stock) - item.quantity });
          }

          if (selectedClientId) {
            const c = clientes.find(x => x.id == selectedClientId);
            const currentC = await fetchData('clientes').then(cc => cc.find(x => x.id == selectedClientId));
            await updateData('clientes', selectedClientId, { saldo_deuda: Number(currentC.saldo_deuda) + total });
          }

          toast(editingSaleId ? "Venta actualizada correctamente" : "Venta realizada con éxito");
          currentSale = []; // Clear cart
          editingSaleId = null; 
          closeModal();
          navigate('ventas');
        } catch (e) { toast("Error: " + e.message, "error"); btn.disabled = false; btn.innerText = 'FINALIZAR'; }
      };
    };

  }
};

const renderInventario = async (container, action, params) => {
  if (action === 'list') {
    showLoading(container);
    const productos = await fetchData('productos');
    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1.5rem;">
        <h3>${productos.length} Productos</h3>
        <button class="btn btn-primary" onclick="navigate('productos', 'create')">＋ NUEVO PRODUCTO</button>
      </div>

      <div class="card" style="padding:0;">
        <table class="data-table" style="width:100%; border-collapse: collapse;">
          <thead style="background: var(--bg-app); font-size: 0.75rem; text-align:left;">
            <tr>
              <th style="padding:1rem;">Nombre</th>
              <th>Stock</th>
              <th>Venta</th>
              <th style="text-align:right; padding-right:1rem;">Opciones</th>
            </tr>
          </thead>
          <tbody>
            ${productos.map(p => `
              <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding:1rem; font-weight:600;">${p.nombre}</td>
                <td><span class="stock-badge ${Number(p.stock) <= 5 ? 'stock-low' : ''}">${p.stock} ${p.unidad}</span></td>
                <td style="font-weight:700; color:var(--primary);">$${Number(p.precio_venta).toFixed(2)}</td>
                <td style="text-align:right; padding-right:1rem;">
                  <button class="btn btn-ghost" onclick="navigate('productos', 'edit', { id: ${p.id}, name: '${p.nombre}' })">✏️</button>
                  <button class="btn btn-ghost" onclick="window.vDeleteProd(${p.id}, '${p.nombre}')">🗑️</button>
                </td>
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

      ${clientes.map(c => {
      const saldo = Number(c.saldo_deuda);
      const isDebt = saldo > 0;
      return `
          <div class="card animate-fade-in" style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-weight:800; font-size:1.1rem;">${c.nombre}</div>
              <div style="font-size:0.8rem; color:var(--text-muted);">ID: #${c.id.toString().slice(-4)}</div>
            </div>
            <div style="text-align:right;">
               <div style="color: ${isDebt ? 'var(--danger)' : 'var(--primary)'}; font-weight:900; font-size:1.2rem;">
                 ${isDebt ? 'Debe: ' : 'Favor: '}$${Math.abs(saldo).toFixed(2)}
               </div>
               <div style="display:flex; gap:5px; margin-top:5px; justify-content: flex-end;">
                  <button class="btn btn-secondary" style="padding:5px 10px; font-size:0.7rem;" onclick="window.cPay(${c.id}, '${c.nombre}')">ABONAR</button>
                  <button class="btn btn-ghost" style="padding:5px;" onclick="navigate('clientes', 'edit', { id: ${c.id}, name: '${c.nombre}' })">✏️</button>
               </div>
            </div>
          </div>
        `;
    }).join('')}
    `;

    window.cPay = async (id, name) => {
      const clis = await fetchData('clientes');
      const c = clis.find(x => x.id == id);

      modalOverlay.classList.add('active');
      const content = document.getElementById('modal-content');
      content.innerHTML = `
        <h2>Registrar Abono</h2>
        <p style="margin-bottom: 1.5rem; color: var(--text-muted);">
          Registrando pago para: <strong>${name}</strong><br>
          Deuda actual: <span style="color: var(--danger); font-weight: 700;">$${Number(c.saldo_deuda).toFixed(2)}</span>
        </p>
        
        <div class="form-group">
          <label>Monto a abonar ($)</label>
          <input type="number" id="payAmount" step="0.01" value="${c.saldo_deuda}" autofocus>
        </div>
        
        <div style="display:grid; gap: 10px; margin-top: 2rem;">
          <button class="btn btn-primary" id="btnConfirmPay">REGISTRAR PAGO</button>
          <button class="btn btn-ghost" onclick="closeModal()">CANCELAR</button>
        </div>
      `;

      document.getElementById('btnConfirmPay').onclick = async () => {
        const val = parseFloat(document.getElementById('payAmount').value);
        if (!val || val <= 0) return toast("Monto inválido", "error");

        const btn = document.getElementById('btnConfirmPay');
        btn.disabled = true;
        btn.innerHTML = '<div class="loading-spinner"></div>';

        try {
          await updateData('clientes', id, { saldo_deuda: Number(c.saldo_deuda) - val });
          await addData('pagos', { cliente_id: id, monto: val, fecha: new Date().toISOString() });
          toast("Pago registrado con éxito");
          closeModal();
          navigate('clientes');
        } catch (e) {
          toast("Error: " + e.message, "error");
          btn.disabled = false;
          btn.innerText = 'REGISTRAR PAGO';
        }
      };
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
          <div class="form-group" id="isNewProductContainer" style="display:flex; align-items:center; gap:10px; margin-bottom: 1.5rem; padding: 10px; background: var(--primary-light); border-radius: var(--radius-sm);">
            <input type="checkbox" id="isNewProduct" style="width: 20px; height: 20px; margin-top: 0;">
            <label for="isNewProduct" style="margin-bottom: 0; color: var(--primary-dark); font-weight: 700;">✨ ¿ES UN PRODUCTO NUEVO?</label>
          </div>

          <div id="existingProductFields">
            <div class="form-group">
              <label>🔍 Buscar y Seleccionar Producto</label>
              <input type="text" id="bSearch" placeholder="Escribe para buscar..." style="margin-bottom: 10px;">
              <select id="bProd">
                <option value="">-- Selecciona producto --</option>
                 ${productos.map(p => `<option value="${p.id}">${p.nombre} (Stock: ${p.stock})</option>`).join('')}
              </select>
            </div>
          </div>

          <div id="newProductFields" style="display:none;" class="animate-fade-in">
            <div class="form-group">
              <label>Nombre del Nuevo Producto</label>
              <input type="text" id="pName" placeholder="Ej: Mango Tommy">
            </div>
            <div style="display:grid; grid-template-columns: 1fr; gap: 15px;">
              <div class="form-group">
                <label>Unidad</label>
                <select id="pUnit">
                  <option value="kg">Kilo (kg)</option>
                  <option value="unid">Unidad (unid)</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label>Stock Mínimo (Alerta)</label>
              <input type="number" id="pMin" value="5">
            </div>
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div class="form-group">
              <label id="qtyLabel">Cantidad comprada</label>
              <input type="number" id="bQty" step="0.01" required placeholder="0.00">
            </div>
            <div class="form-group">
              <label id="costLabel">Precio Compra x Unid/Kg</label>
              <input type="number" id="bCost" step="0.01" required placeholder="0.00">
            </div>
          </div>

          <div class="form-group">
            <label id="priceLabel">Precio Venta</label>
            <input type="number" id="bPrice" step="0.01" required placeholder="0.00">
            <div id="marginAlert" style="display:none; color: var(--danger); font-size: 0.85rem; margin-top: 8px; font-weight: 700; background: #fee2e2; padding: 8px; border-radius: 6px; border-left: 4px solid var(--danger);">
              ⚠️ ALERTA: El precio de venta es menor al precio de compra. El margen es negativo.
            </div>
          </div>

          <div style="display:grid; gap:10px; margin-top:2rem;">
            <button type="submit" class="btn btn-primary" id="btnDoBuy">📦 REGISTRAR COMPRA</button>
            <button type="button" class="btn btn-secondary" onclick="navigate('compras')">CANCELAR</button>
          </div>
        </form>
      </div>
    `;

    const isNewCheck = document.getElementById('isNewProduct');
    const existingFields = document.getElementById('existingProductFields');
    const newFields = document.getElementById('newProductFields');
    const bSearch = document.getElementById('bSearch');
    const bProd = document.getElementById('bProd');
    const bPrice = document.getElementById('bPrice');
    const bCost = document.getElementById('bCost');
    const marginAlert = document.getElementById('marginAlert');
    const priceLabel = document.getElementById('priceLabel');

    const checkMargin = () => {
      const cost = parseFloat(bCost.value) || 0;
      const price = parseFloat(bPrice.value) || 0;
      if (price > 0 && price < cost) {
        marginAlert.style.display = 'block';
      } else {
        marginAlert.style.display = 'none';
      }
    };

    bCost.oninput = checkMargin;
    bPrice.oninput = checkMargin;

    isNewCheck.onchange = (e) => {
      const isNew = e.target.checked;
      existingFields.style.display = isNew ? 'none' : 'block';
      newFields.style.display = isNew ? 'block' : 'none';
      
      if (isNew) {
        priceLabel.innerText = "Precio Venta Sugerido";
        document.getElementById('pName').required = true;
        document.getElementById('bProd').required = false;
        bPrice.value = "";
      } else {
        priceLabel.innerText = "Nuevo Precio de Venta";
        document.getElementById('pName').required = false;
        document.getElementById('bProd').required = true;
        // Trigger update if a product was already selected
        if(bProd.value) {
           const p = productos.find(x => x.id == bProd.value);
           if(p) bPrice.value = p.precio_venta;
        }
      }
      checkMargin();
    };

    bProd.onchange = (e) => {
      const pid = e.target.value;
      if (pid) {
        const p = productos.find(x => x.id == pid);
        if (p) {
          bPrice.value = p.precio_venta;
          checkMargin();
        }
      }
    };

    bSearch.oninput = (e) => {
      const term = e.target.value.toLowerCase();
      const options = bProd.options;
      for (let i = 1; i < options.length; i++) {
        const txt = options[i].text.toLowerCase();
        options[i].style.display = txt.includes(term) ? 'block' : 'none';
      }
    };

    document.getElementById('buyForm').onsubmit = async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btnDoBuy');
      btn.disabled = true;
      btn.innerHTML = '<div class="loading-spinner"></div>';

      const isNew = isNewCheck.checked;
      const qty = parseFloat(document.getElementById('bQty').value);
      const cost = parseFloat(document.getElementById('bCost').value);
      const price = parseFloat(bPrice.value);

      try {
        let pid;
        if (isNew) {
          const name = document.getElementById('pName').value;
          const unit = document.getElementById('pUnit').value;
          const min = parseInt(document.getElementById('pMin').value) || 5;

          const product = await addData('productos', {
            nombre: name,
            unidad: unit,
            stock: qty,
            precio_compra: cost,
            precio_venta: price,
            stock_minimo: min
          });
          pid = product.id;
        } else {
          pid = parseInt(bProd.value);
          if (!pid) throw new Error("Selecciona un producto");
          const p = productos.find(x => x.id == pid);
          await updateData('productos', pid, {
            stock: Number(p.stock) + qty,
            precio_compra: cost,
            precio_venta: price
          });
        }

        await addData('compras', {
          producto_id: pid,
          cantidad: qty,
          costo_unidad: cost,
          total: qty * cost,
          fecha: new Date().toISOString()
        });

        toast(isNew ? "Producto agregado y stock registrado" : "Stock y precio actualizados con éxito");
        navigate('compras');
      } catch (ex) {
        toast(ex.message, "error");
        btn.disabled = false;
        btn.innerText = '📦 REGISTRAR COMPRA';
      }
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
