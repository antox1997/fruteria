/**
 * UI HELPERS: Transitions, Loaders, Toasts
 */

export const toast = (message, type = 'success') => {
  const t = document.createElement('div');
  t.className = `toast ${type} animate-fade-in`;
  t.innerText = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
};

export const showLoading = (container) => {
  container.innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:300px; gap:1rem;">
      <div class="loading-spinner" style="border-top-color: var(--primary);"></div>
      <span style="color:var(--text-muted); font-size:0.9rem;">Sincronizando...</span>
    </div>
  `;
};

export const closeModal = () => {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.remove('active');
};
