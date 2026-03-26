import { getProducts, getSales, getClients } from '../services/dataService.js';
import { showLoading } from '../ui/helpers.js';
import { supabase } from '../supabase.js';
import { openReportModal } from '../reportes.js';

export const renderDashboard = async (container) => {
  showLoading(container);
  const [productos, ventas, clientes] = await Promise.all([
    getProducts(),
    getSales(),
    getClients()
  ]);

  const todayStr = new Date().toISOString().split('T')[0];
  const totalSalesToday = ventas.filter(v => v.fecha?.startsWith(todayStr)).reduce((a, b) => a + Number(b.total), 0);
  const totalDebts = clientes.reduce((a, b) => a + (Number(b.saldo_deuda) || 0), 0);
  const lowStock = productos.filter(p => Number(p.stock) <= Number(p.stock_minimo || 5));

  container.innerHTML = `
    <div class="card" style="background: var(--primary); color: white; border: none; padding: 2rem;">
      <h2 style="margin: 0;">🍎 Frutería SaaS</h2>
      <p style="opacity: 0.9; margin-top: 5px;">Tu negocio, bajo control y en la nube.</p>
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
