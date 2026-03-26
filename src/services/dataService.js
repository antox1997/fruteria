import { fetchData, addData, updateData, deleteData } from '../db.js';

/**
 * SERVICE: Business Logic Layer
 * All double/triple DB updates should happen here instead of the UI modules.
 */

// --- PRODUCT SERVICES ---
export const getProducts = () => fetchData('productos');

export const saveProduct = async (id, data) => {
  if (id) return updateData('productos', id, data);
  return addData('productos', data);
};

export const removeProduct = (id) => deleteData('productos', id);

// --- SALE SERVICES ---
export const getSales = () => fetchData('ventas');

export const registerSale = async (total, clientId, items, method, saleId = null) => {
  let finalSaleId = saleId;

  // 1. If editing, revert old stock/debt first
  if (saleId) {
    const [oldVenta, oldDetalles, pList] = await Promise.all([
      fetchData('ventas').then(vv => vv.find(x => x.id === saleId)),
      fetchData('detalles_venta'), // Optimizable: query only by saleId if db.js supports filter
      fetchData('productos')
    ]);

    const oldItems = oldDetalles.filter(d => d.venta_id === saleId);

    // Revert stock
    for (const item of oldItems) {
      const p = pList.find(x => x.id === item.producto_id);
      if (p) await updateData('productos', p.id, { stock: Number(p.stock) + Number(item.cantidad) });
    }

    // Revert debt
    if (oldVenta.cliente_id) {
       const [c] = await Promise.all([
         fetchData('clientes').then(clis => clis.find(x => x.id == oldVenta.cliente_id))
       ]);
       if (c) await updateData('clientes', c.id, { saldo_deuda: Number(c.saldo_deuda) - Number(oldVenta.total) });
    }

    // Clean details
    for (const item of oldItems) await deleteData('detalles_venta', item.id);

    // Update Venta main record
    await updateData('ventas', saleId, { total, cliente_id: clientId, metodo_pago: method });
  } else {
    // 2. New sale record
    const sale = await addData('ventas', { total, cliente_id: clientId, metodo_pago: method });
    finalSaleId = sale.id;
  }

  // 3. Complete new sale logic (Stock decrease + Details)
  const currentProds = await fetchData('productos');
  for (const item of items) {
    await addData('detalles_venta', {
      venta_id: finalSaleId,
      producto_id: item.id,
      cantidad: item.quantity,
      precio_unitario: item.precio_venta
    });

    const pActual = currentProds.find(x => x.id === item.id);
    if (pActual) {
      await updateData('productos', item.id, { stock: Number(pActual.stock) - item.quantity });
    }
  }

  // 4. Update new client debt
  if (clientId && method === 'fiado') {
    const currentC = await fetchData('clientes').then(cc => cc.find(x => x.id == clientId));
    if (currentC) {
      await updateData('clientes', clientId, { saldo_deuda: Number(currentC.saldo_deuda) + total });
    }
  }

  return finalSaleId;
};

export const deleteSale = async (id) => {
  const [detalles, venta, productos, clientes] = await Promise.all([
    fetchData('detalles_venta'),
    fetchData('ventas').then(vv => vv.find(x => x.id === id)),
    fetchData('productos'),
    fetchData('clientes')
  ]);

  const items = detalles.filter(d => d.venta_id === id);

  // Revert stock
  for (const item of items) {
    const p = productos.find(x => x.id === item.producto_id);
    if (p) await updateData('productos', p.id, { stock: Number(p.stock) + Number(item.cantidad) });
  }

  // Revert debt
  if (venta.cliente_id) {
    const c = clientes.find(x => x.id == venta.cliente_id);
    if (c) await updateData('clientes', c.id, { saldo_deuda: Number(c.saldo_deuda) - Number(venta.total) });
  }

  // Delete
  for (const item of items) await deleteData('detalles_venta', item.id);
  return deleteData('ventas', id);
};

// --- PURCHASE SERVICES ---
export const getPurchases = () => fetchData('compras');

export const registerPurchase = async (qty, cost, price, pid, productData = null) => {
  let productId = pid;

  if (!pid && productData) {
    // New product registration with its first stock
    const product = await addData('productos', {
      nombre: productData.name,
      unidad: productData.unit,
      stock: qty,
      precio_compra: cost,
      precio_venta: price,
      stock_minimo: productData.min || 5
    });
    productId = product.id;
  } else {
    // Update existing product
    const currentP = await fetchData('productos').then(pp => pp.find(x => x.id == pid));
    if (!currentP) throw new Error("Producto no encontrado");
    
    await updateData('productos', pid, {
      stock: Number(currentP.stock) + qty,
      precio_compra: cost,
      precio_venta: price
    });
  }

  // Log the purchase
  return addData('compras', {
    producto_id: productId,
    cantidad: qty,
    costo_unidad: cost,
    total: qty * cost,
    fecha: new Date().toISOString()
  });
};

// --- CLIENT SERVICES ---
export const getClients = () => fetchData('clientes');

export const saveClient = (id, data) => {
  if (id) return updateData('clientes', id, data);
  return addData('clientes', { ...data, saldo_deuda: 0 });
};

export const registerPayment = async (clientId, amount) => {
  const c = await fetchData('clientes').then(clis => clis.find(x => x.id == clientId));
  if (!c) throw new Error("Cliente no encontrado");
  
  await updateData('clientes', clientId, { saldo_deuda: Number(c.saldo_deuda) - amount });
  return addData('pagos', { cliente_id: clientId, monto: amount, fecha: new Date().toISOString() });
};
