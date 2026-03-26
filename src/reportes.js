import { fetchData } from './db.js';
import { supabase } from './supabase.js';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// ──────────────────────────────────────────────
// Helpers de formato
// ──────────────────────────────────────────────

const formatDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
};

const formatCurrency = (n) => `$${Number(n || 0).toFixed(2)}`;

const quickRange = (type) => {
  const now = new Date();
  if (type === '24h') return [new Date(now.getTime() - 24 * 60 * 60 * 1000), now];
  if (type === '7d') return [new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), now];
  if (type === '30d') return [new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), now];
  return [null, null];
};

const toInputDate = (d) => {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** Etiqueta legible para el módulo */
const moduleLabel = (mod) => ({ ventas: 'Ventas', inventario: 'Inventario', compras: 'Compras' }[mod] || mod);

// ──────────────────────────────────────────────
// Estructura de datos normalizada por módulo
// Retorna { columns: string[], rows: string[][], title: string, summary: string }
// ──────────────────────────────────────────────

const buildVentasData = (items, clientes) => {
  const total = items.reduce((a, b) => a + Number(b.total), 0);
  const rows = items.map(v => {
    const cliente = clientes.find(c => c.id === v.cliente_id);
    const metodo = {
      'efectivo': '💵 Ef.',
      'pago_movil': '📱 PM',
      'fiado': '🛡️ Crédito'
    }[v.metodo_pago] || '💵 Ef.';

    return [formatDate(v.fecha), cliente ? cliente.nombre : 'Contado', metodo, formatCurrency(v.total)];
  });
  return {
    title: 'Reporte de Ventas',
    columns: ['Fecha', 'Cliente', 'Método', 'Total'],
    rows,
    summary: `${items.length} venta(s) | Total: ${formatCurrency(total)}`,
    totalsRow: ['', '', 'TOTAL', formatCurrency(total)],
  };
};

const buildInventarioData = (items) => {
  const rows = items.map(p => [p.nombre, p.unidad, String(p.stock), formatCurrency(p.precio_venta), formatCurrency(p.precio_compra)]);
  return {
    title: 'Reporte de Inventario',
    columns: ['Producto', 'Unidad', 'Stock', 'P. Venta', 'P. Costo'],
    rows,
    summary: `${items.length} producto(s)`,
    totalsRow: null,
  };
};

const buildComprasData = (items, productos) => {
  const total = items.reduce((a, b) => a + Number(b.total), 0);
  const rows = items.map(c => {
    const p = productos.find(x => x.id === c.producto_id);
    return [formatDate(c.fecha), p ? p.nombre : 'Eliminado', `${c.cantidad} ${p?.unidad || ''}`, formatCurrency(c.total)];
  });
  return {
    title: 'Reporte de Compras',
    columns: ['Fecha', 'Producto', 'Cantidad', 'Total'],
    rows,
    summary: `${items.length} compra(s) | Invertido: ${formatCurrency(total)}`,
    totalsRow: ['', '', 'TOTAL', formatCurrency(total)],
  };
};

// ──────────────────────────────────────────────
// Builders de tabla HTML (para la vista previa en modal)
// ──────────────────────────────────────────────

const buildHTMLTable = (data) => {
  if (!data.rows.length) return '<p class="report-empty">📭 No hay datos en el rango seleccionado.</p>';

  const headerCells = data.columns.map(c => `<th>${c}</th>`).join('');
  const bodyRows = data.rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('');
  const totalsHTML = data.totalsRow
    ? `<tfoot><tr style="font-weight:800; background:var(--primary-light);">${data.totalsRow.map(c => `<td>${c}</td>`).join('')}</tr></tfoot>`
    : '';

  return `
    <div class="report-table-wrapper">
      <table class="report-table">
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
        ${totalsHTML}
      </table>
    </div>
    <div class="report-summary">
      <span>${data.summary}</span>
    </div>`;
};

// ──────────────────────────────────────────────
// Limpieza de texto para jsPDF
// jsPDF con Helvetica solo soporta Latin-1.
// Los emojis (🍎, →, 📭) y símbolos Unicode se corrompen.
// ──────────────────────────────────────────────

/**
 * Elimina emojis y caracteres fuera del rango Latin-1 (0x00-0xFF).
 * Convierte caracteres especiales comunes a equivalentes ASCII seguros.
 */
const sanitizePDF = (str) => {
  if (!str) return '';
  return String(str)
    // Reemplazos explícitos de símbolos comunes usados en el reporte
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    // Elimina cualquier carácter fuera del rango imprimible Latin-1 (emojis, etc.)
    // \u00A0-\u00FF son caracteres Latin-1 extendidos válidos (acentos, ñ, etc.)
    .replace(/[^\x00-\xFF]/g, '')
    .trim();
};

/** Sanitiza todas las celdas de una fila */
const sanitizeRow = (row) => row.map(cell => sanitizePDF(cell));

// ──────────────────────────────────────────────
// Exportar a PDF
// ──────────────────────────────────────────────

const exportToPDF = (data, modulo, dateStart, dateEnd) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Cabecera verde
  doc.setFillColor(16, 185, 129);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Fruteria Los Amigos', 14, 11); // Sin emoji: jsPDF/Helvetica no soporta UTF-16
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(sanitizePDF(data.title), 14, 19);

  // Período
  doc.setTextColor(80, 80, 80);
  doc.setFontSize(9);
  const periodo = modulo === 'inventario'
    ? 'Inventario actual (snapshot)'
    : `Periodo: ${toInputDate(dateStart)} al ${toInputDate(dateEnd)}`; // Sin →
  doc.text(periodo, 14, 34);
  doc.text(`Generado: ${new Date().toLocaleString('es-VE')}`, 14, 39);

  // Sanitizar encabezados, filas y totales antes de pasarlos a autoTable
  const cleanColumns = data.columns.map(sanitizePDF);
  const cleanRows = data.rows.map(sanitizeRow);
  const cleanTotals = data.totalsRow ? sanitizeRow(data.totalsRow) : null;

  // Tabla principal
  autoTable(doc, {
    startY: 44,
    head: [cleanColumns],
    body: cleanRows,
    foot: cleanTotals ? [cleanTotals] : [],
    headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    footStyles: { fillColor: [236, 253, 245], textColor: [16, 185, 129], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    styles: { fontSize: 9, cellPadding: 3 },
    margin: { left: 14, right: 14 },
  });

  // Pie de página
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Frutería SaaS | Página ${i} de ${pageCount}`, 14, 290);
  }

  const fileName = `reporte_${modulo}_${toInputDate(new Date())}.pdf`;
  doc.save(fileName);
};

// ──────────────────────────────────────────────
// Exportar a Excel
// ──────────────────────────────────────────────

const exportToExcel = (data, modulo, dateStart, dateEnd) => {
  const wb = XLSX.utils.book_new();

  // Filas de metadatos
  const meta = [
    ['Frutería Los Amigos', '', '', ''],
    [data.title, '', '', ''],
    [
      modulo === 'inventario'
        ? 'Snapshot actual del inventario'
        : `Período: ${toInputDate(dateStart)} → ${toInputDate(dateEnd)}`,
      '', '', ''
    ],
    [`Generado: ${new Date().toLocaleString('es-VE')}`, '', '', ''],
    [], // fila vacía de separación
    data.columns,
    ...data.rows,
  ];
  if (data.totalsRow) meta.push(data.totalsRow);

  const ws = XLSX.utils.aoa_to_sheet(meta);

  // Anchos de columna automáticos (estimado)
  const colWidths = data.columns.map((_, ci) => {
    const maxLen = Math.max(
      data.columns[ci].length,
      ...data.rows.map(r => String(r[ci] || '').length),
    );
    return { wch: Math.min(maxLen + 4, 40) };
  });
  ws['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, moduleLabel(modulo));

  const fileName = `reporte_${modulo}_${toInputDate(new Date())}.xlsx`;
  XLSX.writeFile(wb, fileName);
};

// ──────────────────────────────────────────────
// Fetch + filter + normalizar datos
// ──────────────────────────────────────────────

/**
 * Carga y filtra los datos. Devuelve el objeto data normalizado + actualiza el DOM.
 * @param {string} modulo - 'ventas' | 'inventario' | 'compras'
 * @param {Date} dateStart
 * @param {Date} dateEnd
 * @param {HTMLElement} resultsEl - referencia directa al contenedor de resultados
 * @returns {Promise<object|null>} datos normalizados o null si hubo error
 */
const fetchAndRenderReport = async (modulo, dateStart, dateEnd, resultsEl) => {
  if (!resultsEl) return null;

  // Spinner de carga
  resultsEl.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:2rem 0;">
      <div class="loading-spinner" style="border-color:rgba(16,185,129,.2);border-top-color:var(--primary);"></div>
      <span style="color:var(--text-muted);font-size:.9rem;">Cargando datos...</span>
    </div>`;

  // Guard de sesión
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session) {
    resultsEl.innerHTML = `
      <div style="padding:1rem;background:#fef2f2;border-left:4px solid var(--danger);border-radius:var(--radius-sm);">
        <strong style="color:var(--danger);">⚠️ Sesión expirada</strong>
        <p style="font-size:.85rem;margin-top:5px;color:var(--text-muted);">Recarga la página e inicia sesión de nuevo.</p>
      </div>`;
    return null;
  }

  try {
    let reportData = null;

    if (modulo === 'ventas') {
      const [ventas, clientes] = await Promise.all([fetchData('ventas'), fetchData('clientes')]);
      const filtered = ventas
        .filter(v => v.fecha && new Date(v.fecha) >= dateStart && new Date(v.fecha) <= dateEnd)
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
      reportData = buildVentasData(filtered, clientes);

    } else if (modulo === 'inventario') {
      const productos = await fetchData('productos');
      reportData = buildInventarioData(productos);

    } else if (modulo === 'compras') {
      const [compras, productos] = await Promise.all([fetchData('compras'), fetchData('productos')]);
      const filtered = compras
        .filter(c => c.fecha && new Date(c.fecha) >= dateStart && new Date(c.fecha) <= dateEnd)
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
      reportData = buildComprasData(filtered, productos);
    }

    const html = buildHTMLTable(reportData);
    resultsEl.innerHTML = html;
    return reportData;

  } catch (err) {
    console.error('[Reporte] Error:', err);
    resultsEl.innerHTML = `
      <div style="padding:1rem;background:#fef2f2;border-left:4px solid var(--danger);border-radius:var(--radius-sm);">
        <strong style="color:var(--danger);">⚠️ Error al cargar el reporte</strong>
        <p style="font-size:.85rem;margin-top:5px;color:var(--text-muted);">${err.message}</p>
      </div>`;
    return null;
  }
};

// ──────────────────────────────────────────────
// Público: openReportModal
// ──────────────────────────────────────────────

export const openReportModal = () => {
  const overlay = document.getElementById('report-modal-overlay');
  if (!overlay) {
    console.error('[Reporte] No se encontró #report-modal-overlay en el DOM');
    return;
  }

  // Estado local del modal
  let selectedModule = 'ventas';
  let [dateStart, dateEnd] = quickRange('7d');
  let isCustom = false;
  let lastReportData = null; // Caché del último reporte cargado

  // ── Renderizar HTML del modal ──
  const content = document.getElementById('report-modal-content');
  content.innerHTML = `
    <div class="report-modal-header">
      <h2 style="margin:0;font-size:1.3rem;">📊 Generar Reporte</h2>
      <button id="btn-close-report" class="btn btn-ghost" style="padding:6px 10px;font-size:1.2rem;" aria-label="Cerrar">✕</button>
    </div>

    <!-- MÓDULO -->
    <div class="report-section">
      <label class="report-label">Módulo</label>
      <div class="report-chip-group">
        <button class="report-chip active" data-module="ventas">🛒 Ventas</button>
        <button class="report-chip" data-module="inventario">📦 Inventario</button>
        <button class="report-chip" data-module="compras">🚚 Compras</button>
      </div>
    </div>

    <!-- RANGO DE FECHA -->
    <div class="report-section" id="report-date-section">
      <label class="report-label">Rango de Fecha</label>
      <div class="report-quick-btns">
        <button class="report-quick-btn" data-range="24h">Últimas 24h</button>
        <button class="report-quick-btn active" data-range="7d">1 Semana</button>
        <button class="report-quick-btn" data-range="30d">1 Mes</button>
        <button class="report-quick-btn" data-range="custom">📅 Personalizado</button>
      </div>
      <div id="report-custom-dates" style="display:none;margin-top:1rem;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="form-group" style="margin-bottom:0;">
            <label style="font-size:.75rem;color:var(--text-muted);">Desde</label>
            <input type="date" id="report-date-from" value="${toInputDate(dateStart)}">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label style="font-size:.75rem;color:var(--text-muted);">Hasta</label>
            <input type="date" id="report-date-to" value="${toInputDate(dateEnd)}">
          </div>
        </div>
      </div>
    </div>

    <!-- BOTÓN VER REPORTE -->
    <button class="btn btn-primary btn-block" id="btn-generate-report" style="margin-bottom:0.75rem;">
      🔍 Ver Reporte
    </button>

    <!-- BOTONES DE EXPORTACIÓN (ocultos hasta que haya datos) -->
    <div id="report-export-bar" style="display:none; margin-bottom:1.25rem;">
      <p style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:0.5rem;">Descargar como</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <button class="btn" id="btn-export-pdf" style="background:#ef4444;color:white;gap:6px;font-size:.9rem;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7h3v1.5zM9 9.5h1v-1H9v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm10 5.5h1v-3h-1v3z"/></svg>
          Descargar PDF
        </button>
        <button class="btn" id="btn-export-excel" style="background:#16a34a;color:white;gap:6px;font-size:.9rem;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
          Descargar Excel
        </button>
      </div>
    </div>

    <!-- RESULTADOS -->
    <div id="report-results"></div>
  `;

  // ── Referencias directas al DOM ──
  const resultsEl = content.querySelector('#report-results');
  const dateSection = content.querySelector('#report-date-section');
  const customDatesEl = content.querySelector('#report-custom-dates');
  const dateFromInput = content.querySelector('#report-date-from');
  const dateToInput = content.querySelector('#report-date-to');
  const generateBtn = content.querySelector('#btn-generate-report');
  const closeBtn = content.querySelector('#btn-close-report');
  const exportBar = content.querySelector('#report-export-bar');
  const btnPDF = content.querySelector('#btn-export-pdf');
  const btnExcel = content.querySelector('#btn-export-excel');

  overlay.classList.add('active');

  // ── Cerrar modal ──
  closeBtn.addEventListener('click', () => overlay.classList.remove('active'));

  // ── Chips de módulo ──
  content.querySelectorAll('.report-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      content.querySelectorAll('.report-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      selectedModule = chip.dataset.module;
      // Inventario no necesita filtro de fecha
      dateSection.style.display = selectedModule === 'inventario' ? 'none' : 'block';
      // Ocultar barra de exportación hasta nuevo reporte
      exportBar.style.display = 'none';
      lastReportData = null;
    });
  });

  // ── Botones rápidos de fecha ──
  content.querySelectorAll('.report-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      content.querySelectorAll('.report-quick-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (btn.dataset.range === 'custom') {
        isCustom = true;
        customDatesEl.style.display = 'block';
      } else {
        isCustom = false;
        customDatesEl.style.display = 'none';
        [dateStart, dateEnd] = quickRange(btn.dataset.range);
      }
    });
  });

  // ── Botón "Ver Reporte" ──
  generateBtn.addEventListener('click', async () => {
    if (isCustom) {
      const fromVal = dateFromInput?.value;
      const toVal = dateToInput?.value;
      if (!fromVal || !toVal) {
        resultsEl.innerHTML = '<p style="color:var(--danger);padding:0.5rem 0;">⚠️ Selecciona un rango de fechas válido.</p>';
        return;
      }
      dateStart = new Date(fromVal + 'T00:00:00');
      dateEnd = new Date(toVal + 'T23:59:59');
    }

    // Deshabilitar botón mientras carga
    generateBtn.disabled = true;
    generateBtn.innerHTML = '<div class="loading-spinner" style="width:18px;height:18px;border-width:2px;margin:0 auto;"></div>';

    exportBar.style.display = 'none';
    lastReportData = await fetchAndRenderReport(selectedModule, dateStart, dateEnd, resultsEl);

    // Restaurar botón
    generateBtn.disabled = false;
    generateBtn.innerHTML = '🔍 Ver Reporte';

    // Mostrar barra de exportación sólo si hay datos
    if (lastReportData && lastReportData.rows.length > 0) {
      exportBar.style.display = 'block';
      exportBar.classList.add('animate-fade-in');
    }
  });

  // ── Exportar PDF ──
  btnPDF.addEventListener('click', () => {
    if (!lastReportData) return;
    try {
      exportToPDF(lastReportData, selectedModule, dateStart, dateEnd);
    } catch (e) {
      alert('Error al generar PDF: ' + e.message);
    }
  });

  // ── Exportar Excel ──
  btnExcel.addEventListener('click', () => {
    if (!lastReportData) return;
    try {
      exportToExcel(lastReportData, selectedModule, dateStart, dateEnd);
    } catch (e) {
      alert('Error al generar Excel: ' + e.message);
    }
  });
};
