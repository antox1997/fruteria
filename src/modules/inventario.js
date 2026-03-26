import { getProducts, saveProduct, removeProduct } from '../services/dataService.js';
import { showLoading, toast } from '../ui/helpers.js';

export const renderInventario = async (container, action, params) => {
  if (action === 'list') {
    showLoading(container);
    const productos = await getProducts();
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
        removeProduct(id).then(() => {
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
      const prods = await getProducts();
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
        await saveProduct(isEdit ? params.id : null, payload);
        toast("Inventario actualizado");
        navigate('productos');
      } catch (e) { toast("Error: " + e.message, "error"); btn.disabled = false; }
    };
  }
};
