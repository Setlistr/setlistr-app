// setlistr-components.js — shared nav, footer, and utilities

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/product', label: 'Product' },
  { href: '/estimator', label: 'Estimator' },
  { href: '/investor', label: 'Investors' },
];

function renderNav(activePage = '') {
  const links = NAV_LINKS.map(l =>
    `<li><a href="${l.href}"${activePage === l.label ? ' class="active"' : ''}>${l.label}</a></li>`
  ).join('');
  document.getElementById('nav-placeholder').innerHTML = `
<nav class="nav">
  <a href="/" class="nav-logo">
    <div class="nav-mark"><span></span><span></span><span></span><span></span></div>
    <span class="nav-wordmark">SETLISTR<em>.ai</em></span>
  </a>
  <ul class="nav-links">${links}</ul>
  <a href="/estimator" class="btn btn-primary" style="padding:9px 20px;font-size:12px;">Calculate Royalties →</a>
</nav>`;
}

function renderFooter() {
  document.getElementById('footer-placeholder').innerHTML = `
<footer class="footer">
  <div class="footer-inner">
    <div class="footer-brand">
      <div class="footer-logo">
        <div class="nav-mark footer-mark"><span></span><span></span><span></span><span></span></div>
        <span class="footer-wordmark">SETLISTR<em>.ai</em></span>
      </div>
      <p class="footer-tagline">Performance royalty infrastructure for live music.</p>
    </div>
    <div class="footer-col">
      <h4>Platform</h4>
      <a href="/product">How It Works</a>
      <a href="/estimator">Royalty Estimator</a>
      <a href="/registry">Registry</a>
    </div>
    <div class="footer-col">
      <h4>Company</h4>
      <a href="/about">About</a>
      <a href="/investor">Investors</a>
      <a href="mailto:hello@setlistr.ai">Contact</a>
    </div>
    <div class="footer-col">
      <h4>For</h4>
      <a href="#">Songwriters</a>
      <a href="#">Managers</a>
      <a href="#">Publishers</a>
      <a href="#">Venues</a>
    </div>
  </div>
  <div class="footer-bottom">
    <span>© 2026 Setlistr Inc. All rights reserved.</span>
    <span>Nashville, TN</span>
  </div>
</footer>`;
}

// Waitlist form handler — stores locally until email service connected
function initWaitlistForm(formId, successId) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    const email = form.querySelector('input[type="email"]').value;
    if (!email) return;
    // Store locally
    const existing = JSON.parse(localStorage.getItem('sl_waitlist') || '[]');
    if (!existing.includes(email)) {
      existing.push(email);
      localStorage.setItem('sl_waitlist', JSON.stringify(existing));
    }
    form.style.display = 'none';
    const success = document.getElementById(successId);
    if (success) success.style.display = 'block';
    // TODO: Replace with Mailchimp/Beehiiv API call when ready
    console.log('Waitlist signup:', email);
  });
}

// Intersection observer for scroll animations
function initScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(el => {
      if (el.isIntersecting) {
        el.target.style.opacity = '1';
        el.target.style.transform = 'translateY(0)';
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.scroll-reveal').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(32px)';
    el.style.transition = 'opacity 0.7s ease, transform 0.7s ease';
    observer.observe(el);
  });
}

document.addEventListener('DOMContentLoaded', initScrollAnimations);
