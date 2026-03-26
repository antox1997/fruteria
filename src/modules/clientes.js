import { getClients, saveClient, registerPayment } from '../services/dataService.js';
import { showLoading, toast, closeModal } from '../ui/helpers.js';

export const renderClientes = async (container, action, params) => {
  if (action === 'list') {
    showLoading(container);
    const clientes = await getClients();

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
      const c = clientes.find(x => x.id == id);
      const modalOverlay = document.getElementById('modal-overlay');
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
          await registerPayment(id, val);
          toast("Pago registrado con éxito");
          closeModal();
          navigate('clientes');
        } catch (e) { toast("Error: " + e.message, "error"); btn.disabled = false; }
      };
    };

  } else {
    // FORM: CREATE or EDIT
    const isEdit = action === 'edit';
    let data = { nombre: '', telefono: '' };
    if (isEdit) {
      const clis = await getClients();
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
        await saveClient(isEdit ? params.id : null, payload);
        toast("Cliente guardado");
        navigate('clientes');
      } catch (ex) { toast(ex.message, "error"); }
    };
  }
};
