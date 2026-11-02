    // URL Pública del Google Sheets en formato CSV
    const SHEETS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSZkU-oKSeBFqKN8y-y3JnxJ8VTpotJoaFl-_fJnU6pG5WU15j022c44GCq2ookNQ/pub?gid=974966116&single=true&output=csv';

    // Tu número de WhatsApp de contacto (código de país 57 + número)
    const WHATSAPP_PHONE = '573206548796';

    // Estado de la aplicación
    let allProducts = [];
    let cart = [];
    let activeCategory = 'ALL';

    // Elementos del DOM
    const statusContainer = document.getElementById('status-container');
    const productsGrid = document.getElementById('products-grid');
    const filtersContainer = document.getElementById('filters-container');
    const cartCounter = document.getElementById('cart-counter');
    const openCartBtn = document.getElementById('open-cart-btn');
    const mobileCartCounter = document.getElementById('mobile-cart-counter');
    const mobileOpenCartBtn = document.getElementById('mobile-open-cart');
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const mobileNavigation = document.getElementById('mobile-navigation');
    const closeCartBtn = document.getElementById('close-cart-btn');
    const drawerOverlay = document.getElementById('drawer-overlay');
    const cartDrawer = document.getElementById('cart-drawer');
    const drawerBody = document.getElementById('drawer-body');
    const drawerFooter = document.getElementById('drawer-footer');
    const cartTotalAmount = document.getElementById('cart-total-amount');
    const checkoutWhatsappBtn = document.getElementById('checkout-whatsapp-btn');

    // Analizador robusto de líneas CSV (respeta comas entre comillas)
    function parseCSVLine(text) {
      const result = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(cur.trim());
          cur = '';
        } else {
          cur += char;
        }
      }
      result.push(cur.trim());
      return result;
    }

    // Formateador de moneda en Pesos Colombianos (COP)
    function formatCOP(num) {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0
      }).format(num);
    }

    function parseCOPPrice(value) {
      const normalizedValue = value.trim().replace(/[^\d,.-]/g, '');
      if (!normalizedValue) return 0;

      const normalizedNumber = normalizedValue.includes(',')
        ? normalizedValue.replace(/\./g, '').replace(',', '.')
        : normalizedValue.replace(/\./g, '');
      const price = Number(normalizedNumber);

      return Number.isFinite(price) ? Math.round(price) : 0;
    }

    function parseStockQuantity(value) {
      const digits = value.trim().replace(/[^\d]/g, '');
      return digits ? Number(digits) : null;
    }

    function handleBrokenImages(container) {
      container.querySelectorAll('img').forEach(image => {
        image.addEventListener('error', () => {
          const placeholder = document.createElement('div');
          const isCartImage = image.classList.contains('cart-item-img');
          placeholder.className = isCartImage ? 'cart-item-img' : 'img-placeholder';

          if (isCartImage) {
            placeholder.style.display = 'flex';
            placeholder.style.alignItems = 'center';
            placeholder.style.justifyContent = 'center';
            placeholder.style.color = 'var(--accent-gold)';
          }

          const icon = document.createElement('i');
          icon.className = 'fa-solid fa-gem';
          placeholder.appendChild(icon);
          image.replaceWith(placeholder);
        }, { once: true });
      });
    }

    // Cargar datos en vivo desde Google Sheets
    async function loadCatalog() {
      try {
        const response = await fetch(SHEETS_CSV_URL);
        if (!response.ok) throw new Error('No se pudo acceder a la hoja de cálculo');

        const csvData = await response.text();
        const lines = csvData.split(/\r?\n/).filter(line => line.trim().length > 0);

        if (lines.length < 2) throw new Error('El archivo CSV está vacío o sin datos');

        // Buscar la fila de encabezados
        let headerRowIndex = -1;
        let colIndex = { category: -1, product: -1, price: -1, quantity: -1, image: -1 };

        for (let i = 0; i < Math.min(lines.length, 10); i++) {
          const cells = parseCSVLine(lines[i]).map(c => c.toLowerCase());
          const pIdx = cells.findIndex(c => c.includes('producto'));
          if (pIdx !== -1) {
            headerRowIndex = i;
            colIndex.product = pIdx;
            colIndex.category = cells.findIndex(c => c.includes('categor'));
            colIndex.price = cells.findIndex(c => c.includes('precio') || c.includes('venta'));
            colIndex.quantity = cells.findIndex(c => c.includes('cantidad'));
            const imageColumnIndex = cells.findIndex(c =>
              c.includes('url img') ||
              c.includes('url imagen') ||
              c.includes('imagen') ||
              c.includes('foto') ||
              c === 'img'
            );
            colIndex.image = imageColumnIndex !== -1 ? imageColumnIndex : cells.findIndex(c =>
              c.includes('img') ||
              c.includes('url') ||
              c.includes('enlace')
            );
            break;
          }
        }

        if (headerRowIndex === -1) {
          // Asumir estructura fija si no tiene fila de nombres explícita
          colIndex = { category: 0, product: 1, price: 4, quantity: 2, image: 10 };
          headerRowIndex = 2;
        }

        // Procesar las filas de productos
        allProducts = [];
        const categoriesSet = new Set();

        for (let i = headerRowIndex + 1; i < lines.length; i++) {
          const cols = parseCSVLine(lines[i]);
          const name = cols[colIndex.product];

          if (!name || name.toUpperCase().includes('TOTAL') || name.trim() === '') continue;

          const category = (colIndex.category !== -1 && cols[colIndex.category]) ? cols[colIndex.category] : 'General';
          
          const rawPrice = (colIndex.price !== -1 && cols[colIndex.price]) ? cols[colIndex.price] : '0';
          const price = parseCOPPrice(rawPrice);
          const quantity = colIndex.quantity !== -1
            ? parseStockQuantity(cols[colIndex.quantity] || '')
            : null;

          // Aceptar enlaces de imagen aunque no terminen en una extensión conocida.
          const rawImageUrl = (colIndex.image !== -1 && cols[colIndex.image]) ? cols[colIndex.image].trim() : '';
          let imageUrl = '';
          if (rawImageUrl) {
            try {
              const parsedImageUrl = new URL(rawImageUrl);
              if (parsedImageUrl.protocol === 'http:' || parsedImageUrl.protocol === 'https:') {
                imageUrl = parsedImageUrl.href;
              }
            } catch (error) {
              console.warn(`URL de imagen inválida para el producto "${name}":`, rawImageUrl);
            }
          }

          categoriesSet.add(category);
          allProducts.push({
            id: 'prod_' + i,
            name: name,
            category: category,
            price: price,
            quantity: quantity,
            image: imageUrl
          });
        }

        // Renderizar Filtros y Productos
        renderCategoryFilters(Array.from(categoriesSet));
        renderProducts();

        statusContainer.style.display = 'none';
        productsGrid.style.display = 'grid';

      } catch (err) {
        console.error(err);
        statusContainer.innerHTML = `
          <div style="color: #ff5c5c; margin-bottom: 1rem;"><i class="fa-solid fa-triangle-exclamation fa-2x"></i></div>
          <p>Hubo un problema al sincronizar el inventario.</p>
          <p style="font-size: 0.8rem; margin-top: 0.5rem; opacity: 0.7;">Verifica que la hoja esté publicada en la web como CSV.</p>
        `;
      }
    }

    // Renderizar botones de filtro
    function renderCategoryFilters(categories) {
      filtersContainer.innerHTML = `<button class="filter-btn ${activeCategory === 'ALL' ? 'active' : ''}" data-category="ALL">Todos</button>`;
      
      categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = `filter-btn ${activeCategory === cat ? 'active' : ''}`;
        btn.dataset.category = cat;
        btn.textContent = cat;
        filtersContainer.appendChild(btn);
      });

      filtersContainer.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          filtersContainer.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          activeCategory = btn.dataset.category;
          renderProducts();
        });
      });
    }

    // Renderizar catálogo de productos
    function renderProducts() {
      const filtered = activeCategory === 'ALL' 
        ? allProducts 
        : allProducts.filter(p => p.category === activeCategory);

      if (filtered.length === 0) {
        productsGrid.innerHTML = `
          <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-muted);">
            No hay productos disponibles en esta categoría.
          </div>
        `;
        return;
      }

      productsGrid.innerHTML = filtered.map(item => `
        <article class="product-card">
          <div class="card-img-wrapper">
            <span class="category-tag">${item.category}</span>
            ${item.image 
              ? `<img src="${item.image}" alt="${item.name}" loading="lazy">` 
              : `<div class="img-placeholder"><i class="fa-solid fa-gem"></i></div>`
            }
          </div>
          <div class="card-content">
            <h3 class="product-title" title="${item.name}">${item.name}</h3>
            <div class="price-row">
              <span class="product-price">${formatCOP(item.price)}<span class="currency-tag">COP</span></span>
            </div>
            <p class="stock-status ${item.quantity === 0 ? 'out-of-stock' : ''}">
              ${item.quantity === 0 ? 'Agotado' : item.quantity !== null ? `Disponibles: ${item.quantity}` : ''}
            </p>
            <button class="add-btn" onclick="addToCart('${item.id}')" ${item.quantity === 0 ? 'disabled' : ''}>
              ${item.quantity === 0 ? 'Agotado' : '<i class="fa-solid fa-plus"></i> Agregar al Pedido'}
            </button>
          </div>
        </article>
      `).join('');
      handleBrokenImages(productsGrid);
    }

    // Operaciones del Carrito
    window.addToCart = function(prodId) {
      const product = allProducts.find(p => p.id === prodId);
      if (!product) return;

      const existing = cart.find(i => i.id === prodId);
      if (product.quantity !== null && (existing ? existing.qty : 0) >= product.quantity) {
        alert(`Solo hay ${product.quantity} unidad(es) disponibles de "${product.name}".`);
        return;
      }

      if (existing) {
        existing.qty += 1;
      } else {
        cart.push({ ...product, qty: 1 });
      }
      updateCartUI();
      openCartDrawer();
    };

    function updateCartUI() {
      const totalUnits = cart.reduce((sum, item) => sum + item.qty, 0);
      cartCounter.textContent = totalUnits;
      mobileCartCounter.textContent = totalUnits;

      if (cart.length === 0) {
        drawerBody.innerHTML = `
          <div class="empty-cart-msg">
            <i class="fa-solid fa-basket-shopping"></i>
            <p>Tu carrito está vacío</p>
            <p style="font-size: 0.8rem; margin-top: 0.5rem;">Agrega accesorios desde el catálogo para iniciar tu pedido.</p>
          </div>
        `;
        drawerFooter.style.display = 'none';
        return;
      }

      const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
      cartTotalAmount.textContent = formatCOP(totalAmount);
      drawerFooter.style.display = 'block';

      drawerBody.innerHTML = `
        <div class="cart-items-list">
          ${cart.map(item => `
            <div class="cart-item">
              ${item.image 
                ? `<img src="${item.image}" class="cart-item-img" alt="${item.name}">` 
                : `<div class="cart-item-img" style="display:flex;align-items:center;justify-content:center;color:var(--accent-gold);"><i class="fa-solid fa-gem"></i></div>`
              }
              <div class="cart-item-info">
                <div class="cart-item-name">${item.name}</div>
                <div class="cart-item-price">${formatCOP(item.price)} c/u</div>
                <div class="cart-item-controls">
                  <button class="qty-btn" onclick="changeQty('${item.id}', -1)">-</button>
                  <span class="qty-val">${item.qty}</span>
                  <button class="qty-btn" onclick="changeQty('${item.id}', 1)" ${item.quantity !== null && item.qty >= item.quantity ? 'disabled' : ''}>+</button>
                  <button class="remove-item-btn" onclick="removeFromCart('${item.id}')" title="Eliminar"><i class="fa-solid fa-trash-can"></i></button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="checkout-form">
          <div class="form-title">Datos del pedido</div>
          <div class="form-group">
            <input type="text" id="cust-name" class="form-input" placeholder="Nombre completo *" required>
          </div>
          <div class="form-group">
            <input type="text" id="cust-city" class="form-input" placeholder="Ciudad / Municipio *" value="Medellín">
          </div>
        </div>
      `;
      handleBrokenImages(drawerBody);
    }

    window.changeQty = function(id, delta) {
      const item = cart.find(i => i.id === id);
      if (!item) return;
      if (delta > 0 && item.quantity !== null && item.qty >= item.quantity) {
        alert(`Solo hay ${item.quantity} unidad(es) disponibles de "${item.name}".`);
        return;
      }

      item.qty += delta;
      if (item.qty <= 0) {
        cart = cart.filter(i => i.id !== id);
      }
      updateCartUI();
    };

    window.removeFromCart = function(id) {
      cart = cart.filter(i => i.id !== id);
      updateCartUI();
    };

    function openCartDrawer() {
      closeMobileNavigation();
      cartDrawer.classList.add('open');
      drawerOverlay.classList.add('open');
    }

    function closeCartDrawer() {
      cartDrawer.classList.remove('open');
      drawerOverlay.classList.remove('open');
    }

    openCartBtn.addEventListener('click', openCartDrawer);
    mobileOpenCartBtn.addEventListener('click', openCartDrawer);
    closeCartBtn.addEventListener('click', closeCartDrawer);
    drawerOverlay.addEventListener('click', closeCartDrawer);

    function closeMobileNavigation() {
      mobileNavigation.classList.remove('open');
      mobileMenuToggle.setAttribute('aria-expanded', 'false');
      mobileMenuToggle.setAttribute('aria-label', 'Abrir menú de navegación');
      mobileMenuToggle.innerHTML = '<i class="fa-solid fa-bars" aria-hidden="true"></i>';
    }

    mobileMenuToggle.addEventListener('click', () => {
      const isOpen = mobileNavigation.classList.toggle('open');
      mobileMenuToggle.setAttribute('aria-expanded', String(isOpen));
      mobileMenuToggle.setAttribute('aria-label', isOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación');
      mobileMenuToggle.innerHTML = `<i class="fa-solid fa-${isOpen ? 'xmark' : 'bars'}" aria-hidden="true"></i>`;
    });

    mobileNavigation.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', closeMobileNavigation);
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeMobileNavigation();
    });

    // Enviar pedido a WhatsApp
    checkoutWhatsappBtn.addEventListener('click', () => {
      const nameInput = document.getElementById('cust-name');
      const cityInput = document.getElementById('cust-city');

      const name = nameInput ? nameInput.value.trim() : '';
      const city = cityInput ? cityInput.value.trim() : '';

      if (!name) {
        alert('Por favor ingresa tu nombre para procesar el pedido.');
        nameInput.focus();
        return;
      }

      let msg = `✨ *NUEVO PEDIDO - MILONGA BOUTIQUE* ✨\n\n`;
      msg += `👤 *Cliente:* ${name}\n`;
      if (city) msg += `📍 *Ciudad:* ${city}\n`;
      msg += `\n🛒 *DETALLE DEL PEDIDO:*\n`;
      msg += `─────────────────────────\n`;

      let total = 0;
      cart.forEach((item, idx) => {
        const subtotal = item.price * item.qty;
        total += subtotal;
        msg += `${idx + 1}. *${item.name}*\n`;
        msg += `   └ Cantidad: ${item.qty} x ${formatCOP(item.price)} = ${formatCOP(subtotal)}\n`;
      });

      msg += `─────────────────────────\n`;
      msg += `💰 *TOTAL A PAGAR:* ${formatCOP(total)} COP\n\n`;
      msg += `Quedo atento(a) para coordinar el pago y el envío. ¡Muchas gracias!`;

      const encodedMsg = encodeURIComponent(msg);
      window.open(`https://wa.me/${WHATSAPP_PHONE}?text=${encodedMsg}`, '_blank');
    });

    // Iniciar carga del catálogo al abrir la página
    document.addEventListener('DOMContentLoaded', loadCatalog);
