/**
 * Prabhu Cards & Gifts — Main JavaScript
 */

(function () {
  'use strict';

  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const mobileMenu = document.getElementById('mobile-menu');
  const iconMenu = document.getElementById('icon-menu');
  const iconClose = document.getElementById('icon-close');
  const siteHeader = document.getElementById('site-header');
  const copyrightYear = document.getElementById('copyright-year');
  const contactForm = document.getElementById('contact-form');

  function setMenuOpen(isOpen) {
    if (!mobileMenuBtn || !mobileMenu) return;
    mobileMenu.classList.toggle('hidden', !isOpen);
    iconMenu?.classList.toggle('hidden', isOpen);
    iconClose?.classList.toggle('hidden', !isOpen);
    mobileMenuBtn.setAttribute('aria-expanded', String(isOpen));
    mobileMenuBtn.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
    document.body.style.overflow = isOpen ? 'hidden' : '';
  }

  mobileMenuBtn?.addEventListener('click', () => {
    setMenuOpen(mobileMenu?.classList.contains('hidden'));
  });

  document.querySelectorAll('.mobile-nav-link').forEach((link) => {
    link.addEventListener('click', () => setMenuOpen(false));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mobileMenu && !mobileMenu.classList.contains('hidden')) {
      setMenuOpen(false);
    }
  });

  function handleScroll() {
    if (!siteHeader) return;
    siteHeader.classList.toggle('is-scrolled', window.scrollY > 40);
  }

  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();

  if (copyrightYear) {
    copyrightYear.textContent = new Date().getFullYear();
  }

  const animatedElements = document.querySelectorAll('.fade-in, .category-card');

  if ('IntersectionObserver' in window && animatedElements.length) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -30px 0px' }
    );

    animatedElements.forEach((el, index) => {
      el.style.transitionDelay = `${(index % 8) * 70}ms`;
      observer.observe(el);
    });
  } else {
    animatedElements.forEach((el) => el.classList.add('is-visible'));
  }

  contactForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = contactForm.querySelector('button[type="submit"]');
    const statusEl = document.getElementById('form-status');
    const originalText = btn.textContent;
    const formData = new FormData(contactForm);

    const payload = {
      name: formData.get('name'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      message: formData.get('message'),
    };

    btn.textContent = 'Sending...';
    btn.disabled = true;
    btn.classList.add('opacity-75');

    if (statusEl) {
      statusEl.classList.add('hidden');
      statusEl.textContent = '';
    }

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Something went wrong. Please try again.');
      }

      btn.textContent = 'Message Sent!';
      if (statusEl) {
        statusEl.textContent = result.message;
        statusEl.className = 'mt-4 rounded-xl px-4 py-3 text-sm bg-green-50 text-green-700 border border-green-200';
      }

      contactForm.reset();

      setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
        btn.classList.remove('opacity-75');
      }, 3000);
    } catch (err) {
      btn.textContent = originalText;
      btn.disabled = false;
      btn.classList.remove('opacity-75');

      if (statusEl) {
        statusEl.textContent = err.message;
        statusEl.className = 'mt-4 rounded-xl px-4 py-3 text-sm bg-red-50 text-red-700 border border-red-200';
      }
    }
  });

  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href');
      if (targetId === '#') return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        const headerOffset = 80;
        const top = target.getBoundingClientRect().top + window.scrollY - headerOffset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });
})();
