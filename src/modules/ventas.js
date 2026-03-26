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
          <div class="product-item" onclick="window.vAdd(${p.id})">
            <div class="product-count" id="badge-${p.id}">0</div>
            <div style="font-weight: 700;">${p.nombre}</div>
            <div style="color: var(--primary);">$${Number(p.precio_venta).toFixed(2)}</div>
            <div style="font-size: 0.7rem; color: var(--text-muted);">DISP: ${p.stock}</div>
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
      const existing = currentSale.find(x => x.id === pid);
      const qty = prompt(`¿Cuánto de ${p.nombre}?`, existing ? existing.quantity : 1);
      const nQty = parseFloat(qty);
      if (!nQty || nQty <= 0) return;
      if (nQty > Number(p.stock)) return toast("Stock insuficiente", "error");

      if (existing) existing.quantity = nQty;
      else currentSale.push({ ...p, quantity: nQty });
      window.vSyncUI();
      toast(`${p.nombre} cargado`);
    };

    window.vShowCart = () => {
      modalOverlay.classList.add('active');
      const content = document.getElementById('modal-content');
      const total = currentSale.reduce((a, b) => a + (Number(b.precio_venta) * b.quantity), 0);
      content.innerHTML = `
        <h2>Carrito</h2>
        <div style="margin-bottom: 2rem; max-height: 300px; overflow-y: auto;">
          ${currentSale.map(i => `<div style="padding: 10px 0; border-bottom: 1px solid var(--border);">
            ${i.quantity} ${i.unidad} ${i.nombre} - <b>$${(i.precio_venta * i.quantity).toFixed(2)}</b>
          </div>`).join('')}
        </div>
        <div style="font-size: 1.5rem; font-weight: 900; margin-bottom: 1rem;">TOTAL: $${total.toFixed(2)}</div>
        <button class="btn btn-primary btn-block" onclick="window.vCheckout()">PAGAR</button>
        <button class="btn btn-ghost btn-block" onclick="closeModal()">CERRAR</button>
      `;
    };

    window.vCheckout = () => {
      const total = currentSale.reduce((a, b) => a + (Number(b.precio_venta) * b.quantity), 0);
      const content = document.getElementById('modal-content');
      content.innerHTML = `
        <h2>Checkout</h2>
        <div class="form-group">
          <label>Método de Pago</label>
          <select id="pMethod">
            <option value="efectivo">Efectivo</option>
            <option value="pago_movil">Pago Móvil</option>
            <option value="fiado">Crédito (Fiado)</option>
          </select>
        </div>
        <div id="clientSelect" style="display:none;">
           <label>Cliente</label>
           <select id="selClientId">${clientes.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('')}</select>
        </div>
        <button class="btn btn-primary btn-block" id="btnFinish">FINALIZAR</button>
        <button class="btn btn-ghost btn-block" onclick="window.vShowCart()">VOLVER</button>
      `;

      const pMethod = document.getElementById('pMethod');
      const cBox = document.getElementById('clientSelect');
      pMethod.onchange = () => cBox.style.display = pMethod.value === 'fiado' ? 'block' : 'none';

      document.getElementById('btnFinish').onclick = async () => {
        const btn = document.getElementById('btnFinish');
        btn.disabled = true;
        try {
          const method = pMethod.value;
          const cid = method === 'fiado' ? document.getElementById('selClientId').value : null;
          await registerSale(total, cid, currentSale, method, editingSaleId);
          toast("Venta exitosa");
          currentSale = []; editingSaleId = null;
          closeModal();
          navigate('ventas');
        } catch (e) { toast(e.message, "error"); btn.disabled = false; }
      };
    };

    window.vSyncUI();
    document.getElementById('vSearch').oninput = (e) => {
       const term = e.target.value.toLowerCase();
       document.querySelectorAll('.product-item').forEach(el => el.style.display = el.innerText.toLowerCase().includes(term) ? 'block' : 'none');
    };
  }
};
