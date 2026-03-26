import { getProducts, registerPurchase, getPurchases } from '../services/dataService.js';
import { showLoading, toast } from '../ui/helpers.js';

export const renderCompras = async (container, action, params) => {
  if (action === 'list') {
    showLoading(container);
    const [productos, compras] = await Promise.all([getProducts(), getPurchases()]);

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
    const productos = await getProducts();

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
      marginAlert.style.display = (price > 0 && price < cost) ? 'block' : 'none';
    };

    bCost.oninput = checkMargin;
    bPrice.oninput = checkMargin;

    isNewCheck.onchange = (e) => {
      const isNew = e.target.checked;
      existingFields.style.display = isNew ? 'none' : 'block';
      newFields.style.display = isNew ? 'block' : 'none';
      
      priceLabel.innerText = isNew ? "Precio Venta Sugerido" : "Nuevo Precio de Venta";
      document.getElementById('pName').required = isNew;
      document.getElementById('bProd').required = !isNew;
      
      if (isNew) {
        bPrice.value = "";
      } else if(bProd.value) {
        const p = productos.find(x => x.id == bProd.value);
        if(p) bPrice.value = p.precio_venta;
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
      Array.from(bProd.options).forEach((opt, i) => {
        if (i === 0) return;
        opt.style.display = opt.text.toLowerCase().includes(term) ? 'block' : 'none';
      });
    };

    document.getElementById('buyForm').onsubmit = async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btnDoBuy');
      btn.disabled = true;
      btn.innerHTML = '<div class="loading-spinner"></div>';

      try {
        const isNew = isNewCheck.checked;
        const qty = parseFloat(document.getElementById('bQty').value);
        const cost = parseFloat(document.getElementById('bCost').value);
        const price = parseFloat(bPrice.value);
        const pid = isNew ? null : parseInt(bProd.value);
        
        const pData = isNew ? {
          name: document.getElementById('pName').value,
          unit: document.getElementById('pUnit').value,
          min: parseInt(document.getElementById('pMin').value)
        } : null;

        await registerPurchase(qty, cost, price, pid, pData);

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
