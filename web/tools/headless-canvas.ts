// Lets the track scene build under node, with no browser and no WebGL: the scene's geometry is
// plain three.js, and only its procedural textures paint on a 2D canvas. This stands in a canvas
// whose context accepts every call and paints nothing (pixel reads come back blank), so the
// painters run their real code and the geometry comes out exactly as the game builds it.
// Import it before anything from src/render.

const blank = (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h, colorSpace: 'srgb' });

function context2d(canvas: { width: number; height: number }): CanvasRenderingContext2D {
  const fields: Record<string | symbol, unknown> = { canvas };
  const calls: Record<string, (...a: never[]) => unknown> = {
    getImageData: (_x: number, _y: number, w: number, h: number) => blank(w, h),
    createImageData: (w: number | ImageData, h?: number) => (typeof w === 'number' ? blank(w, h ?? w) : blank(w.width, w.height)),
    measureText: (text: string) => ({ width: text.length * 8 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createConicGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({ setTransform() {} }),
  };
  const proxy = new Proxy(fields, {
    get: (t, k) => (k in t ? t[k] : typeof k === 'string' && k in calls ? calls[k] : () => undefined),
    set: (t, k, v) => {
      t[k] = v;
      return true;
    },
  });
  return proxy as unknown as CanvasRenderingContext2D;
}

const g = globalThis as unknown as Record<string, unknown>;
if (g.document !== undefined) throw new Error('headless-canvas: a document already exists (this is for node only)');
g.document = {
  createElement(tag: string) {
    if (tag !== 'canvas') throw new Error(`headless-canvas: no <${tag}> outside a browser`);
    const canvas = { width: 1, height: 1, style: {}, getContext: (kind: string) => (kind === '2d' ? ctx : null) };
    const ctx = context2d(canvas);
    return canvas;
  },
};
g.window = globalThis;
g.Path2D = class {
  moveTo() {}
  lineTo() {}
  closePath() {}
  arc() {}
  rect() {}
  quadraticCurveTo() {}
  bezierCurveTo() {}
};
