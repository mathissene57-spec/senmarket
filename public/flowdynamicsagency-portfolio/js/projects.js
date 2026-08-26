// FlowDynamicsAgency — projects.js
// Subtle hover tilt on immersive project cards and mini realisation cards.
// Purely decorative; disabled for touch/coarse pointers and reduced motion.

(function () {
  const supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!supportsHover || reduceMotion) return;

  const tiltTargets = document.querySelectorAll('.project-shot, .mini-swatch');

  tiltTargets.forEach((el) => {
    let frame = null;

    el.addEventListener('mousemove', (e) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;

      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        el.style.transform = `perspective(700px) rotateX(${(-y * 6).toFixed(2)}deg) rotateY(${(x * 6).toFixed(2)}deg)`;
      });
    });

    el.addEventListener('mouseleave', () => {
      if (frame) cancelAnimationFrame(frame);
      el.style.transform = 'perspective(700px) rotateX(0deg) rotateY(0deg)';
    });
  });
})();
