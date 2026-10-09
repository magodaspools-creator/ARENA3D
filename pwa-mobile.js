(() => {
  const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  if (!isTouch) return;

  document.documentElement.classList.add('has-touch-controls');
  const root = document.getElementById('touch-controls');
  const joystick = document.getElementById('touch-joystick');
  const stick = document.getElementById('touch-stick');
  if (!root || !joystick || !stick) return;

  const active = new Set();
  const directions = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
  let joyPointer = null;
  let joyX = 0, joyY = 0;

  function setKey(code, down) {
    if (down) {
      if (!active.has(code)) {
        active.add(code);
        window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code === 'Space' ? ' ' : code, bubbles: true, cancelable: true }));
      }
    } else if (active.has(code)) {
      active.delete(code);
      window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code === 'Space' ? ' ' : code, bubbles: true, cancelable: true }));
    }
  }
  function clearDirections() { directions.forEach((key) => setKey(key, false)); }
  function updateDirections() {
    const dead = 0.23;
    setKey('KeyW', joyY < -dead);
    setKey('KeyS', joyY > dead);
    setKey('KeyA', joyX < -dead);
    setKey('KeyD', joyX > dead);
    const max = 34;
    stick.style.transform = 'translate(' + (joyX * max) + 'px,' + (joyY * max) + 'px)';
  }
  function moveJoystick(event) {
    const rect = joystick.getBoundingClientRect();
    const radius = Math.min(rect.width, rect.height) * 0.34;
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const length = Math.hypot(dx, dy);
    const scale = length > radius ? radius / length : 1;
    joyX = dx * scale / radius;
    joyY = dy * scale / radius;
    updateDirections();
  }
  joystick.addEventListener('pointerdown', (event) => {
    if (joyPointer !== null) return;
    event.preventDefault();
    joyPointer = event.pointerId;
    joystick.setPointerCapture(event.pointerId);
    moveJoystick(event);
  });
  joystick.addEventListener('pointermove', (event) => {
    if (event.pointerId === joyPointer) { event.preventDefault(); moveJoystick(event); }
  });
  const releaseJoystick = (event) => {
    if (event.pointerId !== joyPointer) return;
    joyPointer = null; joyX = joyY = 0; clearDirections();
    stick.style.transform = 'translate(0,0)';
  };
  joystick.addEventListener('pointerup', releaseJoystick);
  joystick.addEventListener('pointercancel', releaseJoystick);
  joystick.addEventListener('lostpointercapture', releaseJoystick);

  root.querySelectorAll('[data-key]').forEach((button) => {
    const key = button.dataset.key;
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.classList.add('pressed');
      if (key === 'Space' || key === 'KeyQ' || key === 'ShiftLeft' || key === 'KeyR' || key === 'KeyE') {
        // Combat actions are triggered by the game's existing keyboard input handlers.
        setKey(key, true);
        if (key !== 'ShiftLeft') setKey(key, false);
      }
    });
    const release = (event) => { event.preventDefault(); button.classList.remove('pressed'); setKey(key, false); };
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    button.addEventListener('contextmenu', (event) => event.preventDefault());
  });

  // Touch devices should not select game text, zoom the canvas, or open the
  // long-press context menu. Form controls and dialogs remain usable.
  document.addEventListener('contextmenu', (event) => {
    if (event.target.closest('#game, #touch-controls, #ui')) event.preventDefault();
  });
  document.addEventListener('selectstart', (event) => {
    if (event.target.closest('#game, #touch-controls')) event.preventDefault();
  });
  document.addEventListener('gesturestart', (event) => event.preventDefault(), { passive: false });
  document.addEventListener('touchmove', (event) => {
    if (event.target.closest('#game, #touch-controls')) event.preventDefault();
  }, { passive: false });
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (event) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300 && event.target.closest('#game, #touch-controls')) event.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });

  // Show controls only during active gameplay, not over menus or dialogs.
  const refreshVisibility = () => {
    const hud = document.getElementById('hud');
    const menu = document.getElementById('main-menu');
    const select = document.getElementById('select');
    const playing = hud && !hud.classList.contains('hidden') &&
      (!menu || menu.classList.contains('hidden')) &&
      (!select || select.classList.contains('hidden'));
    root.classList.toggle('touch-playing', !!playing);
  };
  const observer = new MutationObserver(refreshVisibility);
  ['hud', 'main-menu', 'select', 'pause', 'inventory', 'shop', 'forge', 'world-map', 'profile'].forEach((id) => {
    const node = document.getElementById(id);
    if (node) observer.observe(node, { attributes: true, attributeFilter: ['class'] });
  });
  refreshVisibility();
  window.addEventListener('blur', () => {
    [...active].forEach((key) => setKey(key, false));
    clearDirections();
  });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch((error) => console.warn('[PWA] Service worker registration failed:', error)));
  }
})();