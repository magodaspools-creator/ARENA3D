// Keyboard + mouse state. `wasPressed` is true only on the frame the key went down.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { x: 0, y: 0, ndcX: 0, ndcY: 0, left: false, right: false, leftPressed: false, onCanvas: false };
    this.wheel = 0;
    this.dragDX = 0;
    // Mobile controls are additive: desktop keyboard/mouse input remains unchanged.
    this.touch = { moveX: 0, moveY: 0, attack: false, abilityPressed: false, dashPressed: false, lightPressed: false };
    this.cameraTouch = { id: null, x: 0, y: 0 };

    addEventListener('keydown', (e) => {
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) this.mouse.right = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.onCanvas = true;
      this.mouse.ndcX = (e.clientX / innerWidth) * 2 - 1;
      this.mouse.ndcY = -(e.clientY / innerHeight) * 2 + 1;
      if (this.mouse.right) this.dragDX += e.movementX;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // --- mobile touch layer ---
    const controls = document.getElementById('mobile-controls');
    const joystick = document.getElementById('mobile-joystick');
    const stick = document.getElementById('mobile-stick');
    const attack = document.getElementById('mobile-attack');
    const ability = document.getElementById('mobile-ability');
    const dash = document.getElementById('mobile-dash');
    const light = document.getElementById('mobile-light');

    const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    if (isTouchDevice) {
      document.body.classList.add('touch-device');
      const updateOrientation = () => {
        document.body.classList.toggle('portrait-mobile', innerHeight > innerWidth);
      };
      updateOrientation();
      addEventListener('resize', updateOrientation, { passive: true });
      addEventListener('orientationchange', updateOrientation, { passive: true });
    }

    if (controls && joystick && stick) {
      let joyId = null;
      const max = 42;
      const resetJoy = () => {
        joyId = null;
        this.touch.moveX = 0;
        this.touch.moveY = 0;
        stick.style.transform = 'translate(-50%, -50%)';
      };
      joystick.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        joyId = t.identifier;
      }, { passive: false });
      joystick.addEventListener('touchmove', (e) => {
        if (joyId === null) return;
        e.preventDefault();
        const t = [...e.changedTouches].find(x => x.identifier === joyId);
        if (!t) return;
        const r = joystick.getBoundingClientRect();
        let dx = t.clientX - (r.left + r.width / 2);
        let dy = t.clientY - (r.top + r.height / 2);
        const len = Math.hypot(dx, dy);
        if (len > max) { dx *= max / len; dy *= max / len; }
        this.touch.moveX = dx / max;
        this.touch.moveY = -dy / max;
        stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      }, { passive: false });
      joystick.addEventListener('touchend', resetJoy, { passive: false });
      joystick.addEventListener('touchcancel', resetJoy, { passive: false });

      const hold = (el, key) => {
        el?.addEventListener('touchstart', (e) => {
          e.preventDefault();
          this.touch[key] = true;
        }, { passive: false });
        el?.addEventListener('touchend', (e) => {
          e.preventDefault();
          if (key === 'attack') this.touch.attack = false;
        }, { passive: false });
        el?.addEventListener('touchcancel', () => {
          if (key === 'attack') this.touch.attack = false;
        }, { passive: false });
      };
      hold(attack, 'attack');
      const press = (el, key) => el?.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.touch[key] = true;
      }, { passive: false });
      press(ability, 'abilityPressed');
      press(dash, 'dashPressed');
      press(light, 'lightPressed');
    }


    // Camera swipe: only starts outside the mobile control overlay.
    const isControlTouch = (target) => target instanceof Element && !!target.closest('#mobile-controls');
    document.addEventListener('touchstart', (e) => {
      const t = [...e.changedTouches].find(x => !isControlTouch(e.target));
      if (!t || this.cameraTouch.id !== null) return;
      this.cameraTouch.id = t.identifier;
      this.cameraTouch.x = t.clientX;
      this.cameraTouch.y = t.clientY;
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
      if (this.cameraTouch.id === null) return;
      const t = [...e.changedTouches].find(x => x.identifier === this.cameraTouch.id);
      if (!t) return;
      this.dragDX += t.clientX - this.cameraTouch.x;
      this.cameraTouch.x = t.clientX;
      this.cameraTouch.y = t.clientY;
    }, { passive: true });
    const endCameraTouch = (e) => {
      if ([...e.changedTouches].some(t => t.identifier === this.cameraTouch.id)) {
        this.cameraTouch.id = null;
      }
    };
    document.addEventListener('touchend', endCameraTouch, { passive: true });
    document.addEventListener('touchcancel', endCameraTouch, { passive: true });
    canvas.addEventListener('wheel', (e) => { this.wheel += e.deltaY; e.preventDefault(); }, { passive: false });
  }
  down(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  endFrame() {
    this.pressed.clear();
    this.mouse.leftPressed = false;
    this.wheel = 0;
    this.dragDX = 0;
    this.touch.abilityPressed = false;
    this.touch.dashPressed = false;
    this.touch.lightPressed = false;
  }
}
