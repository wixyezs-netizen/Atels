(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  document.querySelectorAll('.reveal').forEach((el, i) => {
    el.style.transitionDelay = `${Math.min(i * 0.06, 0.4)}s`;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add('reveal--visible');
            obs.unobserve(en.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -30px 0px' }
    );
    obs.observe(el);
  });

  const header = document.getElementById('header');
  const burger = document.getElementById('burger');
  const nav = document.getElementById('nav');
  const year = document.getElementById('year');
  const form = document.getElementById('booking-form');

  if (year) year.textContent = new Date().getFullYear();

  window.addEventListener('scroll', () => {
    header.classList.toggle('header--scrolled', window.scrollY > 60);
  });

  burger?.addEventListener('click', () => {
    nav.classList.toggle('nav--open');
    document.body.style.overflow = nav.classList.contains('nav--open') ? 'hidden' : '';
  });

  nav?.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      nav.classList.remove('nav--open');
      document.body.style.overflow = '';
    });
  });

  const reviews = document.querySelectorAll('.review');
  const dots = document.querySelectorAll('#review-dots button');
  let idx = 0;

  function showReview(i) {
    reviews.forEach((r, j) => r.classList.toggle('review--active', j === i));
    dots.forEach((d, j) => d.classList.toggle('active', j === i));
    idx = i;
  }

  dots.forEach((btn, i) => btn.addEventListener('click', () => showReview(i)));
  if (reviews.length) {
    setInterval(() => showReview((idx + 1) % reviews.length), 6000);
  }
})();
