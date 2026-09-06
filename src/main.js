import { createIcons, icons } from "lucide";
import JSZip from "jszip";
import { readPsdImage, splitPsdLayers } from "./psd.js";
import { getLanguage, setLanguage, t, translateDocument } from "./i18n.js";
import {
  readImage,
  detectParts,
  groupParts,
  layoutGroup,
  renderLayer,
  contentBBox,
  packRects,
  canvasToBlob,
} from "./pipeline.js";
import "./style.css";

createIcons({ icons });

const els = {
  modeTabs: document.querySelectorAll(".mode-tab"),
  splitPanel: document.getElementById("splitPanel"),
  mergePanel: document.getElementById("mergePanel"),
  splitWorkspace: document.getElementById("splitWorkspace"),
  mergeWorkspace: document.getElementById("mergeWorkspace"),
  fileInput: document.getElementById("fileInput"),
  uploadBtn: document.getElementById("uploadBtn"),
  clearBtn: document.getElementById("clearBtn"),
  sourceCanvas: document.getElementById("sourceCanvas"),
  sourceMeta: document.getElementById("sourceMeta"),
  sourceName: document.getElementById("sourceName"),
  sourceSize: document.getElementById("sourceSize"),
  splitBtn: document.getElementById("splitBtn"),
  partCountInput: document.getElementById("partCountInput"),
  modeSeg: document.getElementById("modeSeg"),
  layoutSeg: document.getElementById("layoutSeg"),
  axisField: document.getElementById("axisField"),
  axisSeg: document.getElementById("axisSeg"),
  minAreaInput: document.getElementById("minAreaInput"),
  allPanel: document.getElementById("allPanel"),
  allWorkspace: document.getElementById("allWorkspace"),
  allFileInput: document.getElementById("allFileInput"),
  allUploadBtn: document.getElementById("allUploadBtn"),
  allClearBtn: document.getElementById("allClearBtn"),
  allSourceCanvas: document.getElementById("allSourceCanvas"),
  allSourceMeta: document.getElementById("allSourceMeta"),
  allSourceName: document.getElementById("allSourceName"),
  allSourceSize: document.getElementById("allSourceSize"),
  allLayoutSeg: document.getElementById("allLayoutSeg"),
  allMinAreaInput: document.getElementById("allMinAreaInput"),
  allSplitBtn: document.getElementById("allSplitBtn"),
  allPartCount: document.getElementById("allPartCount"),
  allLayerCount: document.getElementById("allLayerCount"),
  allCoverPct: document.getElementById("allCoverPct"),
  allEmptyState: document.getElementById("allEmptyState"),
  allResults: document.getElementById("allResults"),
  allSummary: document.getElementById("allSummary"),
  allLayerGrid: document.getElementById("allLayerGrid"),
  allDownloadAllBtn: document.getElementById("allDownloadAllBtn"),
  allManifestBtn: document.getElementById("allManifestBtn"),
  psdPanel: document.getElementById("psdPanel"),
  psdWorkspace: document.getElementById("psdWorkspace"),
  psdFileInput: document.getElementById("psdFileInput"),
  psdUploadBtn: document.getElementById("psdUploadBtn"),
  psdClearBtn: document.getElementById("psdClearBtn"),
  psdSourceCanvas: document.getElementById("psdSourceCanvas"),
  psdSourceMeta: document.getElementById("psdSourceMeta"),
  psdSourceName: document.getElementById("psdSourceName"),
  psdSourceSize: document.getElementById("psdSourceSize"),
  psdLayerInfo: document.getElementById("psdLayerInfo"),
  psdError: document.getElementById("psdError"),
  psdLayoutSeg: document.getElementById("psdLayoutSeg"),
  psdSplitBtn: document.getElementById("psdSplitBtn"),
  psdPartCount: document.getElementById("psdPartCount"),
  psdLayerCount: document.getElementById("psdLayerCount"),
  psdCoverPct: document.getElementById("psdCoverPct"),
  psdEmptyState: document.getElementById("psdEmptyState"),
  psdResults: document.getElementById("psdResults"),
  psdSummary: document.getElementById("psdSummary"),
  psdLayerGrid: document.getElementById("psdLayerGrid"),
  psdDownloadAllBtn: document.getElementById("psdDownloadAllBtn"),
  psdManifestBtn: document.getElementById("psdManifestBtn"),
  psdIncludeHiddenInput: document.getElementById("psdIncludeHiddenInput"),
  emptyState: document.getElementById("emptyState"),
  results: document.getElementById("results"),
  layerGrid: document.getElementById("layerGrid"),
  sizeSummary: document.getElementById("sizeSummary"),
  downloadAllBtn: document.getElementById("downloadAllBtn"),
  manifestBtn: document.getElementById("manifestBtn"),
  partCount: document.getElementById("partCount"),
  layerCount: document.getElementById("layerCount"),
  coverPct: document.getElementById("coverPct"),
  imageInput: document.getElementById("imageInput"),
  importBtn: document.getElementById("importBtn"),
  importMenu: document.getElementById("importMenu"),
  importImageBtn: document.getElementById("importImageBtn"),
  importFolderBtn: document.getElementById("importFolderBtn"),
  folderCount: document.getElementById("folderCount"),
  mergeClearBtn: document.getElementById("mergeClearBtn"),
  folderPreview: document.getElementById("folderPreview"),
  previewModal: document.getElementById("previewModal"),
  previewModalImage: document.getElementById("previewModalImage"),
  previewModalName: document.getElementById("previewModalName"),
  previewModalClose: document.getElementById("previewModalClose"),
  gapInput: document.getElementById("gapInput"),
  rotateInput: document.getElementById("rotateInput"),
  scaleInput: document.getElementById("scaleInput"),
  mergeBtn: document.getElementById("mergeBtn"),
  mergePartCount: document.getElementById("mergePartCount"),
  mergeSize: document.getElementById("mergeSize"),
  mergeScale: document.getElementById("mergeScale"),
  mergeGap: document.getElementById("mergeGap"),
  mergeEmpty: document.getElementById("mergeEmpty"),
  mergeResults: document.getElementById("mergeResults"),
  mergePreview: document.getElementById("mergePreview"),
  mergeSummary: document.getElementById("mergeSummary"),
  mergeDownloadBtn: document.getElementById("mergeDownloadBtn"),
  mergeAllBtn: document.getElementById("mergeAllBtn"),
  mergeManifestBtn: document.getElementById("mergeManifestBtn"),
  themeToggle: document.getElementById("themeToggle"),
  langToggle: document.getElementById("langToggle"),
};

let state = {
  source: null,
  sourceName: "",
  partCount: 3,
  mode: "balance",
  layout: "pack",
  axis: "y",
  output: null,
  allLayout: "pack",
  allOutput: null,
  psdSource: null,
  psdSourceName: "",
  psdLayout: "pack",
  psdIncludeHidden: true,
  psdOutput: null,
  merge: {
    files: [],
    output: null,
  },
};

let folderPreviewUrls = [];
let mergeRunning = false;
let mergeRerunTimer = null;
let psdLoading = false;
const partRunning = { split: false, all: false, psd: false };

function syncSourceClearButtons() {
  const busy = partRunning.split || partRunning.all;
  els.clearBtn.disabled = busy;
  els.allClearBtn.disabled = busy;
}

function segValue(seg, fallback) {
  const active = seg.querySelector(".seg.active");
  return active ? active.dataset.value : fallback;
}

function bindSeg(seg, onChange) {
  seg.addEventListener("click", (e) => {
    const btn = e.target.closest(".seg");
    if (!btn || btn.classList.contains("active")) return;
    seg.querySelectorAll(".seg").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    onChange(btn.dataset.value);
  });
}

function setBusy(busy) {
  els.splitBtn.disabled = busy || !state.source;
  els.splitBtn.querySelector("span").textContent = busy ? t("busySplit") : t("startSplit");
  syncSourceClearButtons();
}

function setAllBusy(busy, mode = "all") {
  busy = busy || partRunning[mode] || (mode === "psd" && psdLoading);
  const source = mode === "psd" ? state.psdSource : state.source;
  const splitBtn = els[`${mode}SplitBtn`];
  splitBtn.disabled = busy || !source;
  splitBtn.querySelector("span").textContent = busy
    ? mode === "psd" && psdLoading ? t("busyPsdReading") : t("busySplit")
    : mode === "psd" ? t("psdExportStart") : t("allSplitTitle");
  els[`${mode}UploadBtn`].disabled = busy;
  if (mode === "all") els.allMinAreaInput.disabled = busy;
  if (mode === "psd") {
    els.psdIncludeHiddenInput.disabled = busy;
    els.psdClearBtn.disabled = busy;
  }
  els[`${mode}LayoutSeg`].querySelectorAll("button").forEach((button) => {
    button.disabled = busy;
  });
  if (mode === "all") syncSourceClearButtons();
  els[`${mode}DownloadAllBtn`].disabled = busy || !state[`${mode}Output`];
  els[`${mode}ManifestBtn`].disabled = busy || !state[`${mode}Output`];
  els[`${mode}Workspace`].setAttribute("aria-busy", String(busy));
}

function resetAllResults(mode = "all") {
  state[`${mode}Output`] = null;
  els[`${mode}Results`].classList.add("hidden");
  els[`${mode}EmptyState`].classList.remove("hidden");
  els[`${mode}Summary`].classList.add("hidden");
  els[`${mode}Summary`].textContent = "";
  els[`${mode}LayerGrid`].replaceChildren();
  els[`${mode}PartCount`].textContent = "0";
  els[`${mode}LayerCount`].textContent = "0";
  if (mode === "psd") {
    els.psdCoverPct.textContent = "0";
  } else {
    els.allCoverPct.textContent = "0%";
  }
  els[`${mode}DownloadAllBtn`].disabled = true;
  els[`${mode}ManifestBtn`].disabled = true;
}

function resetSplitResults() {
  state.output = null;
  els.results.classList.add("hidden");
  els.emptyState.classList.remove("hidden");
  els.sizeSummary.classList.add("hidden");
  els.sizeSummary.textContent = "";
  els.layerGrid.replaceChildren();
  els.partCount.textContent = "0";
  els.layerCount.textContent = "0";
  els.coverPct.textContent = "0%";
  els.downloadAllBtn.disabled = true;
  els.manifestBtn.disabled = true;
}

function drawSource(canvas = els.sourceCanvas, source = state.source) {
  const width = source.width;
  const height = source.height;
  const maxSide = 512;
  const scale = Math.min(maxSide / width, maxSide / height, 1);
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.style.aspectRatio = `${width} / ${height}`;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source.canvas, 0, 0, canvas.width, canvas.height);
}

async function loadSource(src, name) {
  state.source = await readImage(src);
  state.sourceName = name || "image";
  state.output = null;
  resetAllResults();
  drawSource();
  drawSource(els.allSourceCanvas);
  els.sourceMeta.classList.remove("hidden");
  els.sourceName.textContent = state.sourceName;
  els.sourceSize.textContent = `${state.source.width} × ${state.source.height}`;
  els.allSourceMeta.classList.remove("hidden");
  els.allSourceName.textContent = state.sourceName;
  els.allSourceSize.textContent = `${state.source.width} × ${state.source.height}`;
  els.clearBtn.classList.remove("hidden");
  els.allClearBtn.classList.remove("hidden");
  els.emptyState.classList.add("hidden");
  els.results.classList.add("hidden");
  els.allEmptyState.classList.add("hidden");
  els.allResults.classList.add("hidden");
  setBusy(false);
  setAllBusy(false);
}

function resetSourceCanvas(canvas) {
  canvas.width = 512;
  canvas.height = 512;
  canvas.style.aspectRatio = "1 / 1";
  canvas.getContext("2d").clearRect(0, 0, 512, 512);
}

function clearSource() {
  if (partRunning.split || partRunning.all) return;
  state.source = null;
  state.sourceName = "";
  state.output = null;
  state.allOutput = null;
  els.fileInput.value = "";
  els.allFileInput.value = "";
  resetSourceCanvas(els.sourceCanvas);
  resetSourceCanvas(els.allSourceCanvas);
  els.sourceMeta.classList.add("hidden");
  els.sourceName.textContent = "";
  els.sourceSize.textContent = "";
  els.allSourceMeta.classList.add("hidden");
  els.allSourceName.textContent = "";
  els.allSourceSize.textContent = "";
  resetSplitResults();
  resetAllResults("all");
  els.clearBtn.classList.add("hidden");
  els.allClearBtn.classList.add("hidden");
  setBusy(false);
  setAllBusy(false);
}

function showPsdError(message = "") {
  els.psdError.textContent = message;
  els.psdError.classList.toggle("hidden", !message);
}

function refreshPsdSourceInfo() {
  if (!state.psdSource) return;
  const source = state.psdSource;
  const hiddenCount = source.entries.filter((entry) => entry.hidden).length;
  els.psdLayerInfo.textContent = t("psdLayerInfo", {
    count: source.entries.length,
    hidden: hiddenCount,
    folders: source.groups.length,
  });
  els.psdPartCount.textContent = source.entries.length;
  showPsdError(source.warnings.map((warning) => t(warning.key, warning.vars)).join("\n"));
}

async function loadPsdSource(file) {
  if (psdLoading || partRunning.psd) return;
  psdLoading = true;
  state.psdSource = null;
  state.psdSourceName = "";
  els.psdUploadBtn.querySelector("span").textContent = t("busyPsdReading");
  try {
    resetAllResults("psd");
    showPsdError();
    els.psdClearBtn.classList.add("hidden");
    els.psdSourceCanvas.width = 512;
    els.psdSourceCanvas.height = 512;
    els.psdSourceCanvas.style.aspectRatio = "1 / 1";
    els.psdSourceMeta.classList.add("hidden");
    els.psdSourceName.textContent = "";
    els.psdSourceSize.textContent = "";
    els.psdLayerInfo.textContent = "";
    setAllBusy(true, "psd");
    await new Promise((resolve) => setTimeout(resolve, 30));

    const source = await readPsdImage(file);
    state.psdSource = source;
    state.psdSourceName = file.name;
    if (source.canvas) drawSource(els.psdSourceCanvas, source);
    els.psdSourceName.textContent = file.name;
    els.psdSourceSize.textContent = `${source.width} × ${source.height}`;
    els.psdSourceMeta.classList.remove("hidden");
    els.psdClearBtn.classList.remove("hidden");
    refreshPsdSourceInfo();
  } catch (error) {
    console.error("loadPsdSource failed:", error);
    showPsdError(error.message || t("psdReadFailed"));
  } finally {
    psdLoading = false;
    els.psdUploadBtn.querySelector("span").textContent = t("uploadPsd");
    setAllBusy(false, "psd");
  }
}

function clearPsdSource() {
  if (psdLoading || partRunning.psd) return;
  state.psdSource = null;
  state.psdSourceName = "";
  state.psdOutput = null;
  els.psdFileInput.value = "";
  els.psdSourceCanvas.width = 512;
  els.psdSourceCanvas.height = 512;
  els.psdSourceCanvas.style.aspectRatio = "1 / 1";
  els.psdSourceCanvas.getContext("2d").clearRect(0, 0, 512, 512);
  els.psdSourceMeta.classList.add("hidden");
  els.psdSourceName.textContent = "";
  els.psdSourceSize.textContent = "";
  els.psdLayerInfo.textContent = "";
  showPsdError();
  resetAllResults("psd");
  els.psdClearBtn.classList.add("hidden");
  els.psdClearBtn.disabled = false;
  setAllBusy(false, "psd");
}

async function runSplit() {
  if (!state.source || partRunning.split || partRunning.all) return;
  partRunning.split = true;
  setBusy(true);
  await new Promise((r) => setTimeout(r, 30));

  try {
    const imageData = state.source.ctx.getImageData(
      0,
      0,
      state.source.width,
      state.source.height
    );
    const minArea = Math.max(1, Number(els.minAreaInput.value) || 8);
    const { parts, mask } = detectParts(imageData, { minArea });
    if (!parts.length) {
      els.results.classList.remove("hidden");
      els.emptyState.classList.add("hidden");
      els.sizeSummary.classList.remove("hidden");
      els.sizeSummary.textContent = t("noPartsDetected");
      els.layerGrid.innerHTML = "";
      els.partCount.textContent = "0";
      els.layerCount.textContent = "0";
      els.coverPct.textContent = "0%";
      return;
    }
    const groups = groupParts(parts, state.partCount, state.mode, state.axis).filter(
      (g) => g.length > 0
    );
    const totalMask = mask.reduce((a, b) => a + b, 0);

    const layers = groups.map((group, i) => {
      const layoutInfo = layoutGroup(group, state.layout);
      const outData = renderLayer(imageData, state.source.width, layoutInfo);
      const canvas = document.createElement("canvas");
      canvas.width = layoutInfo.width;
      canvas.height = layoutInfo.height;
      canvas.getContext("2d").putImageData(outData, 0, 0);
      const area = group.reduce((a, p) => a + p.area, 0);
      const sourcePx = state.source.width * state.source.height;
      const layerPx = layoutInfo.width * layoutInfo.height;
      return {
        index: i + 1,
        group,
        area,
        pct: totalMask ? (100 * area) / totalMask : 0,
        width: layoutInfo.width,
        height: layoutInfo.height,
        offsetX: layoutInfo.offsetX,
        offsetY: layoutInfo.offsetY,
        savedPct: sourcePx ? 100 * (1 - layerPx / sourcePx) : 0,
        placements: layoutInfo.placements,
        canvas,
      };
    });

    state.output = {
      parts,
      groups,
      layers,
      totalMask,
      layout: state.layout,
      manifest: {
        canvas: [state.source.width, state.source.height],
        count: state.partCount,
        mode: state.mode,
        layout: state.layout,
        axis: state.mode === "bands" ? state.axis : null,
        minArea,
        totalArea: totalMask,
        detected: parts.length,
        emitted: layers.length,
        layers: layers.map((l) => ({
          file: `part_${l.index}.png`,
          offsetX: l.offsetX,
          offsetY: l.offsetY,
          width: l.width,
          height: l.height,
          parts: l.group.map((p, j) => ({
            id: p.id,
            src: p.bbox,
            srcSize: [p.bbox[2] - p.bbox[0], p.bbox[3] - p.bbox[1]],
            scale: 1,
            bbox: [l.placements[j].x, l.placements[j].y, l.placements[j].x + l.placements[j].w, l.placements[j].y + l.placements[j].h],
            area: p.area,
          })),
        })),
      },
    };

    renderResults();
  } finally {
    partRunning.split = false;
    setBusy(false);
  }
}

function renderResults() {
  const { layers, parts, totalMask } = state.output;
  els.results.classList.remove("hidden");
  els.emptyState.classList.add("hidden");
  els.partCount.textContent = parts.length;
  els.layerCount.textContent = layers.length;
  const cover = (100 * totalMask) / (state.source.width * state.source.height);
  els.coverPct.textContent = `${cover.toFixed(1)}%`;

  const sourcePx = state.source.width * state.source.height;
  const layerPx = layers.reduce((a, l) => a + l.width * l.height, 0);
  const saved = 100 * (1 - layerPx / sourcePx);
  els.sizeSummary.classList.remove("hidden");
  els.sizeSummary.textContent =
    state.layout === "pack"
      ? t("splitSummaryPack", { px: Math.round(layerPx).toLocaleString(), saved: saved.toFixed(1) })
      : t("splitSummaryCrop", { sizes: layers.map((l) => `${l.width}×${l.height}`).join(" / ") });

  els.layerGrid.innerHTML = "";

  for (const layer of layers) {
    appendLayerCard(
      els.layerGrid,
      layer,
      t("layerTitle", { index: layer.index }),
      t("layerMeta", {
        count: layer.group.length,
        pct: layer.pct.toFixed(1),
        size: `${layer.width}×${layer.height}`,
      }),
      `part_${layer.index}.png`
    );
  }
  createIcons({ icons });
}

function appendLayerCard(grid, layer, title, metaText, fileName) {
  const card = document.createElement("div");
  card.className = "layer-card";

  const head = document.createElement("div");
  head.className = "layer-head";
  const titleEl = document.createElement("div");
  titleEl.className = "layer-title";
  titleEl.textContent = title;
  const metaEl = document.createElement("div");
  metaEl.className = "layer-meta";
  metaEl.textContent = metaText;
  head.append(titleEl, metaEl);

  const view = document.createElement("div");
  view.className = "layer-view checker";
  const cv = document.createElement("canvas");
  const preview = layer.previewCanvas || layer.canvas;
  const previewScale = Math.min(360 / preview.width, 280 / preview.height, 1);
  cv.width = Math.max(1, Math.round(preview.width * previewScale));
  cv.height = Math.max(1, Math.round(preview.height * previewScale));
  cv.style.aspectRatio = `${preview.width} / ${preview.height}`;
  cv.getContext("2d").drawImage(preview, 0, 0, cv.width, cv.height);
  view.append(cv);

  const download = document.createElement("button");
  download.className = "btn ghost small";
  download.type = "button";
  download.innerHTML = `<i data-lucide="download"></i><span>${t("download")}</span>`;
  download.addEventListener("click", async () => saveBlob(await layerToBlob(layer), fileName));

  card.append(head, view, download);
  grid.append(card);
}

function partFileName(index) {
  return `part_${String(index).padStart(3, "0")}.png`;
}

function showAllMessage(mode, message) {
  els[`${mode}Results`].classList.remove("hidden");
  els[`${mode}EmptyState`].classList.add("hidden");
  els[`${mode}Summary`].classList.remove("hidden");
  els[`${mode}Summary`].textContent = message;
}

async function runAllSplit(mode = "all") {
  if (mode === "psd") return runPsdSplit();
  const source = mode === "psd" ? state.psdSource : state.source;
  if (!source || partRunning[mode] || (mode === "psd" && psdLoading)) return;
  const sourceName = mode === "psd" ? state.psdSourceName : state.sourceName;
  const layout = state[`${mode}Layout`];
  const minArea = Math.max(1, Number(els[`${mode}MinAreaInput`].value) || 8);
  partRunning[mode] = true;
  resetAllResults(mode);
  setAllBusy(true, mode);
  await new Promise((resolve) => setTimeout(resolve, 30));

  try {
    if (source !== (mode === "psd" ? state.psdSource : state.source)) return;
    const imageData = source.ctx.getImageData(0, 0, source.width, source.height);
    const { parts, mask } = detectParts(imageData, { minArea });
    if (!parts.length) {
      showAllMessage(mode, t("noPartsDetected"));
      return;
    }

    const totalMask = mask.reduce((total, value) => total + value, 0);
    const sourcePx = source.width * source.height;
    const canvasSize = mode === "psd" && layout === "crop"
      ? { width: source.width, height: source.height }
      : null;
    const layers = parts.map((part) => {
      const layoutInfo = layoutGroup([part], layout, canvasSize);
      const outData = renderLayer(imageData, source.width, layoutInfo);
      const canvas = document.createElement("canvas");
      canvas.width = layoutInfo.width;
      canvas.height = layoutInfo.height;
      canvas.getContext("2d").putImageData(outData, 0, 0);
      const layerPx = layoutInfo.width * layoutInfo.height;
      return {
        index: part.id,
        part,
        area: part.area,
        pct: totalMask ? (100 * part.area) / totalMask : 0,
        width: layoutInfo.width,
        height: layoutInfo.height,
        offsetX: layoutInfo.offsetX,
        offsetY: layoutInfo.offsetY,
        savedPct: sourcePx ? 100 * (1 - layerPx / sourcePx) : 0,
        placements: layoutInfo.placements,
        canvas,
      };
    });

    state[`${mode}Output`] = {
      parts,
      layers,
      totalMask,
      sourceName,
      layout,
      manifest: {
        type: mode,
        canvas: [source.width, source.height],
        layout,
        minArea,
        totalArea: totalMask,
        detected: parts.length,
        emitted: layers.length,
        layers: layers.map((layer) => ({
          file: partFileName(layer.index),
          width: layer.width,
          height: layer.height,
          id: layer.part.id,
          src: layer.part.bbox,
          srcSize: [layer.part.bbox[2] - layer.part.bbox[0], layer.part.bbox[3] - layer.part.bbox[1]],
          scale: 1,
          bbox: [
            layer.placements[0].x,
            layer.placements[0].y,
            layer.placements[0].x + layer.placements[0].w,
            layer.placements[0].y + layer.placements[0].h,
          ],
          offsetX: layer.offsetX,
          offsetY: layer.offsetY,
          area: layer.part.area,
        })),
      },
    };

    renderAllResults(mode);
  } catch (error) {
    resetAllResults(mode);
    showAllMessage(mode, t("splitFailed", { message: error.message || t("splitRetryHint") }));
  } finally {
    partRunning[mode] = false;
    setAllBusy(false, mode);
  }
}

async function runPsdSplit() {
  const source = state.psdSource;
  if (!source || psdLoading || partRunning.psd) return;
  const layout = state.psdLayout;
  partRunning.psd = true;
  resetAllResults("psd");
  els.psdPartCount.textContent = source.entries.length;
  showPsdError();
  setAllBusy(true, "psd");
  await new Promise((resolve) => setTimeout(resolve, 30));
  try {
    state.psdOutput = await splitPsdLayers(source, layout, { includeHidden: state.psdIncludeHidden });
    renderPsdResults();
  } catch (error) {
    state.psdOutput = null;
    showAllMessage("psd", t("psdExportFailed", { message: error.message || t("checkFileRetry") }));
  } finally {
    partRunning.psd = false;
    setAllBusy(false, "psd");
  }
}

function renderPsdResults() {
  const { layers, manifest, layout, warnings } = state.psdOutput;
  els.psdResults.classList.remove("hidden");
  els.psdEmptyState.classList.add("hidden");
  els.psdPartCount.textContent = manifest.detected;
  els.psdLayerCount.textContent = manifest.emitted;
  els.psdCoverPct.textContent = manifest.hidden;
  const layerByIndex = new Map(layers.map((layer) => [layer.index, layer]));
  const failed = Math.max(0, manifest.layers.length - manifest.emitted);
  const skippedText = manifest.skippedHidden
    ? t("skippedHidden", { count: manifest.skippedHidden })
    : "";
  const layoutText = layout === "crop"
    ? t("psdLayoutCropText", { size: `${manifest.canvas[0]}×${manifest.canvas[1]}` })
    : t("psdLayoutPackText");
  els.psdSummary.classList.remove("hidden");
  els.psdSummary.textContent = t("psdSummary", {
    detected: manifest.detected,
    emitted: manifest.emitted,
    skipped: skippedText,
    failed: failed ? t("failedLayers", { count: failed }) : "",
    folders: manifest.groups.length,
    layout: layoutText,
  });
  showPsdError(warnings.map((warning) => t(warning.key, warning.vars)).join("\n"));
  els.psdLayerGrid.replaceChildren();
  const typeLabels = {
    text: t("typeText"),
    bitmap: t("typeBitmap"),
    "smart-object": t("typeSmartObject"),
    vector: t("typeVector"),
    adjustment: t("typeAdjustment"),
  };
  for (const record of manifest.layers) {
    const layer = layerByIndex.get(record.index);
    if (!layer) {
      appendPsdErrorCard(els.psdLayerGrid, record, typeLabels[record.type] || t("typeLayer"));
      continue;
    }
    const details = [`${layer.width}×${layer.height}`, typeLabels[layer.type] || layer.type];
    if (layer.hidden) details.push(t("hiddenLayer"));
    if (record.status === "placeholder") details.push(t("placeholderLayer"));
    else if (record.status === "fallback") details.push(t("fallbackLayer"));
    else if (record.status === "empty") details.push(t("emptyLayer"));
    appendLayerCard(els.psdLayerGrid, layer, layer.sourcePath.join(" / "), details.join(" · "), layer.file.split("/").pop());
  }
  createIcons({ icons });
}

function appendPsdErrorCard(grid, record, typeLabel) {
  const card = document.createElement("div");
  card.className = "layer-card psd-error";
  const head = document.createElement("div");
  head.className = "layer-head";
  const titleEl = document.createElement("div");
  titleEl.className = "layer-title";
  titleEl.textContent = record.sourcePath.join(" / ");
  const metaEl = document.createElement("div");
  metaEl.className = "layer-meta";
  metaEl.textContent = t("exportFailed", { type: typeLabel });
  head.append(titleEl, metaEl);
  const note = document.createElement("div");
  note.className = "layer-error-note";
  note.textContent = record.error || t("layerExportError");
  card.append(head, note);
  grid.append(card);
}

function renderAllResults(mode = "all") {
  if (mode === "psd") return renderPsdResults();
  const { layers, parts, totalMask, layout, manifest } = state[`${mode}Output`];
  els[`${mode}Results`].classList.remove("hidden");
  els[`${mode}EmptyState`].classList.add("hidden");
  els[`${mode}PartCount`].textContent = parts.length;
  els[`${mode}LayerCount`].textContent = layers.length;
  const sourcePx = manifest.canvas[0] * manifest.canvas[1];
  const cover = (100 * totalMask) / sourcePx;
  els[`${mode}CoverPct`].textContent = `${cover.toFixed(1)}%`;

  const layerPx = layers.reduce((total, layer) => total + layer.width * layer.height, 0);
  const saved = 100 * (1 - layerPx / sourcePx);
  els[`${mode}Summary`].classList.remove("hidden");
  els[`${mode}Summary`].textContent =
    layout === "pack"
      ? t("allSummaryPack", {
          count: parts.length,
          px: Math.round(layerPx).toLocaleString(),
          saved: saved.toFixed(1),
        })
      : mode === "psd"
        ? t("allSummaryCropPsd", {
            count: parts.length,
            size: `${manifest.canvas[0]}×${manifest.canvas[1]}`,
          })
        : t("allSummaryCropImage", { count: parts.length });

  els[`${mode}LayerGrid`].innerHTML = "";

  for (const layer of layers) {
    appendLayerCard(
      els[`${mode}LayerGrid`],
      layer,
      t("partTitle", { index: layer.index }),
      t("partMeta", { size: `${layer.width}×${layer.height}`, pct: layer.pct.toFixed(1) }),
      partFileName(layer.index)
    );
  }
  createIcons({ icons });
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function saveCanvas(canvas, name) {
  const blob = await canvasToBlob(canvas);
  saveBlob(blob, name);
}

async function layerToBlob(layer) {
  const canvas = layer.renderCanvas ? layer.renderCanvas() : layer.canvas;
  try {
    const blob = await canvasToBlob(canvas);
    if (!blob) throw new Error(t("canvasPngError"));
    return blob;
  } finally {
    if (layer.renderCanvas) canvas.width = canvas.height = 1;
  }
}

async function downloadAll() {
  if (!state.output) return;
  const zip = new JSZip();
  for (const layer of state.output.layers) {
    zip.file(`part_${layer.index}.png`, await canvasToBlob(layer.canvas));
  }
  zip.file("manifest.json", JSON.stringify(state.output.manifest, null, 2));
  const blob = await zip.generateAsync({ type: "blob" });
  const base = state.sourceName.replace(/\.(png|jpg|jpeg|webp|gif)$/i, "");
  saveBlob(blob, `${base}_parts${state.partCount}.zip`);
}

function downloadManifest() {
  if (!state.output) return;
  const blob = new Blob([JSON.stringify(state.output.manifest, null, 2)], {
    type: "application/json",
  });
  saveBlob(blob, "manifest.json");
}

async function downloadAllParts(mode = "all") {
  const output = state[`${mode}Output`];
  if (!output) return;
  const zip = new JSZip();
  if (mode === "psd") {
    for (const group of output.manifest.groups) zip.folder(group.path);
  }
  for (const layer of output.layers) {
    zip.file(layer.file || partFileName(layer.index), await layerToBlob(layer));
  }
  zip.file("manifest.json", JSON.stringify(output.manifest, null, 2));
  const blob = await zip.generateAsync({ type: "blob" });
  const base = output.sourceName.replace(/\.(png|jpg|jpeg|webp|gif|psd)$/i, "") || "image";
  saveBlob(blob, `${base}_parts_${mode}.zip`);
}

function downloadAllPartsManifest(mode = "all") {
  const output = state[`${mode}Output`];
  if (!output) return;
  const blob = new Blob([JSON.stringify(output.manifest, null, 2)], {
    type: "application/json",
  });
  saveBlob(blob, "manifest.json");
}

function setMode(mode) {
  els.modeTabs.forEach((tab) => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-pressed", String(active));
  });
  const isSplit = mode === "split";
  const isAll = mode === "all";
  const isPsd = mode === "psd";
  const isMerge = mode === "merge";
  els.splitPanel.classList.toggle("hidden", !isSplit);
  els.allPanel.classList.toggle("hidden", !isAll);
  els.psdPanel.classList.toggle("hidden", !isPsd);
  els.mergePanel.classList.toggle("hidden", !isMerge);
  els.splitWorkspace.classList.toggle("hidden", !isSplit);
  els.allWorkspace.classList.toggle("hidden", !isAll);
  els.psdWorkspace.classList.toggle("hidden", !isPsd);
  els.mergeWorkspace.classList.toggle("hidden", !isMerge);
}

function setMergeBusy(busy) {
  els.mergeBtn.disabled = busy || state.merge.files.length === 0;
  els.mergeBtn.querySelector("span").textContent = busy ? t("busyMerge") : t("mergeStart");
  els.mergeClearBtn.disabled = busy;
}

function renderMergePreview(canvas) {
  els.mergePreview.innerHTML = "";
  const cv = document.createElement("canvas");
  const scale = Math.min(760 / canvas.width, 520 / canvas.height, 1);
  cv.width = Math.max(1, Math.round(canvas.width * scale));
  cv.height = Math.max(1, Math.round(canvas.height * scale));
  cv.style.aspectRatio = `${canvas.width} / ${canvas.height}`;
  cv.getContext("2d").drawImage(canvas, 0, 0, cv.width, cv.height);
  els.mergePreview.append(cv);
}

function renderFolderPreview(files) {
  closeFolderPreview();
  folderPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
  folderPreviewUrls = [];
  els.folderPreview.innerHTML = "";
  if (!files.length) {
    els.folderPreview.classList.add("hidden");
    return;
  }

  const visible = files.slice(0, 80);
  visible.forEach((file) => {
    const url = URL.createObjectURL(file);
    folderPreviewUrls.push(url);
    const item = document.createElement("div");
    item.className = "folder-preview-item";
    item.tabIndex = 0;
    item.dataset.path = file.webkitRelativePath || file.name;
    item.setAttribute("role", "button");
    const img = document.createElement("img");
    const label = file.webkitRelativePath || file.name;
    img.alt = label;
    img.title = label;
    img.src = url;
    img.addEventListener("error", () => item.classList.add("broken"));
    const name = document.createElement("span");
    name.textContent = label.split("/").pop();
    item.append(img, name);
    item.addEventListener("click", () => openFolderPreview(url, label));
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openFolderPreview(url, label);
      }
    });
    els.folderPreview.append(item);
  });

  const rest = files.length - visible.length;
  if (rest > 0) {
    const more = document.createElement("div");
    more.className = "folder-preview-item more";
    more.textContent = `+${rest}`;
    els.folderPreview.append(more);
  }
  els.folderPreview.classList.remove("hidden");
}

function openFolderPreview(url, name) {
  els.previewModalImage.src = url;
  els.previewModalName.textContent = name;
  els.previewModal.classList.remove("hidden");
}

function closeFolderPreview() {
  if (els.previewModal.classList.contains("hidden")) return;
  els.previewModal.classList.add("hidden");
  els.previewModalImage.removeAttribute("src");
  els.previewModalName.textContent = "";
}

async function runMerge() {
  if (mergeRunning || !state.merge.files.length) return;
  mergeRunning = true;
  setMergeBusy(true);
  await new Promise((r) => setTimeout(r, 30));

  try {
    const gap = Math.max(0, Number(els.gapInput.value) || 0);
    const scale = Math.max(0.01, Number(els.scaleInput.value) || 1);
    const rotate = els.rotateInput.checked;
    const items = [];
    for (const file of state.merge.files) {
      const url = URL.createObjectURL(file);
      const img = await readImage(url);
      URL.revokeObjectURL(url);
      const imageData = img.ctx.getImageData(0, 0, img.width, img.height);
      const bbox = contentBBox(imageData);
      const srcW = bbox[2] - bbox[0];
      const srcH = bbox[3] - bbox[1];
      items.push({
        name: file.name,
        width: img.width,
        height: img.height,
        bbox,
        canvas: img.canvas,
        srcW,
        srcH,
      });
    }

    const rects = items.map((it) => ({
      w: Math.max(1, Math.round(it.srcW * scale)),
      h: Math.max(1, Math.round(it.srcH * scale)),
    }));
    const { placements, width, height, stretched, axis } = packRects(rects, gap, rotate, {
      square: true,
      stretchThreshold: 2,
    });

    const sourceArea = items.reduce((a, it) => {
      return a + Math.max(0, it.srcW * it.srcH);
    }, 0);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    items.forEach((it, i) => {
      const pl = placements[i];
      if (pl.rotated) {
        ctx.save();
        ctx.translate(pl.x + pl.w, pl.y);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(it.canvas, it.bbox[0], it.bbox[1], it.srcW, it.srcH, 0, 0, pl.h, pl.w);
        ctx.restore();
      } else {
        ctx.drawImage(
          it.canvas,
          it.bbox[0],
          it.bbox[1],
          it.srcW,
          it.srcH,
          pl.x,
          pl.y,
          pl.w,
          pl.h
        );
      }
    });

    state.merge.output = {
      canvas,
      width,
      height,
      gap,
      scale,
      rotate,
      stretched,
      stretchAxis: axis,
      sourceArea: sourceArea * scale * scale,
      manifest: {
        type: "merge",
        gap,
        scale,
        rotate,
        square: [width, height],
        stretched,
        stretchAxis: axis,
        canvas: [width, height],
        count: items.length,
        parts: items.map((it, i) => ({
          file: it.name,
          srcSize: [it.width, it.height],
          src: it.bbox,
          rotated: placements[i].rotated,
          bbox: [
            placements[i].x,
            placements[i].y,
            placements[i].x + placements[i].w,
            placements[i].y + placements[i].h,
          ],
        })),
      },
    };

    renderMergeResults();
  } finally {
    mergeRunning = false;
    setMergeBusy(false);
  }
}

function scheduleMergeRerun() {
  if (!state.merge.output || !state.merge.files.length || mergeRunning) return;
  clearTimeout(mergeRerunTimer);
  mergeRerunTimer = setTimeout(() => {
    if (state.merge.output && state.merge.files.length && !mergeRunning) {
      runMerge();
    }
  }, 350);
}

function renderMergeResults() {
  const { canvas, width, height, gap, scale, manifest } = state.merge.output;
  els.mergeResults.classList.remove("hidden");
  els.mergeEmpty.classList.add("hidden");
  els.mergePartCount.textContent = manifest.count;
  els.mergeSize.textContent = `${width}×${height}`;
  els.mergeScale.textContent = t("mergeScaleValue", { scale });
  els.mergeGap.textContent = gap;
  renderMergePreview(canvas);

  const totalPx = width * height;
  const sourcePx = state.merge.output.sourceArea;
  const stretchNote = state.merge.output.stretched
    ? state.merge.output.stretchAxis === "x"
      ? t("stretchHorizontal")
      : t("stretchVertical")
    : "";
  els.mergeSummary.classList.remove("hidden");
  els.mergeSummary.textContent =
    sourcePx > 0
      ? t("mergeSummaryWithSave", {
          count: manifest.count,
          scale,
          size: `${width}×${height}`,
          stretch: stretchNote,
          saved: (100 * (1 - totalPx / sourcePx)).toFixed(1),
        })
      : t("mergeSummaryBasic", {
          count: manifest.count,
          scale,
          size: `${width}×${height}`,
          stretch: stretchNote,
        });
}

async function downloadMergedImage() {
  if (!state.merge.output) return;
  await saveCanvas(state.merge.output.canvas, "merged_atlas.png");
}

async function downloadMergedAll() {
  if (!state.merge.output) return;
  const zip = new JSZip();
  zip.file("merged_atlas.png", await canvasToBlob(state.merge.output.canvas));
  zip.file("manifest.json", JSON.stringify(state.merge.output.manifest, null, 2));
  const blob = await zip.generateAsync({ type: "blob" });
  saveBlob(blob, "merged_atlas.zip");
}

function downloadMergedManifest() {
  if (!state.merge.output) return;
  const blob = new Blob([JSON.stringify(state.merge.output.manifest, null, 2)], {
    type: "application/json",
  });
  saveBlob(blob, "manifest.json");
}

els.uploadBtn.addEventListener("click", () => els.fileInput.click());
els.fileInput.addEventListener("change", () => {
  const file = els.fileInput.files[0];
  if (file) loadSource(URL.createObjectURL(file), file.name);
  els.fileInput.value = "";
});
els.allUploadBtn.addEventListener("click", () => els.allFileInput.click());
els.allFileInput.addEventListener("change", () => {
  const file = els.allFileInput.files[0];
  if (file) loadSource(URL.createObjectURL(file), file.name);
  els.allFileInput.value = "";
});
els.clearBtn.addEventListener("click", clearSource);
els.allClearBtn.addEventListener("click", clearSource);
els.mergeClearBtn.addEventListener("click", clearMergeFiles);
els.psdUploadBtn.addEventListener("click", () => els.psdFileInput.click());
els.psdFileInput.addEventListener("change", () => {
  const file = els.psdFileInput.files[0];
  if (file) loadPsdSource(file);
  els.psdFileInput.value = "";
});
els.psdClearBtn.addEventListener("click", clearPsdSource);
els.modeTabs.forEach((tab) => {
  tab.addEventListener("click", () => setMode(tab.dataset.mode));
});

function addMergeFiles(newFiles) {
  const images = [...newFiles].filter((f) =>
    /\.(png|jpe?g|webp|gif)$/i.test(f.name)
  );
  if (!images.length) return;

  const seen = new Set(state.merge.files.map((f) => `${f.name}:${f.size}:${f.lastModified}`));
  const added = images.filter((f) => {
    const key = `${f.name}:${f.size}:${f.lastModified}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!added.length) return;

  state.merge.files = [...state.merge.files, ...added];
  els.folderCount.textContent = t("mergeFileCount", { count: state.merge.files.length });
  els.mergeClearBtn.classList.remove("hidden");
  renderFolderPreview(state.merge.files);
  state.merge.output = null;
  els.mergeResults.classList.add("hidden");
  els.mergeEmpty.classList.remove("hidden");
  setMergeBusy(false);
}

function clearMergeFiles() {
  if (mergeRunning) return;
  clearTimeout(mergeRerunTimer);
  state.merge.files = [];
  state.merge.output = null;
  els.imageInput.value = "";
  renderFolderPreview(state.merge.files);
  els.folderCount.textContent = t("mergeZeroFiles");
  els.mergeResults.classList.add("hidden");
  els.mergeEmpty.classList.remove("hidden");
  els.mergePreview.replaceChildren();
  els.mergeSummary.classList.add("hidden");
  els.mergeSummary.textContent = "";
  els.mergePartCount.textContent = "0";
  els.mergeSize.textContent = "0×0";
  els.mergeScale.textContent = t("mergeScaleValue", { scale: 1 });
  els.mergeGap.textContent = "0";
  els.mergeClearBtn.classList.add("hidden");
  setMergeBusy(false);
}

function setImportMenu(open) {
  els.importMenu.classList.toggle("hidden", !open);
  els.importBtn.setAttribute("aria-expanded", String(open));
}

els.importBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  setImportMenu(els.importMenu.classList.contains("hidden"));
});
els.importImageBtn.addEventListener("click", () => {
  setImportMenu(false);
  els.imageInput.click();
});
els.importFolderBtn.addEventListener("click", () => {
  setImportMenu(false);
  importMergeFolder();
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".merge-actions")) setImportMenu(false);
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setImportMenu(false);
});

els.imageInput.addEventListener("change", () => {
  clearTimeout(mergeRerunTimer);
  addMergeFiles(els.imageInput.files);
  els.imageInput.value = "";
});

async function importMergeFolder() {
  if (!window.showDirectoryPicker) {
    els.imageInput.click();
    return;
  }

  const directory = await window.showDirectoryPicker({ mode: "read" });
  const files = [];

  async function collectEntries(handle, path = "") {
    for await (const [name, entry] of handle.entries()) {
      const nextPath = path ? `${path}/${name}` : name;
      if (entry.kind === "file") {
        const file = await entry.getFile();
        Object.defineProperty(file, "webkitRelativePath", { value: nextPath });
        files.push(file);
      } else if (entry.kind === "directory") {
        await collectEntries(entry, nextPath);
      }
    }
  }

  await collectEntries(directory);
  clearTimeout(mergeRerunTimer);
  addMergeFiles(files);
}

els.previewModalClose.addEventListener("click", closeFolderPreview);
els.previewModal.addEventListener("click", (e) => {
  if (e.target === els.previewModal) closeFolderPreview();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeFolderPreview();
});

els.partCountInput.addEventListener("input", () => {
  const raw = els.partCountInput.value.trim();
  if (raw === "") return;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 1) state.partCount = Math.floor(n);
});
els.partCountInput.addEventListener("change", () => {
  const n = Math.floor(Number(els.partCountInput.value));
  state.partCount = Number.isFinite(n) ? Math.max(1, n) : 1;
  els.partCountInput.value = String(state.partCount);
});
bindSeg(els.modeSeg, (v) => {
  state.mode = v;
  els.axisField.classList.toggle("disabled", v !== "bands");
});
bindSeg(els.layoutSeg, (v) => {
  state.layout = v;
});
bindSeg(els.axisSeg, (v) => {
  state.axis = v;
});
for (const mode of ["all", "psd"]) {
  bindSeg(els[`${mode}LayoutSeg`], (value) => {
    state[`${mode}Layout`] = value;
  });
  els[`${mode}SplitBtn`].addEventListener("click", () => runAllSplit(mode));
  els[`${mode}DownloadAllBtn`].addEventListener("click", () => downloadAllParts(mode));
  els[`${mode}ManifestBtn`].addEventListener("click", () => downloadAllPartsManifest(mode));
}
els.axisField.classList.add("disabled");

els.psdIncludeHiddenInput.addEventListener("change", () => {
  state.psdIncludeHidden = els.psdIncludeHiddenInput.checked;
  if (state.psdSource && state.psdOutput && !partRunning.psd && !psdLoading) runPsdSplit();
});

els.splitBtn.addEventListener("click", runSplit);
els.downloadAllBtn.addEventListener("click", downloadAll);
els.manifestBtn.addEventListener("click", downloadManifest);
els.mergeBtn.addEventListener("click", runMerge);
els.gapInput.addEventListener("input", scheduleMergeRerun);
els.scaleInput.addEventListener("input", scheduleMergeRerun);
els.rotateInput.addEventListener("change", scheduleMergeRerun);
els.mergeDownloadBtn.addEventListener("click", downloadMergedImage);
els.mergeAllBtn.addEventListener("click", downloadMergedAll);
els.mergeManifestBtn.addEventListener("click", downloadMergedManifest);

let psdDragDepth = 0;
function psdDragHasFiles(event) {
  return !!event.dataTransfer && [...event.dataTransfer.types].includes("Files");
}
els.psdWorkspace.addEventListener("dragenter", (event) => {
  if (psdLoading || partRunning.psd || !psdDragHasFiles(event)) return;
  event.preventDefault();
  psdDragDepth += 1;
  els.psdWorkspace.classList.add("drop-active");
});
els.psdWorkspace.addEventListener("dragover", (event) => {
  if (psdLoading || partRunning.psd || !psdDragHasFiles(event)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
});
els.psdWorkspace.addEventListener("dragleave", () => {
  psdDragDepth = Math.max(0, psdDragDepth - 1);
  if (psdDragDepth === 0) els.psdWorkspace.classList.remove("drop-active");
});
els.psdWorkspace.addEventListener("drop", (event) => {
  event.preventDefault();
  event.stopPropagation();
  psdDragDepth = 0;
  els.psdWorkspace.classList.remove("drop-active");
  const file = event.dataTransfer
    ? [...event.dataTransfer.files].find((f) => /\.(psd|psb)$/i.test(f.name))
    : null;
  if (!file) {
    showPsdError(t("psdDropOnlyPsd"));
    return;
  }
  setMode("psd");
  loadPsdSource(file);
});

window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (event) => {
  event.preventDefault();
  const file = event.dataTransfer.files[0];
  if (!file) return;
  const mode = document.querySelector(".mode-tab.active")?.dataset.mode;
  if (/\.(psd|psb)$/i.test(file.name) || mode === "psd") {
    setMode("psd");
    loadPsdSource(file);
  } else {
    loadSource(URL.createObjectURL(file), file.name);
  }
});

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const nextThemeLabel = theme === "dark" ? t("themeLight") : t("themeDark");
  els.themeToggle.innerHTML = `<i data-lucide="${theme === "dark" ? "sun" : "moon"}" aria-hidden="true"></i><span class="theme-toggle-label">${nextThemeLabel}</span>`;
  const switchThemeKey = theme === "dark" ? "switchToLightTheme" : "switchToDarkTheme";
  els.themeToggle.setAttribute("aria-label", t(switchThemeKey));
  els.themeToggle.title = t(switchThemeKey);
  createIcons({ icons });
  localStorage.setItem("theme", theme);
}

function refreshDynamicText() {
  setBusy(partRunning.split);
  setAllBusy(partRunning.all, "all");
  setAllBusy(partRunning.psd, "psd");
  setMergeBusy(mergeRunning);
  els.psdUploadBtn.querySelector("span").textContent = psdLoading ? t("busyPsdReading") : t("uploadPsd");
  if (state.output) renderResults();
  if (state.allOutput) renderAllResults("all");
  if (state.psdOutput) renderPsdResults();
  else if (state.psdSource) refreshPsdSourceInfo();
  if (state.merge.output) renderMergeResults();
  els.folderCount.textContent = state.merge.files.length
    ? t("mergeFileCount", { count: state.merge.files.length })
    : t("mergeZeroFiles");
  if (!state.merge.output) {
    els.mergeScale.textContent = t("mergeScaleValue", { scale: 1 });
  }
}

function applyLanguage(lang) {
  setLanguage(lang);
  translateDocument();
  const targetLabel = getLanguage() === "en" ? "中文" : "EN";
  els.langToggle.innerHTML = `<i data-lucide="languages" aria-hidden="true"></i><span class="lang-toggle-label">${targetLabel}</span>`;
  const switchKey = getLanguage() === "en" ? "switchToChinese" : "switchToEnglish";
  els.langToggle.setAttribute("aria-label", t(switchKey));
  els.langToggle.title = t(switchKey);
  createIcons({ icons });
  refreshDynamicText();
  applyTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
}

els.themeToggle.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
});

els.langToggle.addEventListener("click", () => {
  applyLanguage(getLanguage() === "zh" ? "en" : "zh");
});

applyLanguage(localStorage.getItem("lang") === "en" ? "en" : "zh");
applyTheme(localStorage.getItem("theme") === "dark" ? "dark" : "light");

if (import.meta.env.DEV) {
  window.__splitterState = () => state;
}
