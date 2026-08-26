// FlowDynamicsAgency — main.js
// Navigation behavior: scrolled state, mobile menu toggle, active link.

(function () {
  const nav = document.querySelector('.nav');
  const toggle = document.querySelector('.nav-toggle');
  const mobileMenu = document.querySelector('.mobile-menu');

  function onScroll() {
    if (!nav) return;
    nav.classList.toggle('scrolled', window.scrollY > 12);
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  if (toggle && mobileMenu) {
    toggle.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.toggle('open');
      document.body.classList.toggle('menu-open', isOpen);
      toggle.setAttribute('aria-expanded', String(isOpen));
    });

    mobileMenu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('open');
        document.body.classList.remove('menu-open');
      });
    });
  }

  // Mark the current page's nav link as active.
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a, .mobile-menu a').forEach((link) => {
    const href = link.getAttribute('href') || '';
    if (href === path || (path === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });

  // Contact form: build a pre-filled WhatsApp message instead of a server submission (static site, no backend).
  const contactForm = document.querySelector('.contact-form[data-whatsapp-number]');
  if (contactForm) {
    contactForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const number = contactForm.dataset.whatsappNumber;
      const get = (name) => (contactForm.elements[name]?.value || '').trim();

      const lines = [
        'Nouvelle demande de projet — FlowDynamicsAgency',
        `Nom : ${get('name')}`,
      ];
      const company = get('company');
      if (company) lines.push(`Entreprise / Boutique : ${company}`);
      const whatsappNumber = get('whatsapp-number');
      if (whatsappNumber) lines.push(`Numéro WhatsApp : ${whatsappNumber}`);
      lines.push(`Type de projet : ${get('need')}`);
      lines.push(`Message : ${get('message')}`);

      const text = encodeURIComponent(lines.join('\n'));
      window.open(`https://wa.me/${number}?text=${text}`, '_blank', 'noopener');

      const note = contactForm.querySelector('.form-note');
      if (note) note.style.display = 'block';
      contactForm.reset();
    });
  }
})();
