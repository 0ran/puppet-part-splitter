export async function readPsdImage(file) {
  if (!/\.(psd|psb)$/i.test(file.name)) {
    throw new Error("请选择 .psd 或 .psb 文件；普通图片请使用“拆分零件”模块。");
  }

  const header = new DataView(await file.slice(0, 26).arrayBuffer());
  if (header.byteLength < 26 || header.getUint32(0) !== 0x38425053) {
    throw new Error("文件不是有效的 PSD，或文件已损坏。");
  }
  if (![1, 2].includes(header.getUint16(4))) {
    throw new Error("暂不支持该 Photoshop 文件版本，请另存为 PSD 或 PSB 后重试。");
  }
  if (![1, 8, 16, 32].includes(header.getUint16(22))) {
    throw new Error("暂不支持该 PSD 的通道位深，请转换为 8 位后重试。");
  }

  const height = header.getUint32(14);
  const width = header.getUint32(18);
  if (!width || !height) {
    throw new Error("PSD 画布尺寸无效。");
  }
  if (width > 32767 || height > 32767 || width * height > 128000000) {
    throw new Error("PSD 画布过大，请缩小至单边不超过 32767、总计不超过 1.28 亿像素后重试。");
  }

  const { readPsd, getCompositeCanvas, getLayerCanvas, getLayerMaskCanvas } = await import("ag-psd");
  const buffer = await file.arrayBuffer();
  const readOptions = {
    skipThumbnail: false,
    useRawThumbnail: false,
    skipLinkedFilesData: true,
    totalMemoryLimit: undefined,
  };
  let psd;
  let layerDataAvailable = true;
  try {
    psd = readPsd(buffer, { ...readOptions, skipLayerImageData: false, useRawData: true });
  } catch {
    try {
      psd = readPsd(buffer, { ...readOptions, skipLayerImageData: true, skipCompositeImageData: true, useRawData: false });
      layerDataAvailable = false;
    } catch (fallbackError) {
      throw new Error(`PSD 解析失败：${fallbackError?.message || "文件可能已损坏或使用了不支持的格式，请重新保存后重试。"}`);
    }
  }

  if (!psd.children?.length) {
    throw new Error("此文件未读取到原始图层，可能已被扁平化。请上传保留图层的 PSD，不会用合成图冒充图层导出。");
  }
  const { entries, groups } = collectLayers(psd.children);
  const warnings = [];
  if (!layerDataAvailable) {
    warnings.push("图层位图数据解析失败，已降级为合成图模式：各图层将按坐标从合成图裁剪导出，隐藏图层会输出透明占位。");
  }
  let canvas = null;
  let composite = null;
  let previewComposite = null;
  let usedLayerPreview = false;
  let usedThumbnailPreview = false;
  try {
    let rawComposite = null;
    if (psd.canvas && canvasHasPixels(psd.canvas)) {
      rawComposite = psd.canvas;
    } else if (psd.rawCompositeData && psd.imageResources?.versionInfo?.hasRealMergedData !== false) {
      try {
        rawComposite = getCompositeCanvas(psd);
        if (!canvasHasPixels(rawComposite)) rawComposite = null;
      } catch {
        rawComposite = null;
      }
    }

    const thumbnail = psd.imageResources?.thumbnail;
    const thumbnailValid = thumbnail && canvasHasPixels(thumbnail);
    const thumbnailCanvas = thumbnailValid
      ? drawToSize(thumbnail, width, height)
      : null;

    if (thumbnailValid && rawComposite && !canvasesMatch(rawComposite, thumbnail)) {
      rawComposite = null;
    }

    if (thumbnailValid && rawComposite) {
      previewComposite = rawComposite;
    } else if (thumbnailValid) {
      previewComposite = thumbnailCanvas;
      usedThumbnailPreview = true;
      if (layerDataAvailable) {
        composite = buildCompositeFromLayers(psd.children, width, height, getLayerCanvas, getLayerMaskCanvas);
      }
    } else if (rawComposite) {
      previewComposite = rawComposite;
    } else if (layerDataAvailable) {
      previewComposite = buildCompositeFromLayers(psd.children, width, height, getLayerCanvas, getLayerMaskCanvas);
      usedLayerPreview = true;
    }

    composite = composite || previewComposite;
    if (previewComposite) {
      const scale = Math.min(512 / width, 512 / height, 1);
      canvas = createCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
      canvas.getContext("2d").drawImage(previewComposite, 0, 0, canvas.width, canvas.height);
    }
  } catch {
    canvas = null;
    composite = null;
  }
  if (!canvas) {
    warnings.push("合成预览不可用，但图层结构已读取，仍可尝试逐层导出。");
  } else if (usedLayerPreview) {
    warnings.push("PSD 合成图不可用，预览已由可见图层重建；16 / 32 位图像按 8 位 PNG 输出。");
  } else if (usedThumbnailPreview) {
    warnings.push("PSD 内置合成图解码异常，预览已使用内嵌缩略图；图层导出仍按原始图层处理。");
  }
  return { canvas, width, height, entries, groups, warnings, sourceName: file.name, composite, layerDataAvailable };
}

function buildCompositeFromLayers(children, width, height, getLayerCanvas, getLayerMaskCanvas) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  drawLayerTree(context, children, 1, getLayerCanvas, getLayerMaskCanvas, width, height);
  return canvasHasPixels(canvas) ? canvas : null;
}

function drawToSize(source, width, height) {
  const canvas = createCanvas(width, height);
  canvas.getContext("2d").drawImage(source, 0, 0, width, height);
  return canvas;
}

function canvasesMatch(candidate, reference, threshold = 0.42) {
  try {
    const size = 64;
    const candidateCanvas = drawToSize(candidate, size, size);
    const referenceCanvas = drawToSize(reference, size, size);
    const candidateData = candidateCanvas.getContext("2d").getImageData(0, 0, size, size).data;
    const referenceData = referenceCanvas.getContext("2d").getImageData(0, 0, size, size).data;
    let difference = 0;
    for (let offset = 0; offset < candidateData.length; offset += 4) {
      const candidateAlpha = candidateData[offset + 3];
      const referenceAlpha = referenceData[offset + 3];
      const alphaDifference = Math.abs(candidateAlpha - referenceAlpha) / 255;
      let colorDifference = 0;
      if (candidateAlpha > 16 && referenceAlpha > 16) {
        colorDifference = (
          Math.abs(candidateData[offset] - referenceData[offset]) +
          Math.abs(candidateData[offset + 1] - referenceData[offset + 1]) +
          Math.abs(candidateData[offset + 2] - referenceData[offset + 2])
        ) / (3 * 255);
      }
      difference += colorDifference * 0.72 + alphaDifference * 0.28;
    }
    return difference / (size * size) <= threshold;
  } catch {
    return false;
  }
}

function drawLayerTree(context, nodes, parentOpacity, getLayerCanvas, getLayerMaskCanvas, width, height) {
  for (let index = nodes.length - 1; index >= 0; index--) {
    const node = nodes[index];
    if (node.hidden) continue;
    if (node.clipping) continue;

    if (Array.isArray(node.children)) {
      drawNode(context, node, parentOpacity, getLayerCanvas, getLayerMaskCanvas, width, height);
      continue;
    }

    let clipEnd = index;
    while (clipEnd > 0 && nodes[clipEnd - 1]?.clipping) clipEnd--;

    if (clipEnd < index) {
      const layerCanvas = createCanvas(width, height);
      const layerContext = layerCanvas.getContext("2d");
      drawNode(layerContext, node, 1, getLayerCanvas, getLayerMaskCanvas, width, height);
      for (let clippedIndex = clipEnd; clippedIndex < index; clippedIndex++) {
        const clippedNode = nodes[clippedIndex];
        if (!clippedNode.hidden) {
          drawNode(layerContext, clippedNode, 1, getLayerCanvas, getLayerMaskCanvas, width, height);
        }
      }
      const maskedCanvas = applyLayerMask(layerCanvas, node, getLayerMaskCanvas);
      const baseAlpha = createLayerAlphaCanvas(node, getLayerCanvas, getLayerMaskCanvas, width, height);
      layerContext.globalCompositeOperation = "destination-in";
      layerContext.drawImage(baseAlpha, 0, 0);
      context.save();
      context.globalAlpha = parentOpacity;
      context.globalCompositeOperation = normalizeBlendMode(node.blendMode);
      context.drawImage(maskedCanvas, 0, 0);
      context.restore();
      continue;
    }

    drawNode(context, node, parentOpacity, getLayerCanvas, getLayerMaskCanvas, width, height);
  }
}

function createLayerAlphaCanvas(node, getLayerCanvas, getLayerMaskCanvas, width, height) {
  const alphaCanvas = createCanvas(width, height);
  const layerCanvas = node.canvas || getLayerCanvas(node);
  alphaCanvas.getContext("2d").drawImage(layerCanvas, node.left || 0, node.top || 0);
  return applyLayerMask(alphaCanvas, node, getLayerMaskCanvas);
}

function drawNode(context, node, parentOpacity, getLayerCanvas, getLayerMaskCanvas, width, height) {
  const opacity = parentOpacity * Math.max(0, Math.min(1, node.opacity ?? 1));
  if (Array.isArray(node.children)) {
    if (node.blendMode === "pass through") {
      drawLayerTree(context, node.children, opacity, getLayerCanvas, getLayerMaskCanvas, width, height);
      return;
    }
    const groupCanvas = createCanvas(width, height);
    drawLayerTree(groupCanvas.getContext("2d"), node.children, 1, getLayerCanvas, getLayerMaskCanvas, width, height);
    const maskedCanvas = applyLayerMask(groupCanvas, node, getLayerMaskCanvas);
    context.save();
    context.globalAlpha = opacity;
    context.globalCompositeOperation = normalizeBlendMode(node.blendMode);
    context.drawImage(maskedCanvas, 0, 0);
    context.restore();
    return;
  }

  let layerCanvas;
  try {
    layerCanvas = node.canvas || getLayerCanvas(node);
  } catch {
    return;
  }
  if (!layerCanvas) return;

  context.save();
  context.globalAlpha = opacity;
  context.globalCompositeOperation = normalizeBlendMode(node.blendMode);
  if (node.mask && !node.mask.disabled) {
    const layerTarget = createCanvas(width, height);
    layerTarget.getContext("2d").drawImage(layerCanvas, node.left || 0, node.top || 0);
    const maskedCanvas = applyLayerMask(layerTarget, node, getLayerMaskCanvas);
    context.drawImage(maskedCanvas, 0, 0);
  } else {
    context.drawImage(layerCanvas, node.left || 0, node.top || 0);
  }
  context.restore();
}

function getMaskCanvas(node, getLayerMaskCanvas) {
  if (!node.mask || node.mask.disabled) return null;
  if (node.mask.canvas) return node.mask.canvas;
  try {
    return getLayerMaskCanvas(node);
  } catch {
    return null;
  }
}

function createMaskAlphaCanvas(node, getLayerMaskCanvas, width, height) {
  if (!node.mask || node.mask.disabled) return null;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = `rgba(0, 0, 0, ${(node.mask.defaultColor ?? 0) / 255})`;
  context.fillRect(0, 0, width, height);

  const maskCanvas = getMaskCanvas(node, getLayerMaskCanvas);
  if (!maskCanvas?.width || !maskCanvas.height) return canvas;
  try {
    const maskData = maskCanvas.getContext("2d").getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    for (let offset = 0; offset < maskData.data.length; offset += 4) {
      const maskValue = maskData.data[offset];
      maskData.data[offset] = 0;
      maskData.data[offset + 1] = 0;
      maskData.data[offset + 2] = 0;
      maskData.data[offset + 3] = maskValue;
    }
    const maskAlpha = createCanvas(maskData.width, maskData.height);
    maskAlpha.getContext("2d").putImageData(maskData, 0, 0);
    let left = node.mask.left || 0;
    let top = node.mask.top || 0;
    if (node.mask.positionRelativeToLayer) {
      left += node.left || 0;
      top += node.top || 0;
    }
    context.drawImage(maskAlpha, left, top);
  } catch {
  }
  return canvas;
}

function applyLayerMask(target, node, getLayerMaskCanvas) {
  if (!node.mask || node.mask.disabled) return target;
  const maskAlpha = createMaskAlphaCanvas(node, getLayerMaskCanvas, target.width, target.height);
  if (!maskAlpha) return target;
  const masked = createCanvas(target.width, target.height);
  const context = masked.getContext("2d");
  context.drawImage(target, 0, 0);
  context.globalCompositeOperation = "destination-in";
  context.drawImage(maskAlpha, 0, 0);
  return masked;
}

function decodeExportLayer(node, source, getLayerCanvas, getLayerMaskCanvas, clippingBase) {
  let decoded = getLayerCanvas(node);
  if (!node.mask && !(node.clipping && clippingBase)) return decoded;

  const target = createCanvas(source.width, source.height);
  const context = target.getContext("2d");
  context.drawImage(decoded, node.left || 0, node.top || 0);

  if (node.clipping && clippingBase && !Array.isArray(clippingBase.children)) {
    try {
      const baseCanvas = getLayerCanvas(clippingBase);
      const baseAlpha = createCanvas(source.width, source.height);
      baseAlpha.getContext("2d").drawImage(baseCanvas, clippingBase.left || 0, clippingBase.top || 0);
      const maskedBase = applyLayerMask(baseAlpha, clippingBase, getLayerMaskCanvas);
      context.globalCompositeOperation = "destination-in";
      context.drawImage(maskedBase, 0, 0);
    } catch {
    }
  }

  return applyLayerMask(target, node, getLayerMaskCanvas);
}

function normalizeBlendMode(blendMode) {
  return blendMode && blendMode !== "pass through" && blendMode !== "normal" ? blendMode : "source-over";
}

function canvasHasPixels(canvas) {
  try {
    return alphaBounds(canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height)).area > 0;
  } catch {
    return false;
  }
}

function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function fileSegment(name, index) {
  const safeName = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").slice(0, 100) || "未命名";
  return `${String(index + 1).padStart(3, "0")}_${safeName}`;
}

function collectLayers(children) {
  const entries = [];
  const groups = [];
  function visit(nodes, directory = [], sourcePath = [], parentHidden = false) {
    nodes.forEach((node, siblingIndex) => {
      const name = node.name || "未命名";
      const path = [...sourcePath, name];
      const hidden = parentHidden || node.hidden === true;
      const segment = fileSegment(name, siblingIndex);
      if (Array.isArray(node.children)) {
        const folder = [...directory, segment];
        groups.push({ name, path: folder.join("/"), sourcePath: path, hidden, selfHidden: node.hidden === true });
        visit(node.children, folder, path, hidden);
      } else {
        entries.push({
          node,
          clippingBase: node.clipping ? nodes.slice(siblingIndex + 1).find((item) => !item.clipping) || null : null,
          index: entries.length + 1,
          name,
          path,
          hidden,
          selfHidden: node.hidden === true,
          file: [...directory, `${segment}.png`].join("/"),
        });
      }
    });
  }
  visit(children);
  return { entries, groups };
}

function alphaBounds(imageData) {
  const { width, height, data } = imageData;
  let left = width;
  let top = height;
  let right = 0;
  let bottom = 0;
  let area = 0;
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      if (!data[(row * width + column) * 4 + 3]) continue;
      left = Math.min(left, column);
      top = Math.min(top, row);
      right = Math.max(right, column + 1);
      bottom = Math.max(bottom, row + 1);
      area++;
    }
  }
  return area ? { left, top, width: right - left, height: bottom - top, area } : { left: 0, top: 0, width: 1, height: 1, area: 0 };
}

function layerType(node) {
  if (node.text) return "text";
  if (node.placedLayer) return "smart-object";
  if (node.adjustment) return "adjustment";
  if (node.vectorMask || node.vectorFill) return "vector";
  return "bitmap";
}

function prepareLayer(entry, source, layout, getLayerCanvas, getLayerMaskCanvas, record, compositeCanvas, warnings) {
  const { node } = entry;
  const layerWidth = Math.max(0, (node.right || 0) - (node.left || 0));
  const layerHeight = Math.max(0, (node.bottom || 0) - (node.top || 0));
  if (layerWidth > 32767 || layerHeight > 32767 || layerWidth * layerHeight > 128000000) {
    throw new Error("图层尺寸过大，请缩小该图层后重试");
  }

  let decoded = null;
  let decodeError = null;
  try {
    decoded = decodeExportLayer(node, source, getLayerCanvas, getLayerMaskCanvas, entry.clippingBase);
  } catch (error) {
    decodeError = error;
  }
  if (!decoded) {
    const left = node.left || 0;
    const top = node.top || 0;
    const right = node.right || 0;
    const bottom = node.bottom || 0;
    if (!record.hidden && compositeCanvas && right > left && bottom > top) {
      const cropLeft = Math.max(0, Math.min(compositeCanvas.width, left));
      const cropTop = Math.max(0, Math.min(compositeCanvas.height, top));
      const cropRight = Math.max(cropLeft, Math.min(compositeCanvas.width, right));
      const cropBottom = Math.max(cropTop, Math.min(compositeCanvas.height, bottom));
      if (cropRight > cropLeft && cropBottom > cropTop) {
        decoded = createCanvas(cropRight - cropLeft, cropBottom - cropTop);
        decoded.getContext("2d").drawImage(compositeCanvas, cropLeft, cropTop, decoded.width, decoded.height, 0, 0, decoded.width, decoded.height);
        record.usedComposite = true;
        warnings.push(`${entry.path.join(" / ")}：图层没有独立位图数据，已按坐标 ${left},${top} ${right},${bottom} 从合成图裁剪导出。`);
      }
    }
    if (!decoded) {
      decoded = createCanvas(1, 1);
      record.placeholder = true;
      warnings.push(`${entry.path.join(" / ")}：图层没有可导出的位图数据${decodeError ? `（${decodeError.message || decodeError}）` : ""}，已输出透明占位 PNG。`);
    }
  }
  let bitmap;
  let bounds;
  try {
    bounds = alphaBounds(decoded.getContext("2d").getImageData(0, 0, decoded.width, decoded.height));
    bitmap = createCanvas(bounds.width, bounds.height);
    if (bounds.area) {
      bitmap.getContext("2d").drawImage(decoded, bounds.left, bounds.top, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
    }
  } finally {
    decoded.width = decoded.height = 1;
  }

  const left = (node.left || 0) + bounds.left;
  const top = (node.top || 0) + bounds.top;
  const preserveCanvas = layout === "crop";
  const width = preserveCanvas ? source.width : bitmap.width;
  const height = preserveCanvas ? source.height : bitmap.height;
  const targetX = preserveCanvas ? left : 0;
  const targetY = preserveCanvas ? top : 0;
  const status = record.placeholder
    ? "placeholder"
    : record.usedComposite
      ? (bounds.area ? "fallback" : "fallback-empty")
      : bounds.area ? "exported" : "empty";
  Object.assign(record, {
    status,
    width,
    height,
    src: [left, top, left + bitmap.width, top + bitmap.height],
    srcSize: [bitmap.width, bitmap.height],
    bbox: [
      Math.max(0, Math.min(width, targetX)),
      Math.max(0, Math.min(height, targetY)),
      Math.max(0, Math.min(width, targetX + bitmap.width)),
      Math.max(0, Math.min(height, targetY + bitmap.height)),
    ],
    offsetX: preserveCanvas ? 0 : left,
    offsetY: preserveCanvas ? 0 : top,
    scale: 1,
    area: bounds.area,
  });

  const previewScale = Math.min(360 / width, 280 / height, 1);
  const previewCanvas = createCanvas(Math.max(1, Math.round(width * previewScale)), Math.max(1, Math.round(height * previewScale)));
  const previewContext = previewCanvas.getContext("2d");
  previewContext.drawImage(bitmap, targetX * previewCanvas.width / width, targetY * previewCanvas.height / height, bitmap.width * previewCanvas.width / width, bitmap.height * previewCanvas.height / height);

  return {
    ...record,
    previewCanvas,
    renderCanvas() {
      const canvas = createCanvas(width, height);
      canvas.getContext("2d").drawImage(bitmap, targetX, targetY);
      return canvas;
    },
  };
}

export async function splitPsdLayers(source, layout, options = {}) {
  if (layout !== "pack" && layout !== "crop") throw new Error("未知的 PSD 输出布局");
  const { includeHidden = true } = options;
  const { getLayerCanvas, getLayerMaskCanvas } = await import("ag-psd");
  const layers = [];
  const records = [];
  const warnings = [...source.warnings];
  const compositeCanvas = source.composite || null;
  const candidates = includeHidden ? source.entries : source.entries.filter((entry) => !entry.hidden);
  const skippedHidden = source.entries.length - candidates.length;
  for (const entry of candidates) {
    const record = {
      index: entry.index,
      sourceId: entry.node.id ?? null,
      name: entry.name,
      sourcePath: entry.path,
      file: entry.file,
      type: layerType(entry.node),
      hidden: entry.hidden,
      selfHidden: entry.selfHidden,
      opacity: entry.node.opacity ?? 1,
      blendMode: entry.node.blendMode || "normal",
      text: entry.node.text?.text,
    };
    records.push(record);
    try {
      layers.push(prepareLayer(entry, source, layout, getLayerCanvas, getLayerMaskCanvas, record, compositeCanvas, warnings));
    } catch (error) {
      record.status = "error";
      record.file = null;
      record.error = error.message || "无法解码该图层";
      warnings.push(`${entry.path.join(" / ")}：${record.error}`);
    }
    if (entry.index % 4 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return {
    layers,
    layout,
    sourceName: source.sourceName,
    manifest: {
      type: "psd",
      splitBy: "source-layer",
      rendering: "stored-layer-bitmap",
      canvas: [source.width, source.height],
      layout,
      includeHidden,
      detected: source.entries.length,
      emitted: layers.length,
      skippedHidden,
      hidden: source.entries.filter((entry) => entry.hidden).length,
      groups: source.groups,
      layers: records,
      warnings,
    },
  };
}
