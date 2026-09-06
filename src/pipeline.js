export async function readImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      resolve({ canvas, ctx, width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = reject;
    img.src = src;
  });
}

function buildMask(data, width, height, alphaThreshold) {
  const n = width * height;
  const hasAlpha = data.some((v, i) => i % 4 === 3 && v < 255);
  if (hasAlpha) {
    const mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      mask[i] = data[i * 4 + 3] > alphaThreshold ? 1 : 0;
    }
    return mask;
  }

  // No transparency: treat the dominant border color as background.
  const counts = new Map();
  const border = [];
  for (let x = 0; x < width; x++) border.push(x, 0, x, height - 1);
  for (let y = 1; y < height - 1; y++) border.push(0, y, width - 1, y);
  for (let k = 0; k < border.length; k += 2) {
    const i = (border[k + 1] * width + border[k]) * 4;
    const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let best = null;
  let bestCount = -1;
  for (const [key, c] of counts) {
    if (c > bestCount) {
      bestCount = c;
      best = key.split(",").map(Number);
    }
  }
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const dr = data[i * 4] - best[0];
    const dg = data[i * 4 + 1] - best[1];
    const db = data[i * 4 + 2] - best[2];
    mask[i] = dr * dr + dg * dg + db * db > 1200 ? 1 : 0;
  }
  return mask;
}

export function detectParts(imageData, { alphaThreshold = 8, minArea = 8 } = {}) {
  const { data, width, height } = imageData;
  const n = width * height;
  const mask = buildMask(data, width, height, alphaThreshold);
  const visited = new Uint8Array(n);
  const parts = [];

  for (let start = 0; start < n; start++) {
    if (!mask[start] || visited[start]) continue;
    const stack = [start];
    visited[start] = 1;
    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let sumX = 0;
    let sumY = 0;
    const pixels = [];

    while (stack.length) {
      const idx = stack.pop();
      const x = idx % width;
      const y = (idx / width) | 0;
      area++;
      pixels.push(idx);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      sumX += x;
      sumY += y;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const nIdx = ny * width + nx;
          if (mask[nIdx] && !visited[nIdx]) {
            visited[nIdx] = 1;
            stack.push(nIdx);
          }
        }
      }
    }

    if (area >= minArea) {
      parts.push({
        id: parts.length + 1,
        bbox: [minX, minY, maxX + 1, maxY + 1],
        area,
        cx: sumX / area,
        cy: sumY / area,
        pixels: new Uint32Array(pixels),
      });
    }
  }
  return { parts, mask };
}

function balance(parts, count) {
  const groups = Array.from({ length: count }, () => []);
  const loads = new Array(count).fill(0);
  const sorted = [...parts].sort((a, b) => b.area - a.area);
  for (const p of sorted) {
    let k = 0;
    for (let i = 1; i < count; i++) if (loads[i] < loads[k]) k = i;
    groups[k].push(p);
    loads[k] += p.area;
  }
  return groups;
}

function countBalance(parts, count) {
  const groups = Array.from({ length: count }, () => []);
  const sizes = new Array(count).fill(0);
  const sorted = [...parts].sort((a, b) => b.area - a.area);
  for (const p of sorted) {
    let k = 0;
    for (let i = 1; i < count; i++) if (sizes[i] < sizes[k]) k = i;
    groups[k].push(p);
    sizes[k] += 1;
  }
  return groups;
}

function bands(parts, count, axis) {
  const key = axis === "x" ? "cx" : "cy";
  const ordered = [...parts].sort((a, b) => a[key] - b[key]);
  const groups = Array.from({ length: count }, () => []);
  ordered.forEach((p, i) => groups[Math.floor((i * count) / ordered.length)].push(p));
  return groups;
}

export function groupParts(parts, count, mode, axis) {
  if (mode === "bands") return bands(parts, count, axis);
  if (mode === "count") return countBalance(parts, count);
  return balance(parts, count);
}

export function contentBBox(imageData) {
  const { data, width, height } = imageData;
  let hasAlpha = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) {
      hasAlpha = true;
      break;
    }
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  const update = (x, y) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  if (hasAlpha) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 8) update(x, y);
      }
    }
  } else {
    const counts = new Map();
    const border = [];
    for (let x = 0; x < width; x++) border.push(x, 0, x, height - 1);
    for (let y = 1; y < height - 1; y++) border.push(0, y, width - 1, y);
    for (let k = 0; k < border.length; k += 2) {
      const i = (border[k + 1] * width + border[k]) * 4;
      const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    let best = null;
    let bestCount = -1;
    for (const [key, c] of counts) {
      if (c > bestCount) {
        bestCount = c;
        best = key.split(",").map(Number);
      }
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const dr = data[i] - best[0];
        const dg = data[i + 1] - best[1];
        const db = data[i + 2] - best[2];
        if (dr * dr + dg * dg + db * db > 1200) update(x, y);
      }
    }
  }

  if (maxX < 0) return [0, 0, width, height];
  return [minX, minY, maxX + 1, maxY + 1];
}

export function packRects(items, gap = 0, rotate = false, options = {}) {
  const list = items.map((it, i) => ({
    i,
    w: Math.max(1, it.w),
    h: Math.max(1, it.h),
  }));
  if (!list.length) return { placements: [], width: 0, height: 0 };

  const gapValue = Math.max(0, Number(gap) || 0);
  const square = options.square !== false;
  const stretchThreshold = Math.max(1, Number(options.stretchThreshold) || 2);
  const normal = bestPack(list, gapValue, false, square);
  if (!rotate) {
    return square ? normalizeSquare(normal, stretchThreshold) : plainPack(normal);
  }
  const rotated = bestPack(list, gapValue, true, square);
  const forcedRotated = bestPack(list, gapValue, true, square, { preferRotated: true });
  const chosen = choosePack([normal, rotated, forcedRotated], true, square);
  return square ? normalizeSquare(chosen, stretchThreshold) : plainPack(chosen);
}

function packAspect(pack) {
  return Math.max(pack.width / pack.height, pack.height / pack.width);
}

function plainPack(pack) {
  const { placements, width, height } = pack;
  return { placements, width, height, stretched: false, axis: null };
}

function choosePack(packs, preferRotated, square) {
  return packs.reduce((best, pack) => {
    if (square) {
      const side = Math.max(pack.width, pack.height);
      const bestSide = Math.max(best.width, best.height);
      if (side < bestSide - 1e-9) return pack;
      if (side > bestSide + 1e-9) return best;
    } else {
      const aspect = packAspect(pack);
      const bestAspect = packAspect(best);
      if (aspect < bestAspect - 1e-9) return pack;
      if (aspect > bestAspect + 1e-9) return best;
    }
    if (pack.area < best.area - 1e-9) return pack;
    if (pack.area > best.area + 1e-9) return best;
    const rotated = pack.placements.filter((p) => p.rotated).length;
    const bestRotated = best.placements.filter((p) => p.rotated).length;
    if (rotated !== bestRotated) {
      return preferRotated && rotated > bestRotated ? pack : best;
    }
    return best;
  });
}

function bestPack(list, gapValue, rotate, square, options = {}) {
  const total = list.reduce((a, b) => a + b.w * b.h, 0);
  const maxW = Math.max(...list.map((i) => i.w));
  const maxH = Math.max(...list.map((i) => i.h));
  const root = Math.ceil(Math.sqrt(total));
  const binWidths = new Set([
    maxW,
    Math.max(maxW, maxH),
    root,
  ]);
  if (square) {
    for (const factor of [0.5, 0.75, 1.25, 1.5, 1.75, 2, 2.5, 3, 4]) {
      binWidths.add(Math.ceil(root * factor));
    }
    const avgW = list.reduce((a, b) => a + b.w, 0) / list.length;
    const maxCols = Math.min(24, Math.ceil(Math.sqrt(list.length)) + 8);
    for (let cols = 1; cols <= maxCols; cols++) {
      binWidths.add(Math.max(maxW, Math.ceil(avgW * cols)));
    }
  }

  let best = null;
  for (const binW of [...binWidths].sort((a, b) => a - b)) {
    const result = packShelf(list, binW, gapValue, rotate, square, options.preferRotated);
    const area = result.width * result.height;
    const aspect = packAspect(result);
    const better =
      !best ||
      (square ? aspect < best.aspect : area < best.area) ||
      (Math.abs(aspect - best.aspect) < 1e-9 && area < best.area);
    if (better) {
      best = { ...result, area, aspect };
    }
  }
  return best;
}

function normalizeSquare(pack, stretchThreshold) {
  const { placements, width, height } = pack;
  if (!width || !height || width === height) {
    return { placements, width, height, stretched: false, axis: null };
  }

  const ratio = width / height;
  const stretched = ratio > stretchThreshold || height / width > stretchThreshold;
  const side = Math.max(width, height);
  if (!stretched) {
    return { placements, width: side, height: side, stretched: false, axis: null };
  }

  if (ratio < 1) {
    const sx = side / width;
    return {
      placements: placements.map((p) => ({
        ...p,
        x: Math.round(p.x * sx),
        w: Math.max(1, Math.round(p.w * sx)),
      })),
      width: side,
      height,
      stretched: true,
      axis: "x",
    };
  }

  const sy = side / height;
  return {
    placements: placements.map((p) => ({
      ...p,
      y: Math.round(p.y * sy),
      h: Math.max(1, Math.round(p.h * sy)),
    })),
    width,
    height: side,
    stretched: true,
    axis: "y",
  };
}

function packShelf(list, binW, gap, rotate, square, preferRotated) {
  const order = [...list].sort((a, b) => {
    const am = Math.max(a.w, a.h);
    const bm = Math.max(b.w, b.h);
    return bm - am || b.w * b.h - a.w * a.h;
  });
  const placements = new Array(list.length);

  let x = 0;
  let y = 0;
  let shelfH = 0;
  let width = 0;
  let height = 0;

  const candidates = (it, newShelf) => {
    const px = newShelf ? 0 : x;
    const py = newShelf ? y + shelfH + (shelfH > 0 ? gap : 0) : y;
    const nextWidth = Math.max(width, px + it.w);
    const nextHeight = Math.max(height, py + it.h);
    const normal = {
      px,
      py,
      w: it.w,
      h: it.h,
      rotated: false,
      area: nextWidth * nextHeight,
      newShelf,
    };
    if (!newShelf && px + it.w > binW) normal.area = Infinity;

    const rotated = {
      px,
      py,
      w: it.h,
      h: it.w,
      rotated: true,
      area: Math.max(width, px + it.h) * Math.max(height, py + it.w),
      newShelf,
    };
    if (!newShelf && px + it.h > binW) rotated.area = Infinity;
    return rotate ? [normal, rotated] : [normal];
  };

  for (const it of order) {
    const options = [...candidates(it, false), ...candidates(it, true)];
    const valid = options.filter((option) => option.area !== Infinity);
    let chosen;
    if (square) {
      const sameShelf = valid.filter((option) => !option.newShelf);
      let pool = sameShelf.length ? sameShelf : valid;
      if (preferRotated) {
        const rotated = valid.filter((option) => option.rotated);
        if (rotated.length) pool = rotated;
      }
      chosen = pool.reduce((best, option) =>
        option.area < best.area || (option.area === best.area && option.h < best.h)
          ? option
          : best
      );
    } else {
      chosen = null;
      for (const option of valid) {
        const sameShelf = !option.newShelf;
        if (
          !chosen ||
          option.area < chosen.area ||
          (option.area === chosen.area &&
            (option.h < chosen.h ||
              (option.h === chosen.h && sameShelf && chosen.newShelf)))
        ) {
          chosen = option;
        }
      }
    }

    placements[it.i] = {
      x: chosen.px,
      y: chosen.py,
      w: chosen.w,
      h: chosen.h,
      rotated: chosen.rotated,
    };
    if (chosen.newShelf) {
      x = chosen.px + chosen.w + gap;
      y = chosen.py;
      shelfH = chosen.h;
    } else {
      x = chosen.px + chosen.w + gap;
      shelfH = Math.max(shelfH, chosen.h);
    }
    width = Math.max(width, chosen.px + chosen.w);
    height = Math.max(height, chosen.py + chosen.h);
  }
  return { placements, width, height };
}

function unionBBox(parts) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of parts) {
    const [x0, y0, x1, y1] = p.bbox;
    if (x0 < minX) minX = x0;
    if (y0 < minY) minY = y0;
    if (x1 > maxX) maxX = x1;
    if (y1 > maxY) maxY = y1;
  }
  return [minX, minY, maxX, maxY];
}

function packPlacements(parts) {
  const items = parts.map((part) => ({
    part,
    w: part.bbox[2] - part.bbox[0],
    h: part.bbox[3] - part.bbox[1],
  }));
  const totalArea = items.reduce((a, b) => a + b.part.area, 0);
  const maxW = Math.max(...items.map((i) => i.w));
  const binW = Math.max(maxW, Math.ceil(Math.sqrt(totalArea * 1.25)));
  items.sort((a, b) => b.h - a.h || b.part.area - a.part.area);

  let x = 0;
  let y = 0;
  let shelfH = 0;
  let width = 0;
  let height = 0;
  const placements = [];
  for (const it of items) {
    if (x + it.w > binW) {
      x = 0;
      y += shelfH;
      shelfH = 0;
    }
    placements.push({
      part: it.part,
      dx: x - it.part.bbox[0],
      dy: y - it.part.bbox[1],
      x,
      y,
      w: it.w,
      h: it.h,
    });
    x += it.w;
    shelfH = Math.max(shelfH, it.h);
    width = Math.max(width, x);
    height = Math.max(height, y + it.h);
  }
  return { placements, width, height };
}

export function layoutGroup(parts, layout, canvasSize = null) {
  if (layout === "crop") {
    const [ox, oy, mx, my] = canvasSize
      ? [0, 0, canvasSize.width, canvasSize.height]
      : unionBBox(parts);
    return {
      offsetX: ox,
      offsetY: oy,
      width: mx - ox,
      height: my - oy,
      placements: parts.map((p) => {
        const w = p.bbox[2] - p.bbox[0];
        const h = p.bbox[3] - p.bbox[1];
        return { part: p, dx: 0, dy: 0, x: p.bbox[0] - ox, y: p.bbox[1] - oy, w, h };
      }),
    };
  }
  const { placements, width, height } = packPlacements(parts);
  return { offsetX: 0, offsetY: 0, width, height, placements };
}

export function renderLayer(sourceData, sourceWidth, layoutInfo) {
  const { offsetX, offsetY, width, height, placements } = layoutInfo;
  const out = new ImageData(width, height);
  const od = out.data;
  const sd = sourceData.data;
  for (const pl of placements) {
    const px = pl.part.pixels;
    for (let k = 0; k < px.length; k++) {
      const srcIdx = px[k];
      const sx = srcIdx % sourceWidth;
      const sy = (srcIdx / sourceWidth) | 0;
      const tx = sx + pl.dx - offsetX;
      const ty = sy + pl.dy - offsetY;
      if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue;
      const si = srcIdx * 4;
      const ti = (ty * width + tx) * 4;
      od[ti] = sd[si];
      od[ti + 1] = sd[si + 1];
      od[ti + 2] = sd[si + 2];
      od[ti + 3] = sd[si + 3];
    }
  }
  return out;
}

export function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
