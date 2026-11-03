// Universal Mobile Navigation Drawer Handler

function ensureMobileNavItems(navMenu) {
    if (navMenu.querySelector('.mobile-only-nav')) return;

    // Find the desktop Shop link li
    let shopLi = null;
    const allLis = navMenu.querySelectorAll('li');
    allLis.forEach(li => {
        const link = li.querySelector('a');
        if (link && link.textContent.trim().toLowerCase() === 'shop') {
            shopLi = li;
        }
    });

    if (shopLi) {
        shopLi.classList.add('desktop-only-nav');
    }

    const mobileHtml = `
        <li class="mobile-only-nav">
            <a href="shop.html?sort=newest" class="nav-link nav-highlight-link">
                <span><i class="fa-solid fa-sparkles" style="color:var(--primary-sage-dark); margin-right: 8px;"></i>New Arrivals</span>
                <span class="nav-badge-new">NEW</span>
            </a>
        </li>
        <li class="mobile-only-nav nav-accordion-item">
            <button type="button" class="nav-accordion-btn" aria-expanded="false">
                <span><i class="fa-solid fa-bag-shopping" style="color:var(--primary-sage-dark); margin-right: 8px;"></i>Shop</span>
                <i class="fa-solid fa-chevron-down nav-chevron"></i>
            </button>
            <div class="nav-submenu">
                <a href="shop.html" class="sub-link">
                    <i class="fa-solid fa-border-all"></i> Shop All
                </a>
                <div class="sub-category-group">
                    <span class="sub-category-title">Shop by Category</span>
                    <div class="sub-category-grid">
                        <a href="shop.html?category=Crochet Tops" class="sub-cat-pill">Tops</a>
                        <a href="shop.html?category=Crochet Dresses" class="sub-cat-pill">Dresses</a>
                        <a href="shop.html?category=Granny Square" class="sub-cat-pill">Granny Square</a>
                        <a href="shop.html?category=Crochet Bags" class="sub-cat-pill">Bags & Totes</a>
                        <a href="shop.html?category=Crochet Accessories" class="sub-cat-pill">Accessories</a>
                    </div>
                </div>
                <div class="sub-category-group">
                    <span class="sub-category-title">Collections</span>
                    <div class="sub-category-grid">
                        <a href="shop.html?type=Summer Mesh" class="sub-cat-pill">Summer Mesh</a>
                        <a href="shop.html?type=Hand-Hooked Classic" class="sub-cat-pill">Hand-Hooked Classic</a>
                        <a href="shop.html?type=Ribbed Crochet" class="sub-cat-pill">Ribbed Crochet</a>
                    </div>
                </div>
            </div>
        </li>
        <li class="mobile-only-nav nav-accordion-item">
            <button type="button" class="nav-accordion-btn" aria-expanded="false">
                <span><i class="fa-solid fa-book-open" style="color:var(--primary-sage-dark); margin-right: 8px;"></i>Journal</span>
                <i class="fa-solid fa-chevron-down nav-chevron"></i>
            </button>
            <div class="nav-submenu">
                <a href="about.html#what-is-crochet" class="sub-link">
                    <i class="fa-solid fa-feather-pointed"></i> What is Crochet?
                </a>
            </div>
        </li>
    `;

    if (shopLi) {
        shopLi.insertAdjacentHTML('afterend', mobileHtml);
    } else {
        const homeLi = navMenu.querySelector('li:nth-child(2)');
        if (homeLi) {
            homeLi.insertAdjacentHTML('afterend', mobileHtml);
        } else {
            navMenu.insertAdjacentHTML('beforeend', mobileHtml);
        }
    }
}

function initMobileNav() {
    const navToggle = document.getElementById('nav-toggle');
    const navMenu = document.getElementById('nav-menu');
    const navClose = document.getElementById('nav-close-btn');
    const navBackdrop = document.getElementById('nav-backdrop');

    if (!navToggle || !navMenu) return;

    // Inject mobile-only navigation sections if not already present in static HTML
    ensureMobileNavItems(navMenu);

    function openNav() {
        navMenu.classList.add('active');
        if (navBackdrop) navBackdrop.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeNav() {
        navMenu.classList.remove('active');
        if (navBackdrop) navBackdrop.classList.remove('active');
        document.body.style.overflow = '';
    }

    // Hamburger button toggle
    navToggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openNav();
    });

    // Close button
    if (navClose) {
        navClose.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeNav();
        });
    }

    // Backdrop click
    if (navBackdrop) {
        navBackdrop.addEventListener('click', (e) => {
            e.preventDefault();
            closeNav();
        });
    }

    // Prevent clicks inside drawer from reaching backdrop
    navMenu.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Accordion toggle handler for mobile submenus
    navMenu.querySelectorAll('.nav-accordion-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const submenu = btn.nextElementSibling;
            const isOpen = btn.classList.contains('open');

            // Close other accordions for neat accordions
            navMenu.querySelectorAll('.nav-accordion-btn').forEach(otherBtn => {
                if (otherBtn !== btn) {
                    otherBtn.classList.remove('open');
                    otherBtn.setAttribute('aria-expanded', 'false');
                    if (otherBtn.nextElementSibling) {
                        otherBtn.nextElementSibling.classList.remove('open');
                    }
                }
            });

            if (isOpen) {
                btn.classList.remove('open');
                btn.setAttribute('aria-expanded', 'false');
                if (submenu) submenu.classList.remove('open');
            } else {
                btn.classList.add('open');
                btn.setAttribute('aria-expanded', 'true');
                if (submenu) submenu.classList.add('open');
            }
        });
    });

    // Destination navigation links: close the drawer on click
    navMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            closeNav();
        });
    });

    // ESC key closes drawer
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && navMenu.classList.contains('active')) {
            closeNav();
        }
    });
}

// Seamless Endless Wave Text Marquee Animation
function initWaveTextAnimation() {
    const waveSVGs = document.querySelectorAll('.hero-wave-svg');
    if (!waveSVGs.length) return;

    waveSVGs.forEach(svg => {
        const textPath = svg.querySelector('textPath');
        if (!textPath) return;

        const unit = textPath.querySelector('.wave-unit');
        if (!unit) return;

        let unitLen = 0;

        function measure() {
            try {
                const len = unit.getComputedTextLength();
                if (len && len > 50) {
                    unitLen = len;
                }
            } catch (err) {}
        }

        measure();
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(measure);
        }
        window.addEventListener('resize', measure);

        // Fallback default length if font hasn't rendered yet
        if (!unitLen) {
            unitLen = svg.classList.contains('hero-wave-mobile') ? 420 : 570;
        }

        let offset = 0;
        let lastTime = performance.now();
        // Calibrated speed in SVG coordinates per second
        const speed = svg.classList.contains('hero-wave-mobile') ? 30 : 38;

        function loop(now) {
            // Only update when SVG is rendered / visible
            if (svg.offsetParent !== null) {
                const dt = Math.min((now - lastTime) / 1000, 0.1);
                lastTime = now;

                if (!unitLen || unitLen < 50) {
                    measure();
                }

                if (unitLen > 50) {
                    offset -= speed * dt;
                    if (offset <= -unitLen) {
                        offset += unitLen;
                    }
                    textPath.setAttribute('startOffset', offset.toFixed(2));
                }
            } else {
                lastTime = now;
            }

            requestAnimationFrame(loop);
        }

        requestAnimationFrame(loop);
    });
}

function initAll() {
    initMobileNav();
    initWaveTextAnimation();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
} else {
    initAll();
}
