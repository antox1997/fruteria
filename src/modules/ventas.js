import { getProducts, getClients, getSales, registerSale, deleteSale } from '../services/dataService.js';
import { showLoading, toast, closeModal } from '../ui/helpers.js';
import { fetchData } from '../db.js';

let currentSale = [];
let editingSaleId = null;
let editingMetodoPago = null;

export const renderVentas = async (container, action) => {
  const modalOverlay = document.getElementById('modal-overlay');
  
  if (action === 'list') {
    showLoading(container);
    const [ventas, clientes] = await Promise.all([getSales(), getClients()]);

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
      const metodoIcon = { 'efectivo': '💵', 'pago_movil': '📱', 'fiado': '🛡️' }[v.metodo_pago] || '💵';
      return `
                <tr style="border-bottom: 1px solid var(--border);">
                  <td style="padding:1rem; font-size: 0.85rem;">${new Date(v.fecha).toLocaleDateString()}</td>
                  <td style="font-size: 0.85rem;">${cliente ? cliente.nombre : '<span style="color:var(--text-muted)">Contado</span>'}</td>
                  <td style="font-size: 1.1rem; text-align: center;">${metodoIcon}</td>
                  <td style="font-weight:700; color:var(--primary);">$${Number(v.total).toFixed(2)}</td>
                  <td style="text-align:right; padding-right:1rem; display:flex; justify-content: flex-end; gap:5px;">
                    <button class="btn btn-ghost" onclick="window.vShowDetail(${v.id})" title="Ver detalle">👁️</button>
                    <button class="btn btn-ghost" onclick="window.vEditVenta(${v.id})" title="Editar venta">✏️</button>
                    <button class="btn btn-ghost" onclick="window.vDeleteVenta(${v.id})" title="Eliminar venta">🗑️</button>
                  </td>
                </tr>`;
    }).join('')}
          </tbody>
        </table>
      </div>
    `;

    window.vDeleteVenta = async (id) => {
      if (!confirm(`¿Estás seguro de eliminar la venta #${id}?`)) return;
      try {
        await deleteSale(id);
        toast("Venta eliminada correctamente");
        navigate('ventas');
      } catch (e) { toast("Error: " + e.message, "error"); }
    };

    window.vEditVenta = async (id) => {
      showLoading(container);
      try {
        const [detalles, vList, prods] = await Promise.all([fetchData('detalles_venta'), getSales(), getProducts()]);
        const venta = vList.find(x => x.id === id);
        const items = detalles.filter(d => d.venta_id === id);
        currentSale = items.map(i => {
           const p = prods.find(x => x.id === i.producto_id);
           return { ...p, quantity: Number(i.cantidad) };
        });
        editingSaleId = id;
        editingMetodoPago = venta.metodo_pago;
        navigate('ventas', 'create');
      } catch (e) { toast("Error: " + e.message, "error"); navigate('ventas'); }
    };

    window.vShowDetail = async (id) => {
      showLoading(document.getElementById('modal-content'));
      modalOverlay.classList.add('active');
      const [detalles, prods, vList, clis] = await Promise.all([fetchData('detalles_venta'), getProducts(), getSales(), getClients()]);
      const items = detalles.filter(d => d.venta_id === id);
      const venta = vList.find(v => v.id === id);
      const cliente = clis.find(c => c.id === venta.cliente_id);

      const content = document.getElementById('modal-content');
      content.innerHTML = `
        <h2>Detalle de Venta #${id.toString().slice(-4)}</h2>
        <div style="margin-bottom: 2rem;">
          ${items.map(i => {
            const p = prods.find(x => x.id === i.producto_id);
            return `<div style="display:flex; justify-content:space-between; padding: 8px 0; border-bottom: 1px solid var(--border);">
              <span>${i.cantidad} ${p?.unidad || ''} ${p?.nombre || 'Prod'}</span>
              <span style="font-weight:700;">$${(Number(i.precio_unitario) * i.cantidad).toFixed(2)}</span>
            </div>`;
          }).join('')}
          <div style="font-size: 1.4rem; font-weight: 900; color: var(--primary); margin-top:1rem; text-align:right;">
            TOTAL: $${Number(venta.total).toFixed(2)}
          </div>
        </div>
        <button class="btn btn-primary btn-block" onclick="closeModal()">CERRAR</button>
      `;
    };

  } else {
    // action === 'create'
    showLoading(container);
    const [productos, clientes] = await Promise.all([getProducts(), getClients()]);

    container.innerHTML = `
      <div id="vHeader"></div>
      <div class="form-group" style="position: sticky; top: 0; background: var(--bg-app); z-index: 10; padding: 10px 0;">
        <input type="text" id="vSearch" placeholder="🔍 Buscar producto...">
      </div>
      <div class="quick-sale-grid" id="productGrid">
        ${productos.filter(p => Number(p.stock) > 0).map(p => `
          <div class="product-item animate-fade-in" onclick="window.vAdd(${p.id})">
            <div class="product-count" id="badge-${p.id}">0</div>
            <div style="font-weight: 800; font-size: 1.1rem;">${p.nombre}</div>
            <div style="color: var(--primary); font-weight: 900;">$${Number(p.precio_venta).toFixed(2)}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">STOCK: <b>${p.stock}</b> ${p.unidad}</div>
          </div>`).join('')}
      </div>
      <button id="vCartBtn" class="floating-cart-btn" onclick="window.vShowCart()">
        <span class="cart-icon">🛒</span>
        <span id="vBadge" class="cart-badge">0</span>
      </button>
    `;

    window.vSyncUI = () => {
      const badge = document.getElementById('vBadge');
      if(badge) {
        badge.innerText = currentSale.length;
        badge.style.display = currentSale.length > 0 ? 'flex' : 'none';
        badge.animate([{ transform: 'scale(1.2)' }, { transform: 'scale(1)' }], { duration: 200 });
      }
      document.querySelectorAll('.product-count').forEach(b => {
        const pid = parseInt(b.id.split('-')[1]);
        const item = currentSale.find(x => x.id === pid);
        if (item) { b.innerText = item.quantity; b.classList.add('visible'); }
        else { b.classList.remove('visible'); }
      });
    };

    window.vAdd = (pid) => {
      const p = productos.find(x => x.id === pid);
      if (!p) return;
      const existing = currentSale.find(x => x.id === pid);
      
      modalOverlay.classList.add('active');
      const content = document.getElementById('modal-content');
      content.innerHTML = `
        <h2 style="margin-bottom:1rem;">🛒 Agregar ${p.nombre}</h2>
        <p style="color:var(--text-muted); margin-bottom:1.5rem;">Stock disponible: <b>${p.stock} ${p.unidad}</b></p>
        
        <div class="form-group">
          <label>¿Qué cantidad deseas llevar?</label>
          <input type="number" id="vQtyInput" value="${existing ? existing.quantity : 1}" step="0.01" min="0.01" max="${p.stock}" autofocus style="font-size:1.5rem; text-align:center; padding:1rem; border-radius:1rem;">
        </div>
        
        <div style="display:grid; gap:10px; margin-top:2rem;">
          <button class="btn btn-primary" id="btnConfirmAdd" style="padding:1.2rem; font-size:1.1rem;">AGREGAR AL CARRITO ✅</button>
          <button class="btn btn-ghost" onclick="closeModal()">CANCELAR</button>
        </div>
      `;
      
      document.getElementById('btnConfirmAdd').onclick = () => {
        const nQty = parseFloat(document.getElementById('vQtyInput').value);
        if (isNaN(nQty) || nQty <= 0) return toast("Cantidad inválida", "error");
        if (nQty > Number(p.stock)) return toast("Stock insuficiente", "error");
        
        if (existing) existing.quantity = nQty;
        else currentSale.push({ ...p, quantity: nQty });
        
        window.vSyncUI();
        closeModal();
        toast(`${p.nombre} cargado`);
      };
    };

    window.vEditQty = (pid) => {
      const item = currentSale.find(x => x.id === pid);
      if (!item) return;
      window.vAdd(pid); // Re-use the add modal logic for editing
    };

    window.vRemoveItem = (pid) => {
      currentSale = currentSale.filter(x => x.id !== pid);
      window.vSyncUI();
      window.vShowCart();
    };

    window.vEmptyCart = () => {
      if(confirm('¿Seguro quieres ANULAR la venta y vaciar el carrito?')) {
        currentSale = [];
        window.vSyncUI();
        closeModal();
        toast("Venta anulada");
      }
    };

    window.vShowCart = () => {
      if (currentSale.length === 0) return closeModal();
      
      modalOverlay.classList.add('active');
      const content = document.getElementById('modal-content');
      const total = currentSale.reduce((a, b) => a + (Number(b.precio_venta) * b.quantity), 0);
      
      content.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
          <h2 style="margin:0;">🛒 Tu Carrito</h2>
          <button class="btn btn-ghost" onclick="closeModal()">✕</button>
        </div>

        <div style="margin-bottom: 2rem; max-height: 400px; overflow-y: auto;">
          ${currentSale.map(i => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:15px; background:var(--bg-app); border-radius:1rem; margin-bottom:10px;">
              <div style="flex:1;">
                 <div style="font-weight:800; font-size:1.1rem; color:var(--text-main);">${i.nombre}</div>
                 <div style="font-size:0.85rem; color:var(--text-muted); font-weight:600;">
                   ${i.quantity} ${i.unidad} x $${Number(i.precio_venta).toFixed(2)}
                 </div>
              </div>
              
              <div style="font-weight:900; color:var(--primary-dark); font-size:1.2rem; margin:0 15px;">
                $${(i.precio_venta * i.quantity).toFixed(2)}
              </div>
              
              <div style="display:flex; gap:8px;">
                <button class="btn btn-secondary" style="padding:8px; border-radius:10px;" onclick="window.vEditQty(${i.id})" title="Editar cantidad">✏️</button>
                <button class="btn btn-secondary" style="padding:8px; border-radius:10px; color:var(--danger);" onclick="window.vRemoveItem(${i.id})" title="Borrar">🗑️</button>
              </div>
            </div>
          `).join('')}
        </div>
        
        <div style="background:var(--primary-light); padding:1.5rem; border-radius:1.5rem; margin-bottom:1.5rem; display:flex; justify-content:space-between; align-items:center;">
          <span style="font-weight:800; color:var(--primary-dark);">TOTAL</span>
          <span style="font-size:2.2rem; font-weight:900; color:var(--primary-dark);">$${total.toFixed(2)}</span>
        </div>

        <div style="display:grid; gap:10px;">
          <button class="btn btn-primary btn-block" style="padding:1.3rem; font-size:1.2rem; border-radius:1rem; box-shadow:0 8px 16px rgba(16,185,129,0.3);" onclick="window.vCheckout()">PAGAR VENTA 💸</button>
          
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
            <button class="btn btn-danger" style="padding:1rem; border-radius:1rem;" onclick="window.vEmptyCart()">🚫 ANULAR</button>
            <button class="btn btn-secondary" style="padding:1rem; border-radius:1rem;" onclick="closeModal()">＋ AGREGAR MÁS</button>
          </div>
        </div>
      `;
    };

    window.vCheckout = () => {
      const total = currentSale.reduce((a, b) => a + (Number(b.precio_venta) * b.quantity), 0);
      const content = document.getElementById('modal-content');
      
      content.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
          <h2 style="margin:0;">Finalizar Cobro</h2>
          <button class="btn btn-ghost" onclick="window.vShowCart()">← Volver al Carrito</button>
        </div>

        <div class="card" style="margin-bottom:2rem; background:linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); padding:2rem; border-radius:2rem; text-align:center;">
           <div style="font-size:0.9rem; color:var(--text-muted); font-weight:800; text-transform:uppercase;">Monto a cobrar</div>
           <div style="font-size:3rem; font-weight:900; color:var(--primary);">$${total.toFixed(2)}</div>
        </div>

        <div class="form-group" style="margin-bottom:2rem;">
          <label style="font-weight:800; color:var(--text-main);">MÉTODO DE PAGO</label>
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-top:10px;">
            <button class="btn btn-secondary method-btn" id="btnCash" style="flex-direction:column; padding:20px; border-radius:1.5rem; transition:all 0.3s; border:3px solid transparent;">
               <span style="font-size:2rem;">💵</span>
               <span style="font-size:0.75rem; font-weight:900;">EFECTIVO</span>
            </button>
            <button class="btn btn-secondary method-btn" id="btnMobile" style="flex-direction:column; padding:20px; border-radius:1.5rem; transition:all 0.3s; border:3px solid transparent;">
               <span style="font-size:2rem;">📱</span>
               <span style="font-size:0.75rem; font-weight:900;">MÓVIL</span>
            </button>
            <button class="btn btn-secondary method-btn" id="btnFiado" style="flex-direction:column; padding:20px; border-radius:1.5rem; transition:all 0.3s; border:3px solid transparent;">
               <span style="font-size:2rem;">🛡️</span>
               <span style="font-size:0.75rem; font-weight:900;">FIADO</span>
            </button>
          </div>
        </div>

        <div id="clientSelectContainer" style="display:none; padding:1.5rem; background:#f0f9ff; border-radius:1.5rem; border:1px solid #bae6fd; margin-bottom:2rem;" class="animate-fade-in">
           <div class="form-group" style="margin:0;">
             <label style="color:#0369a1; font-weight:800;">BUSCAR CLIENTE</label>
             <input type="text" id="cSearch" placeholder="Nombre..." style="margin:10px 0; border-radius:1rem;">
             <select id="selClientId" style="padding:15px; border-radius:1rem; font-weight:600;">
               <option value="">-- Seleccionar --</option>
               ${clientes.map(c => `<option value="${c.id}">${c.nombre} (Saldo: $${Number(c.saldo_deuda).toFixed(2)})</option>`).join('')}
             </select>
           </div>
        </div>

        <div style="display:grid; gap:10px; margin-top:2rem;">
          <button class="btn btn-primary btn-block" style="padding:1.4rem; font-size:1.2rem; border-radius:1.2rem;" id="btnFinish">CONFIRMAR PAGO ✅</button>
          <button class="btn btn-ghost btn-block" onclick="closeModal()">CANCELAR</button>
        </div>
      `;

      let selectedMethod = 'efectivo';
      const btns = { 'efectivo': 'btnCash', 'pago_movil': 'btnMobile', 'fiado': 'btnFiado' };
      const cBox = document.getElementById('clientSelectContainer');

      const updateMethods = (method) => {
        selectedMethod = method;
        Object.values(btns).forEach(id => {
          const el = document.getElementById(id);
          el.style.borderColor = 'transparent';
          el.style.background = 'white';
        });
        const activeEl = document.getElementById(btns[method]);
        activeEl.style.borderColor = 'var(--primary)';
        activeEl.style.background = '#ecfdf5';
        cBox.style.display = method === 'fiado' ? 'block' : 'none';
      };

      updateMethods('efectivo');

      document.getElementById('btnCash').onclick = () => updateMethods('efectivo');
      document.getElementById('btnMobile').onclick = () => updateMethods('pago_movil');
      document.getElementById('btnFiado').onclick = () => updateMethods('fiado');

      document.getElementById('cSearch').oninput = (e) => {
        const t = e.target.value.toLowerCase();
        Array.from(document.getElementById('selClientId').options).forEach((opt, i) => {
          if(i===0) return;
          opt.style.display = opt.text.toLowerCase().includes(t) ? 'block' : 'none';
        });
      };

      document.getElementById('btnFinish').onclick = async () => {
        const btn = document.getElementById('btnFinish');
        const cid = selectedMethod === 'fiado' ? document.getElementById('selClientId').value : null;

        if (selectedMethod === 'fiado' && !cid) return toast("Debes seleccionar un cliente", "error");

        btn.disabled = true;
        btn.innerHTML = '<div class="loading-spinner"></div>';

        try {
          await registerSale(total, cid, currentSale, selectedMethod, editingSaleId);
          toast("Venta procesada con éxito");
          currentSale = []; editingSaleId = null;
          closeModal();
          navigate('ventas');
        } catch (e) { toast(e.message, "error"); btn.disabled = false; btn.innerText = 'CONFIRMAR PAGO ✅'; }
      };
    };

    window.vSyncUI();
    document.getElementById('vSearch').oninput = (e) => {
       const term = e.target.value.toLowerCase();
       document.querySelectorAll('.product-item').forEach(el => el.style.display = el.innerText.toLowerCase().includes(term) ? 'block' : 'none');
    };
  }
};
