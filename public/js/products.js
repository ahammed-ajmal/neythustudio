import { db } from './firebase.js';
import { collection, getDocs, query, orderBy, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Sample Handcrafted Crochet Pieces (disabled so only real products from Firestore appear)
const SAMPLE_CROCHET_PRODUCTS = [];

// Global variable to store all products & filters (loaded dynamically from database/products)
let allProducts = [];
let availableCategories = [];
let availableProductTypes = [];
let availableColors = [];
let currentProduct = null;
let urlParamsProcessed = false;

// Extract unique categories, styles, and shades directly from products & localStorage
function extractFiltersFromProducts(products) {
    if (!Array.isArray(products)) return;
    const catSet = new Set();
    const typeSet = new Set();
    const colorSet = new Set();

    // Check categories created in Admin Settings
    try {
        const savedCat = localStorage.getItem('neythu_categories') || localStorage.getItem('jasmnl_categories');
        if (savedCat) {
            const parsed = JSON.parse(savedCat);
            if (Array.isArray(parsed)) {
                parsed.forEach(c => {
                    const name = typeof c === 'string' ? c : c.name;
                    if (name && name.trim()) catSet.add(name.trim());
                });
            }
        }
    } catch (_) {}

    // Check product types created in Admin Settings
    try {
        const savedTypes = localStorage.getItem('neythu_product_types') || localStorage.getItem('jasmnl_product_types');
        if (savedTypes) {
            const parsed = JSON.parse(savedTypes);
            if (Array.isArray(parsed)) {
                parsed.forEach(t => {
                    const name = typeof t === 'string' ? t : t.name;
                    if (name && name.trim()) typeSet.add(name.trim());
                });
            }
        }
    } catch (_) {}

    // Collect from actual products in Firestore
    products.forEach(p => {
        if (p.category && typeof p.category === 'string') {
            const cat = p.category.trim();
            if (cat) catSet.add(cat);
        }
        if (p.type && typeof p.type === 'string') {
            const t = p.type.trim();
            if (t) typeSet.add(t);
        }
        if (p.color && typeof p.color === 'string') {
            p.color.split(',').forEach(c => {
                const trimmed = c.trim();
                if (trimmed) colorSet.add(trimmed);
            });
        }
    });

    availableCategories = Array.from(catSet).sort();
    availableProductTypes = Array.from(typeSet).sort();
    availableColors = Array.from(colorSet).sort();
}

// Render dynamic filter checkboxes based strictly on available database/product data
function renderFilterCheckboxes() {
    const catContainer = document.getElementById('category-filters-container');
    if (catContainer) {
        if (availableCategories.length === 0) {
            catContainer.innerHTML = '<span style="font-size:0.85rem; color:#888;">No categories available</span>';
        } else {
            const checked = new Set(
                Array.from(catContainer.querySelectorAll('.category-filter:checked')).map(cb => cb.value)
            );
            catContainer.innerHTML = availableCategories.map(cat => `
                <label>
                    <input type="checkbox" value="${cat}" class="category-filter" ${checked.has(cat) ? 'checked' : ''}> ${cat}
                </label>
            `).join('');
        }
    }

    const typeContainer = document.getElementById('type-filters-container');
    if (typeContainer) {
        if (availableProductTypes.length === 0) {
            typeContainer.innerHTML = '<span style="font-size:0.85rem; color:#888;">No stitch types available</span>';
        } else {
            const checked = new Set(
                Array.from(typeContainer.querySelectorAll('.type-filter:checked')).map(cb => cb.value)
            );
            typeContainer.innerHTML = availableProductTypes.map(t => `
                <label>
                    <input type="checkbox" value="${t}" class="type-filter" ${checked.has(t) ? 'checked' : ''}> ${t}
                </label>
            `).join('');
        }
    }

    const colorContainer = document.getElementById('color-filters-container');
    if (colorContainer) {
        if (availableColors.length === 0) {
            colorContainer.innerHTML = '<span style="font-size:0.85rem; color:#888;">No yarn shades available</span>';
        } else {
            const checked = new Set(
                Array.from(colorContainer.querySelectorAll('.color-filter:checked')).map(cb => cb.value.toLowerCase())
            );
            colorContainer.innerHTML = availableColors.map(c => `
                <label class="color-pill ${checked.has(c.toLowerCase()) ? 'active' : ''}" data-color="${c}">
                    <input type="checkbox" value="${c}" class="color-filter" ${checked.has(c.toLowerCase()) ? 'checked' : ''}>
                    <span>${c}</span>
                </label>
            `).join('');
        }
    }
}

// Check URL params for preselected filters (?category=..., ?type=..., ?color=...)
function handleUrlFilterParams() {
    if (urlParamsProcessed) return;
    const urlParams = new URLSearchParams(window.location.search);
    const categoryParam = urlParams.get('category');
    const typeParam = urlParams.get('type');
    const colorParam = urlParams.get('color');
    const sortParam = urlParams.get('sort');
    const filterParam = urlParams.get('filter');

    if (sortParam || filterParam === 'new') {
        const sortSelect = document.getElementById('sort-select');
        if (sortSelect) sortSelect.value = 'newest';
    }

    const catContainer = document.getElementById('category-filters-container');
    if (categoryParam) {
        const catBoxes = Array.from(document.querySelectorAll('.category-filter'));
        let matchedBox = catBoxes.find(b => matchesCategory(b.value, categoryParam));

        if (matchedBox) {
            matchedBox.checked = true;
        } else if (catContainer) {
            const emptyNotice = catContainer.querySelector('span');
            if (emptyNotice) catContainer.innerHTML = '';
            const newLabel = document.createElement('label');
            newLabel.innerHTML = `<input type="checkbox" value="${categoryParam}" class="category-filter" checked> ${categoryParam}`;
            catContainer.appendChild(newLabel);
        }
    }

    if (typeParam) {
        const typeBoxes = Array.from(document.querySelectorAll('.type-filter'));
        let matchedType = typeBoxes.find(b => matchesCategory(b.value, typeParam));
        if (matchedType) matchedType.checked = true;
    }

    if (colorParam) {
        const colorBoxes = Array.from(document.querySelectorAll('.color-filter'));
        let matchedColor = colorBoxes.find(b => b.value.toLowerCase() === colorParam.toLowerCase());
        if (matchedColor) {
            matchedColor.checked = true;
            matchedColor.closest('.color-pill')?.classList.add('active');
        }
    }

    if (categoryParam || typeParam || colorParam || sortParam) {
        urlParamsProcessed = true;
    }
}

// Fast hydration from cached products if user has visited before
function quickHydrateShop() {
    const productGrid = document.getElementById('shop-products-grid');
    if (!productGrid) return;

    let cachedProducts = null;
    try {
        const rawCached = localStorage.getItem('neythu_products_cache');
        if (rawCached) {
            cachedProducts = JSON.parse(rawCached);
        }
    } catch (_) {}

    if (Array.isArray(cachedProducts) && cachedProducts.length > 0) {
        allProducts = cachedProducts;
        extractFiltersFromProducts(allProducts);
        renderFilterCheckboxes();
        handleUrlFilterParams();
        setupFilterListeners();
        applyFilters();
    }
}

// Fetch Products Function (Direct, Fast, Non-blocking)
async function fetchProducts() {
    const productGrid = document.getElementById('shop-products-grid');
    const featuredGrid = document.getElementById('featured-products');
    const categoryGrid = document.getElementById('home-category-grid');

    if (!productGrid && !featuredGrid && !categoryGrid) {
        return;
    }

    try {
        // Single direct query for products from Firestore
        const q = collection(db, "products");
        const querySnapshot = await getDocs(q);

        const freshProducts = [];
        querySnapshot.forEach((docSnap) => {
            freshProducts.push({ id: docSnap.id, ...docSnap.data() });
        });

        allProducts = freshProducts;

        // Cache products for future fast page loads
        try {
            localStorage.setItem('neythu_products_cache', JSON.stringify(freshProducts));
        } catch (_) {}

        // Extract filters dynamically strictly from Firestore data
        extractFiltersFromProducts(allProducts);

        if (featuredGrid) {
            renderFeaturedProducts(allProducts.slice(0, 4), featuredGrid);
        }

        if (categoryGrid) {
            await renderHomeCategories(allProducts, categoryGrid);
        }

        if (productGrid) {
            renderFilterCheckboxes();
            handleUrlFilterParams();
            setupFilterListeners();
            applyFilters();
        }

        // Non-blocking background sync for any standalone categories from Admin
        getDocs(collection(db, "categories")).then(snap => {
            let changed = false;
            snap.forEach(d => {
                const name = d.data()?.name;
                if (name && !availableCategories.includes(name)) {
                    availableCategories.push(name);
                    changed = true;
                }
            });
            if (changed) {
                availableCategories.sort();
                renderFilterCheckboxes();
            }
        }).catch(() => {});

    } catch (error) {
        console.error("Firestore fetch error:", error);
        if (productGrid && allProducts.length === 0) {
            productGrid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: var(--text-light);">
                    <p style="margin-bottom: 15px;">Unable to load pieces right now. Please check your network or try again.</p>
                    <button class="btn btn-secondary" onclick="window.fetchProducts()">Retry Loading</button>
                </div>
            `;
            const catContainer = document.getElementById('category-filters-container');
            if (catContainer) catContainer.innerHTML = '<span style="font-size:0.85rem; color:#888;">No categories available</span>';
            const typeContainer = document.getElementById('type-filters-container');
            if (typeContainer) typeContainer.innerHTML = '<span style="font-size:0.85rem; color:#888;">No stitch types available</span>';
            const colorContainer = document.getElementById('color-filters-container');
            if (colorContainer) colorContainer.innerHTML = '<span style="font-size:0.85rem; color:#888;">No yarn shades available</span>';
        }
    }
}

// Helper to match category strings flexibly (e.g. "Crochet Tops" <-> "Tops", "Crochet Bags" <-> "Bags & Totes")
function matchesCategory(catA, catB) {
    if (!catA || !catB) return false;
    const a = String(catA).trim().toLowerCase();
    const b = String(catB).trim().toLowerCase();
    if (a === b) return true;

    const normA = a.replace(/[^a-z0-9]/g, '');
    const normB = b.replace(/[^a-z0-9]/g, '');
    if (normA === normB) return true;
    if (normA.length > 2 && normB.length > 2 && (normA.includes(normB) || normB.includes(normA))) return true;

    // Semantic keyword aliases
    const keywords = ['top', 'dress', 'bag', 'tote', 'granny', 'cardigan', 'sweater', 'accessor'];
    for (const kw of keywords) {
        if (normA.includes(kw) && normB.includes(kw)) {
            return true;
        }
    }
    return false;
}

function setupFilterListeners() {
    // Mobile Drawer Controls
    const mobileFilterTrigger = document.getElementById('mobile-filter-trigger');
    const filtersDrawer = document.getElementById('shop-filters');
    const filterBackdrop = document.getElementById('filter-backdrop');
    const filtersCloseBtn = document.getElementById('filters-close-btn');
    const filterApplyBtn = document.getElementById('filter-apply-btn');
    const mobileResetBtn = document.getElementById('mobile-reset-filters-btn');

    function openFiltersDrawer() {
        if (filtersDrawer) filtersDrawer.classList.add('active');
        if (filterBackdrop) filterBackdrop.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeFiltersDrawer() {
        if (filtersDrawer) filtersDrawer.classList.remove('active');
        if (filterBackdrop) filterBackdrop.classList.remove('active');
        document.body.style.overflow = '';
    }

    if (mobileFilterTrigger && !mobileFilterTrigger.dataset.listenerAttached) {
        mobileFilterTrigger.dataset.listenerAttached = 'true';
        mobileFilterTrigger.addEventListener('click', openFiltersDrawer);
    }

    if (filtersCloseBtn && !filtersCloseBtn.dataset.listenerAttached) {
        filtersCloseBtn.dataset.listenerAttached = 'true';
        filtersCloseBtn.addEventListener('click', closeFiltersDrawer);
    }

    if (filterBackdrop && !filterBackdrop.dataset.listenerAttached) {
        filterBackdrop.dataset.listenerAttached = 'true';
        filterBackdrop.addEventListener('click', closeFiltersDrawer);
    }

    if (filterApplyBtn && !filterApplyBtn.dataset.listenerAttached) {
        filterApplyBtn.dataset.listenerAttached = 'true';
        filterApplyBtn.addEventListener('click', closeFiltersDrawer);
    }

    if (mobileResetBtn && !mobileResetBtn.dataset.listenerAttached) {
        mobileResetBtn.dataset.listenerAttached = 'true';
        mobileResetBtn.addEventListener('click', () => {
            const resetBtn = document.getElementById('reset-filters-btn');
            if (resetBtn) resetBtn.click();
        });
    }

    window.addEventListener('resize', () => {
        if (window.innerWidth > 850 && filtersDrawer && filtersDrawer.classList.contains('active')) {
            closeFiltersDrawer();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && filtersDrawer && filtersDrawer.classList.contains('active')) {
            closeFiltersDrawer();
        }
    });

    // Checkboxes (categories & types) - event delegation on containers
    const catContainer = document.getElementById('category-filters-container');
    if (catContainer && !catContainer.dataset.listenerAttached) {
        catContainer.dataset.listenerAttached = 'true';
        catContainer.addEventListener('change', (e) => {
            if (e.target.classList.contains('category-filter')) {
                applyFilters();
            }
        });
    }

    const typeContainer = document.getElementById('type-filters-container');
    if (typeContainer && !typeContainer.dataset.listenerAttached) {
        typeContainer.dataset.listenerAttached = 'true';
        typeContainer.addEventListener('change', (e) => {
            if (e.target.classList.contains('type-filter')) {
                applyFilters();
            }
        });
    }

    // Color Pills - event delegation on container
    const colorContainer = document.getElementById('color-filters-container');
    if (colorContainer && !colorContainer.dataset.listenerAttached) {
        colorContainer.dataset.listenerAttached = 'true';
        colorContainer.addEventListener('click', (e) => {
            const pill = e.target.closest('.color-pill');
            if (!pill) return;
            const checkbox = pill.querySelector('input');
            if (checkbox) {
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                }
                if (checkbox.checked) {
                    pill.classList.add('active');
                } else {
                    pill.classList.remove('active');
                }
                applyFilters();
            }
        });
    }

    // Price Radio
    document.querySelectorAll('input[name="price"]').forEach(input => {
        if (!input.dataset.listenerAttached) {
            input.dataset.listenerAttached = 'true';
            input.addEventListener('change', applyFilters);
        }
    });

    // Sort Dropdown
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect && !sortSelect.dataset.listenerAttached) {
        sortSelect.dataset.listenerAttached = 'true';
        sortSelect.addEventListener('change', applyFilters);
    }

    // Reset Filters Button
    const resetBtn = document.getElementById('reset-filters-btn');
    if (resetBtn && !resetBtn.dataset.listenerAttached) {
        resetBtn.dataset.listenerAttached = 'true';
        resetBtn.addEventListener('click', () => {
            document.querySelectorAll('.category-filter').forEach(cb => cb.checked = false);
            document.querySelectorAll('.type-filter').forEach(cb => cb.checked = false);
            document.querySelectorAll('.color-filter').forEach(cb => cb.checked = false);
            document.querySelectorAll('.color-pill').forEach(pill => pill.classList.remove('active'));
            const defaultPriceRadio = document.querySelector('input[name="price"][value="all"]');
            if (defaultPriceRadio) defaultPriceRadio.checked = true;
            if (sortSelect) sortSelect.value = 'newest';
            applyFilters();
        });
    }
}

function applyFilters() {
    const productGrid = document.getElementById('shop-products-grid');
    if (!productGrid) return;

    if (allProducts.length === 0) {
        const countEl = document.getElementById('product-count');
        if (countEl) countEl.innerText = 'Showing 0 handcrafted pieces';
        productGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; background: var(--bg-card); border: 1px dashed var(--border-light); border-radius: 8px;">
                <i class="fa-solid fa-shirt" style="font-size: 2.5rem; color: var(--primary-sage); margin-bottom: 15px; display: block;"></i>
                <h3 style="font-family: var(--font-heading); color: var(--text-dark); margin-bottom: 8px;">No Pieces in the Studio Yet</h3>
                <p style="color: var(--text-light); max-width: 480px; margin: 0 auto; font-size: 0.95rem;">Our artisans are currently crafting new collections. Check back soon!</p>
            </div>
        `;
        return;
    }

    // Get checked categories
    const checkedCategories = Array.from(document.querySelectorAll('.category-filter:checked')).map(cb => cb.value);

    // Get checked types
    const checkedTypes = Array.from(document.querySelectorAll('.type-filter:checked')).map(cb => cb.value);

    // Get checked colors
    const checkedColors = Array.from(document.querySelectorAll('.color-filter:checked')).map(cb => cb.value.toLowerCase());

    // Get selected price
    const selectedPrice = document.querySelector('input[name="price"]:checked')?.value || 'all';

    // Filter Data
    let filtered = allProducts.filter(product => {
        // Category Match
        const categoryMatch = checkedCategories.length === 0 || checkedCategories.some(cat => matchesCategory(cat, product.category));

        // Type Match
        const typeMatch = checkedTypes.length === 0 || checkedTypes.some(t => matchesCategory(t, product.type));

        // Color Match
        let colorMatch = true;
        if (checkedColors.length > 0) {
            const prodColor = (product.color || '').toLowerCase();
            colorMatch = checkedColors.some(c => prodColor.includes(c));
        }

        // Price Match (use offerPrice if present, else regular price)
        const regularPrice = typeof product.price === 'number' ? product.price : parseFloat(product.price || 0);
        const hasOffer = product.offerPrice !== undefined && product.offerPrice !== null && !isNaN(product.offerPrice) && Number(product.offerPrice) > 0;
        const effectivePrice = hasOffer ? Number(product.offerPrice) : regularPrice;

        let priceMatch = true;
        if (selectedPrice === 'under-500') priceMatch = effectivePrice < 500;
        else if (selectedPrice === '500-1000') priceMatch = effectivePrice >= 500 && effectivePrice <= 1000;
        else if (selectedPrice === 'over-1000') priceMatch = effectivePrice > 1000;

        return categoryMatch && typeMatch && colorMatch && priceMatch;
    });

    // Sort Data
    const sortValue = document.getElementById('sort-select')?.value || 'newest';
    if (sortValue === 'price-low') {
        filtered.sort((a, b) => {
            const pA = (a.offerPrice && !isNaN(a.offerPrice) && Number(a.offerPrice) > 0) ? Number(a.offerPrice) : Number(a.price || 0);
            const pB = (b.offerPrice && !isNaN(b.offerPrice) && Number(b.offerPrice) > 0) ? Number(b.offerPrice) : Number(b.price || 0);
            return pA - pB;
        });
    } else if (sortValue === 'price-high') {
        filtered.sort((a, b) => {
            const pA = (a.offerPrice && !isNaN(a.offerPrice) && Number(a.offerPrice) > 0) ? Number(a.offerPrice) : Number(a.price || 0);
            const pB = (b.offerPrice && !isNaN(b.offerPrice) && Number(b.offerPrice) > 0) ? Number(b.offerPrice) : Number(b.price || 0);
            return pB - pA;
        });
    }

    // Render
    const countEl = document.getElementById('product-count');
    if (countEl) countEl.innerText = `Showing ${filtered.length} handcrafted piece${filtered.length === 1 ? '' : 's'}`;

    // Update Mobile Filter Badge & Apply Button Text
    const activeFilterCount = checkedCategories.length + checkedTypes.length + checkedColors.length + (selectedPrice !== 'all' ? 1 : 0);
    const filterBadge = document.getElementById('filter-count-badge');
    if (filterBadge) {
        if (activeFilterCount > 0) {
            filterBadge.textContent = activeFilterCount;
            filterBadge.style.display = 'inline-flex';
        } else {
            filterBadge.style.display = 'none';
        }
    }

    const filterApplyBtn = document.getElementById('filter-apply-btn');
    if (filterApplyBtn) {
        filterApplyBtn.textContent = filtered.length === 0 ? 'Apply Filters' : `Show ${filtered.length} Piece${filtered.length === 1 ? '' : 's'}`;
    }

    // Render active filter chips below toolbar
    renderActiveFilterChips({
        checkedCategories,
        checkedTypes,
        checkedColors,
        selectedPrice
    });

    if (filtered.length === 0) {
        const catLabel = checkedCategories.length > 0 ? ` in "${checkedCategories.join(', ')}"` : '';
        productGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px;">
                <p style="font-size: 1.1rem; color: var(--text-light); margin-bottom: 15px;">No crochet pieces match your selected filter${catLabel}.</p>
                <button class="btn btn-secondary" onclick="document.getElementById('reset-filters-btn')?.click()">View All Pieces</button>
            </div>
        `;
    } else {
        renderProducts(filtered, productGrid);
    }
}

function renderActiveFilterChips(filters) {
    const container = document.getElementById('active-filter-chips');
    if (!container) return;

    const chips = [];

    filters.checkedCategories.forEach(cat => {
        chips.push({
            label: cat,
            onRemove: () => {
                const box = Array.from(document.querySelectorAll('.category-filter')).find(b => b.value === cat);
                if (box) {
                    box.checked = false;
                    applyFilters();
                }
            }
        });
    });

    filters.checkedTypes.forEach(t => {
        chips.push({
            label: t,
            onRemove: () => {
                const box = Array.from(document.querySelectorAll('.type-filter')).find(b => b.value === t);
                if (box) {
                    box.checked = false;
                    applyFilters();
                }
            }
        });
    });

    filters.checkedColors.forEach(c => {
        chips.push({
            label: c,
            onRemove: () => {
                const box = Array.from(document.querySelectorAll('.color-filter')).find(b => b.value.toLowerCase() === c.toLowerCase());
                if (box) {
                    box.checked = false;
                    box.closest('.color-pill')?.classList.remove('active');
                    applyFilters();
                }
            }
        });
    });

    if (filters.selectedPrice && filters.selectedPrice !== 'all') {
        let priceText = '';
        if (filters.selectedPrice === 'under-500') priceText = 'Under ₹500';
        else if (filters.selectedPrice === '500-1000') priceText = '₹500 - ₹1000';
        else if (filters.selectedPrice === 'over-1000') priceText = 'Over ₹1000';

        chips.push({
            label: priceText,
            onRemove: () => {
                const def = document.querySelector('input[name="price"][value="all"]');
                if (def) {
                    def.checked = true;
                    applyFilters();
                }
            }
        });
    }

    if (chips.length === 0) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    container.innerHTML = `
        <div class="active-chips-list">
            ${chips.map((chip, i) => `
                <button type="button" class="filter-chip" data-chip-index="${i}">
                    <span>${chip.label}</span>
                    <i class="fa-solid fa-xmark"></i>
                </button>
            `).join('')}
            <button type="button" class="clear-all-chips" id="clear-all-chips-btn">Clear all</button>
        </div>
    `;

    container.querySelectorAll('.filter-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.chipIndex, 10);
            if (chips[idx] && typeof chips[idx].onRemove === 'function') {
                chips[idx].onRemove();
            }
        });
    });

    const clearAllBtn = document.getElementById('clear-all-chips-btn');
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', () => {
            const resetBtn = document.getElementById('reset-filters-btn');
            if (resetBtn) resetBtn.click();
        });
    }
}

function renderProducts(products, container) {
    container.innerHTML = products.map(product => {
        const regularPrice = typeof product.price === 'number' ? product.price : parseFloat(product.price || 0);
        const hasOffer = product.offerPrice !== undefined && product.offerPrice !== null && !isNaN(product.offerPrice) && Number(product.offerPrice) > 0;
        const displayPrice = hasOffer ? Number(product.offerPrice) : regularPrice;

        return `
        <div class="product-card">
            <div class="product-image">
                <a href="product.html?id=${product.id}">
                    <img src="${product.image}" alt="${product.name}" onerror="this.src='https://via.placeholder.com/300x380?text=Crochet+Piece'">
                </a>
                ${hasOffer ? `<span class="sale-tag">Sale</span>` : ''}
            </div>
            <div class="product-info">
                <div class="product-meta-row">
                    <span class="product-category">${product.category || ''}</span>
                    ${product.type ? `<span class="product-type-badge">${product.type}</span>` : ''}
                </div>
                <h3 class="product-title">
                    <a href="product.html?id=${product.id}">${product.name}</a>
                </h3>
                ${product.color ? `
                    <div class="product-color-text">
                        <i class="fa-solid fa-palette" style="font-size:0.75rem;"></i> ${product.color}
                    </div>
                ` : ''}
                <div class="product-price">
                    <span>₹${displayPrice.toFixed(2)}</span>
                    ${hasOffer ? `<span style="text-decoration: line-through; color: #999; font-size: 0.85em; margin-left: 8px;">₹${regularPrice.toFixed(2)}</span>` : ''}
                </div>
                <button class="btn btn-secondary" onclick="window.quickAddToCart('${product.id}')" style="margin-top:10px; padding: 8px 15px; font-size: 0.8rem; width: 100%;">
                    Add to Crochet Bag
                </button>
            </div>
        </div>
    `;
    }).join('');
}

// Dynamic Home Categories Renderer
async function renderHomeCategories(products, container) {
    if (!container) return;

    let categories = [];

    // 1. Fetch available categories from Firestore 'categories' collection
    try {
        const catSnap = await getDocs(query(collection(db, "categories"), orderBy("name", "asc")));
        catSnap.forEach(d => {
            const data = d.data();
            if (data && data.name && data.name.trim()) {
                categories.push({
                    name: data.name.trim(),
                    image: data.image || data.imageUrl || null
                });
            }
        });
    } catch (e) {
        console.warn("Could not fetch categories from Firestore:", e);
        const saved = localStorage.getItem('neythu_categories') || localStorage.getItem('jasmnl_categories');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                parsed.forEach(c => {
                    const name = typeof c === 'string' ? c : c.name;
                    if (name && name.trim()) {
                        categories.push({
                            name: name.trim(),
                            image: c.image || null
                        });
                    }
                });
            } catch (err) {
                categories = [];
            }
        }
    }

    // 2. Also include any categories assigned to existing products that aren't in the list
    if (products && products.length > 0) {
        products.forEach(p => {
            if (p.category && p.category.trim()) {
                const catName = p.category.trim();
                const existing = categories.find(c => matchesCategory(c.name, catName));
                if (!existing) {
                    categories.push({
                        name: catName,
                        image: p.image || (p.images && p.images[0]) || null
                    });
                } else if (!existing.image && (p.image || (p.images && p.images[0]))) {
                    existing.image = p.image || p.images[0];
                }
            }
        });
    }

    // 3. For each category, assign real product photo if available, or appropriate fallback
    categories.forEach(cat => {
        if (!cat.image && products && products.length > 0) {
            const matchingProd = products.find(p => p.category && matchesCategory(p.category, cat.name) && (p.image || (p.images && p.images[0])));
            if (matchingProd) {
                cat.image = matchingProd.image || (matchingProd.images && matchingProd.images[0]);
            }
        }

        if (!cat.image) {
            const lower = cat.name.toLowerCase();
            if (lower.includes('top') || lower.includes('sweater') || lower.includes('cardigan') || lower.includes('vest')) {
                cat.image = 'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?q=80&w=2000&auto=format&fit=crop';
            } else if (lower.includes('dress') || lower.includes('skirt') || lower.includes('set')) {
                cat.image = 'https://images.unsplash.com/photo-1516762689617-e1cffcef479d?q=80&w=2000&auto=format&fit=crop';
            } else if (lower.includes('granny')) {
                cat.image = 'https://images.unsplash.com/photo-1584992236310-6edddc08acff?q=80&w=2000&auto=format&fit=crop';
            } else if (lower.includes('bag') || lower.includes('tote') || lower.includes('purse')) {
                cat.image = 'https://images.unsplash.com/photo-1606760227091-3dd870d97f1d?q=80&w=2000&auto=format&fit=crop';
            } else {
                cat.image = 'https://images.unsplash.com/photo-1584992236310-6edddc08acff?q=80&w=2000&auto=format&fit=crop';
            }
        }
    });

    // 4. Render category cards
    if (categories.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: var(--text-light);">
                <i class="fa-solid fa-tags" style="font-size: 2rem; color: var(--primary-sage); margin-bottom: 12px; display: block;"></i>
                <p style="font-size: 1rem; color: var(--text-dark); font-weight: 500;">No categories available yet.</p>
                <p style="font-size: 0.88rem; color: var(--text-light); margin-top: 4px;">Available categories will appear here once added in the studio settings.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = categories.map(cat => `
        <a href="shop.html?category=${encodeURIComponent(cat.name)}" class="category-card">
            <div class="category-circle-thumb">
                <img src="${cat.image}" alt="${cat.name}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1584992236310-6edddc08acff?q=80&w=2000&auto=format&fit=crop'">
            </div>
            <span class="category-title">${cat.name}</span>
        </a>
    `).join('');
}

function renderFeaturedProducts(products, container) {
    if (!products || products.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 50px 20px; background: var(--bg-card); border: 1px dashed var(--border-light); border-radius: 8px;">
                <i class="fa-solid fa-wand-magic-sparkles" style="font-size: 2.2rem; color: var(--primary-sage); margin-bottom: 12px; display: block;"></i>
                <h3 style="font-family: var(--font-heading); color: var(--text-dark); margin-bottom: 8px;">New Handcrafted Pieces Coming Soon</h3>
                <p style="color: var(--text-light); font-size: 0.95rem; max-width: 480px; margin: 0 auto;">No handcrafted pieces have been added to the studio yet. Check back soon for fresh drops!</p>
            </div>
        `;
        return;
    }

    container.innerHTML = products.map(product => {
        const regularPrice = typeof product.price === 'number' ? product.price : parseFloat(product.price || 0);
        const hasOffer = product.offerPrice !== undefined && product.offerPrice !== null && !isNaN(product.offerPrice) && Number(product.offerPrice) > 0;
        const displayPrice = hasOffer ? Number(product.offerPrice) : regularPrice;

        return `
        <div class="product-card">
            <div class="product-image">
                <a href="product.html?id=${product.id}">
                    <img src="${product.image}" alt="${product.name}" onerror="this.src='https://via.placeholder.com/300x380?text=Crochet+Piece'">
                </a>
                ${hasOffer ? `<span class="sale-tag">Sale</span>` : ''}
            </div>
            <div class="product-info">
                <div class="product-meta-row">
                    <span class="product-category">${product.category || ''}</span>
                    ${product.type ? `<span class="product-type-badge">${product.type}</span>` : ''}
                </div>
                <h3 class="product-title">
                    <a href="product.html?id=${product.id}">${product.name}</a>
                </h3>
                ${product.color ? `<div class="product-color-text"><i class="fa-solid fa-palette" style="font-size:0.75rem;"></i> ${product.color}</div>` : ''}
                <div class="product-price">
                    <span>₹${displayPrice.toFixed(2)}</span>
                    ${hasOffer ? `<span style="text-decoration: line-through; color: #999; font-size: 0.85em; margin-left: 8px;">₹${regularPrice.toFixed(2)}</span>` : ''}
                </div>
                <button class="btn btn-secondary" onclick="window.quickAddToCart('${product.id}')" style="margin-top:10px; padding: 8px 15px; font-size: 0.8rem; width: 100%;">
                    Add to Crochet Bag
                </button>
            </div>
        </div>
    `;
    }).join('');
}

// Quick Add to Cart from catalog cards
window.quickAddToCart = async (id) => {
    let product = allProducts.find(p => p.id === id);

    if (!product) {
        try {
            const docRef = doc(db, "products", id);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                product = { id: docSnap.id, ...docSnap.data() };
            }
        } catch (e) {
            console.error("Error fetching product for cart:", e);
        }
    }

    if (product) {
        const regularPrice = typeof product.price === 'number' ? product.price : parseFloat(product.price || 0);
        const hasOffer = product.offerPrice !== undefined && product.offerPrice !== null && !isNaN(product.offerPrice) && Number(product.offerPrice) > 0;
        const effectivePrice = hasOffer ? Number(product.offerPrice) : regularPrice;

        import('./cart.js').then(module => {
            module.addToCart({
                id: product.id,
                name: product.name,
                price: effectivePrice,
                image: product.image,
                color: product.color || '',
                type: product.type || ''
            }, 1);
        });
    }
};

// Load Product Detail
async function loadProductDetail(id) {
    try {
        let product = null;

        // Try Firestore first
        try {
            const docRef = doc(db, "products", id);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                product = { id: docSnap.id, ...docSnap.data() };
            }
        } catch (e) {
            console.warn("Firestore detail fetch error, checking sample items:", e);
        }

        if (!product) {
            const container = document.querySelector('.product-detail-container') || document.querySelector('.container');
            if (container) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 80px 20px; width: 100%;">
                        <h2 style="font-family: var(--font-heading); color: var(--text-dark); margin-bottom: 10px;">Piece Not Found</h2>
                        <p style="color: var(--text-light); margin-bottom: 25px;">This handcrafted piece may have been removed or does not exist.</p>
                        <a href="shop.html" class="btn">Explore Available Pieces</a>
                    </div>
                `;
            }
            return;
        }

        if (product) {
            currentProduct = product;

            const regularPrice = typeof product.price === 'number' ? product.price : parseFloat(product.price || 0);
            const hasOffer = product.offerPrice !== undefined && product.offerPrice !== null && !isNaN(product.offerPrice) && Number(product.offerPrice) > 0;
            const displayPrice = hasOffer ? Number(product.offerPrice) : regularPrice;

            // Handle Multiple Product Gallery Images
            const allImages = Array.isArray(product.images) && product.images.length > 0
                ? product.images
                : (product.image ? [product.image] : []);

            const mainImg = document.getElementById('main-image');
            if (mainImg) {
                mainImg.src = allImages[0] || 'https://via.placeholder.com/600x600?text=Crochet+Piece';
            }

            const thumbsContainer = document.getElementById('product-thumbnails');
            if (thumbsContainer) {
                if (allImages.length > 1) {
                    thumbsContainer.innerHTML = allImages.map((imgUrl, index) => `
                        <div class="thumb-tile ${index === 0 ? 'active' : ''}" onclick="window.selectProductImage('${imgUrl.replace(/'/g, "\\'")}', this)">
                            <img src="${imgUrl}" alt="${product.name} photo ${index + 1}">
                        </div>
                    `).join('');
                    thumbsContainer.style.display = 'flex';
                } else {
                    thumbsContainer.style.display = 'none';
                    thumbsContainer.innerHTML = '';
                }
            }

            document.getElementById('prod-name').innerText = product.name;

            if (hasOffer) {
                const discount = Math.round(((regularPrice - displayPrice) / regularPrice) * 100);
                document.getElementById('prod-price').innerHTML = `
                    <span class="current-price" style="font-size: 2rem; font-weight: 600; color: var(--text-dark);">₹${displayPrice.toFixed(2)}</span>
                    <span class="original-price" style="text-decoration: line-through; color: #999; font-size: 1.2rem; margin-left: 12px;">₹${regularPrice.toFixed(2)}</span>
                    ${discount > 0 ? `<span style="background: #e8f5e9; color: #2e7d32; font-size: 0.9rem; padding: 4px 10px; border-radius: 12px; margin-left: 12px; font-weight: 600;">${discount}% OFF</span>` : ''}
                `;
            } else {
                document.getElementById('prod-price').innerHTML = `<span class="current-price" style="font-size: 2rem; font-weight: 600; color: var(--text-dark);">₹${regularPrice.toFixed(2)}</span>`;
            }

            const catEl = document.getElementById('prod-cat');
            if (catEl) catEl.innerText = product.category || 'Handmade Crochet';

            const typeEl = document.getElementById('prod-type');
            const typeSep = document.getElementById('prod-type-sep');
            const typeBadge = document.getElementById('prod-type-badge');
            const typeGroup = document.getElementById('prod-type-group');

            if (product.type) {
                if (typeEl) { typeEl.innerText = product.type; typeEl.style.display = 'inline'; }
                if (typeSep) typeSep.style.display = 'inline';
                if (typeBadge) typeBadge.innerText = product.type;
                if (typeGroup) typeGroup.style.display = 'flex';
            } else {
                if (typeEl) typeEl.style.display = 'none';
                if (typeSep) typeSep.style.display = 'none';
                if (typeGroup) typeGroup.style.display = 'none';
            }

            const colorEl = document.getElementById('prod-color');
            const colorGroup = document.getElementById('prod-color-group');
            if (product.color) {
                if (colorEl) colorEl.innerHTML = `<i class="fa-solid fa-palette" style="color: var(--primary-sage-dark); margin-right:4px;"></i> ${product.color}`;
                if (colorGroup) colorGroup.style.display = 'flex';
            } else {
                if (colorGroup) colorGroup.style.display = 'none';
            }

            document.getElementById('prod-desc').innerText = product.description || "100% handcrafted crochet creation using soft, sustainable natural yarn. Hand wash gently in cool water and lay flat in shade to dry.";
        } else {
            document.getElementById('prod-name').innerText = "Crochet Creation Not Found";
        }
    } catch (error) {
        console.error("Error loading crochet detail:", error);
    }
}

export { fetchProducts, currentProduct, SAMPLE_CROCHET_PRODUCTS };
window.fetchProducts = fetchProducts;

window.selectProductImage = (url, thumbEl) => {
    const mainImg = document.getElementById('main-image');
    if (mainImg) {
        mainImg.style.opacity = '0.35';
        setTimeout(() => {
            mainImg.src = url;
            mainImg.style.opacity = '1';
        }, 120);
    }
    const allThumbs = document.querySelectorAll('.thumb-tile');
    allThumbs.forEach(t => t.classList.remove('active'));
    if (thumbEl) thumbEl.classList.add('active');
};

// Initial Load with Immediate Hydration & Safe DOM Hook
function initApp() {
    quickHydrateShop();
    fetchProducts();

    const params = new URLSearchParams(window.location.search);
    const productId = params.get('id');

    if (productId && document.getElementById('product-detail-area')) {
        loadProductDetail(productId);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
