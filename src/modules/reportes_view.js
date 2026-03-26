import { getSales, getPurchases } from '../services/dataService.js';
import { showLoading } from '../ui/helpers.js';

export const renderReportes = async (container) => {
  showLoading(container);
  const [ventas, compras] = await Promise.all([getSales(), getPurchases()]);

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
