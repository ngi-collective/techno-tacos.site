// Phone and tablet controls: a stick to walk, a drag anywhere else to look, and buttons in place of the keyboard.

const STICK_RADIUS = 48;
const STICK_DEADZONE = 0.12;
const RUN_REACH = 1.3; // Pulling the stick this far past its edge means run.
const LOOK_PER_PIXEL = 0.004;
const MAX_PITCH = 1.45;
const WIDEST_FOV = 90;
const SLOW_FRAME_SECONDS = 1 / 24;
const PIXEL_RATIO_STEP = 0.8;
const LOWEST_PIXEL_RATIO = 0.75;

export const TOUCH_BUTTONS = [
  ['KeyT', 'Tunnel'], ['KeyH', 'Tide'], ['KeyL', 'Lid'], ['KeyB', 'Size'], ['KeyF', 'Ride'],
  ['KeyN', 'Skip'], ['KeyR', 'Replay'], ['Minus', 'Slower'], ['Equal', 'Faster'],
];

// Pure: stick offset in pixels to walking input. Up the screen is forward.
export const stickInput = (dx, dy, radius = STICK_RADIUS) => {
  const distance = Math.hypot(dx, dy);
  const amount = Math.min(1, distance / radius);
  if (amount < STICK_DEADZONE) return { forward: 0, strafe: 0, run: false };
  return { forward: (-dy / distance) * amount, strafe: (dx / distance) * amount, run: distance >= radius * RUN_REACH };
};

// Pure: dragging points the view the way the finger moves, so dragging right looks right and dragging up looks up.
export const lookAfterDrag = ({ yaw, pitch }, dx, dy, perPixel = LOOK_PER_PIXEL) => ({
  yaw: yaw - dx * perPixel,
  pitch: Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch - dy * perPixel)),
});

// Pure: vertical field of view that keeps enough beach in frame when a phone stands upright.
export const fovForAspect = (aspect, landscapeFov = 65) => {
  if (aspect >= 1) return landscapeFov;
  const halfWidth = Math.tan((landscapeFov * Math.PI) / 360);
  return Math.min(WIDEST_FOV, (Math.atan(halfWidth / aspect) * 360) / Math.PI);
};

// Pure: drops the render resolution when frames run slow, and never raises it, so the picture does not keep changing.
export const nextPixelRatio = (current, averageFrameSeconds) =>
  (averageFrameSeconds > SLOW_FRAME_SECONDS ? Math.max(LOWEST_PIXEL_RATIO, current * PIXEL_RATIO_STEP) : current);

const trackDrag = (element, { onStart, onMove, onEnd }) => {
  let id = null;
  const finish = (event) => {
    if (event.pointerId !== id) return;
    id = null;
    onEnd();
  };
  element.addEventListener('pointerdown', (event) => {
    if (id !== null) return;
    id = event.pointerId;
    element.setPointerCapture(id);
    onStart(event);
  });
  element.addEventListener('pointermove', (event) => { if (event.pointerId === id) onMove(event); });
  element.addEventListener('pointerup', finish);
  element.addEventListener('pointercancel', finish);
};

export const createTouchControls = ({ root, surface, onButton }) => {
  root.innerHTML = `
    <div id="stick"><div id="knob"></div></div>
    <div id="buttons">
      ${TOUCH_BUTTONS.map(([code, label]) => `<button type="button" data-code="${code}">${label}</button>`).join('')}
      <span id="speed"></span>
    </div>`;
  const stick = root.querySelector('#stick');
  const knob = root.querySelector('#knob');
  const buttons = new Map([...root.querySelectorAll('button')].map((button) => [button.dataset.code, button]));
  buttons.forEach((button, code) => button.addEventListener('click', () => onButton(code)));

  let walking = stickInput(0, 0);
  let center = { x: 0, y: 0 };
  const moveStick = ({ clientX, clientY }) => {
    const [dx, dy] = [clientX - center.x, clientY - center.y];
    walking = stickInput(dx, dy);
    const shown = Math.min(1, STICK_RADIUS / Math.max(1, Math.hypot(dx, dy)));
    knob.style.transform = `translate(${dx * shown}px, ${dy * shown}px)`;
  };
  trackDrag(stick, {
    onStart: (event) => {
      const box = stick.getBoundingClientRect();
      center = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      moveStick(event);
    },
    onMove: moveStick,
    onEnd: () => {
      walking = stickInput(0, 0);
      knob.style.transform = '';
    },
  });

  let lookHandler = () => {};
  let last = { x: 0, y: 0 };
  trackDrag(surface, {
    onStart: ({ clientX, clientY }) => { last = { x: clientX, y: clientY }; },
    onMove: ({ clientX, clientY }) => {
      lookHandler(clientX - last.x, clientY - last.y);
      last = { x: clientX, y: clientY };
    },
    onEnd: () => {},
  });

  return {
    input: () => walking,
    onLook: (handler) => { lookHandler = handler; },
    setActive: (code, active) => buttons.get(code)?.classList.toggle('active', active),
    setWalkable: (walkable) => { stick.classList.toggle('off', !walkable); },
  };
};
