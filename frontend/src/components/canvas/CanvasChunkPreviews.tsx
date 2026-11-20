import { useEffect, useMemo, useRef } from "react";
import { roundScaleForTransform, useTransformContext } from "react-zoom-pan-pinch";

import {
  decodeEdgeNibbleMap,
  decodeMineBitmap,
  isMineInBitmap,
  type CanvasChunk,
  type CanvasChunkAreaResponse,
} from "@/lib/canvas/api";
import { CHUNK_EDGE_INDEX_BY_LOCAL, CHUNK_SIZE, iterateAdjacentOffsets } from "@/lib/canvas/coordinates";
import { CHUNK_ORIGIN_OFFSET, CHUNK_PIXEL_SIZE } from "./CanvasViewport";

const CELL_SIZE = CHUNK_PIXEL_SIZE / CHUNK_SIZE;
const MINE = 255;
const FONT = "18px MineSweeper";
const MAX_PREVIEW_PIXELS = 4 * 1024 ** 2; // 16 MiB at four bytes per pixel.

const getPreviewCells = (chunk: CanvasChunk) => {
  const mines = decodeMineBitmap(chunk.mineBitmap);
  const edgeCounts = decodeEdgeNibbleMap(chunk.edgeNibbleMap);
  const cells = new Uint8Array(CHUNK_SIZE ** 2);

  for (let row = 0; row < CHUNK_SIZE; row++) {
    const localY = CHUNK_SIZE - 1 - row;
    for (let localX = 0; localX < CHUNK_SIZE; localX++) {
      const index = row * CHUNK_SIZE + localX;
      if (mines && isMineInBitmap(mines, localX, localY)) {
        cells[index] = MINE;
        continue;
      }

      const edgeIndex = CHUNK_EDGE_INDEX_BY_LOCAL.get(`${localX}:${localY}`);
      let count = edgeIndex === undefined ? 0 : (edgeCounts?.[edgeIndex] ?? 0);
      if (mines) {
        iterateAdjacentOffsets((dx, dy) => {
          const x = localX + dx;
          const y = localY + dy;
          if (x >= 0 && x < CHUNK_SIZE && y >= 0 && y < CHUNK_SIZE && isMineInBitmap(mines, x, y)) {
            count++;
          }
        });
      }
      cells[index] = count;
    }
  }

  return cells;
};

const getColors = () => {
  const styles = getComputedStyle(document.documentElement);
  return {
    border: styles.getPropertyValue("--game-border"),
    hidden: styles.getPropertyValue("--game-hidden"),
    revealed: styles.getPropertyValue("--game-revealed"),
    numbers: Array.from({ length: 8 }, (_, i) => styles.getPropertyValue(`--game-number-${i + 1}`)),
  };
};

export const CanvasChunkPreviews = ({
  chunkArea,
  showMySolvedOnly,
}: {
  chunkArea: CanvasChunkAreaResponse | null;
  showMySolvedOnly: boolean;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const transform = useTransformContext();
  const previews = useMemo(() => (chunkArea?.chunks ?? []).filter(
    (chunk) => chunk.state === "solved" && chunk.mineBitmap !== null,
  ), [chunkArea]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const cellsByChunk = new WeakMap<CanvasChunk, Uint8Array>();
    let colors = getColors();
    let frame: number | undefined;
    let active = true;

    const draw = () => {
      frame = undefined;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;

      const resolution = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(MAX_PREVIEW_PIXELS / (width * height)));
      const pixelWidth = Math.max(1, Math.floor(width * resolution));
      const pixelHeight = Math.max(1, Math.floor(height * resolution));
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;

      const { positionX, positionY } = transform.state;
      const scale = roundScaleForTransform(transform.state.scale);
      const chunkSize = CHUNK_PIXEL_SIZE * scale;
      context.resetTransform();
      context.clearRect(0, 0, pixelWidth, pixelHeight);
      context.textAlign = "center";
      context.textBaseline = "alphabetic";
      context.font = FONT;
      const metrics = context.measureText("8");
      const textCenterX = (CELL_SIZE + metrics.actualBoundingBoxLeft - metrics.actualBoundingBoxRight) / 2;
      const textCenterY = (CELL_SIZE + metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;

      const pixelScaleX = pixelWidth / width;
      const pixelScaleY = pixelHeight / height;
      for (const chunk of previews) {
        const left = positionX + (chunk.chunkX * CHUNK_PIXEL_SIZE + CHUNK_ORIGIN_OFFSET) * scale;
        const top = positionY + (-chunk.chunkY * CHUNK_PIXEL_SIZE + CHUNK_ORIGIN_OFFSET) * scale;
        if (left >= width || left + chunkSize <= 0 || top >= height || top + chunkSize <= 0) continue;

        let cells = cellsByChunk.get(chunk);
        if (!cells) {
          cells = getPreviewCells(chunk);
          cellsByChunk.set(chunk, cells);
        }

        context.setTransform(scale * pixelScaleX, 0, 0, scale * pixelScaleY, left * pixelScaleX, top * pixelScaleY);
        context.fillStyle = colors.border;
        context.fillRect(0, 0, CHUNK_PIXEL_SIZE, CHUNK_PIXEL_SIZE);
        for (let row = 0; row < CHUNK_SIZE; row++) {
          for (let column = 0; column < CHUNK_SIZE; column++) {
            const value = cells[row * CHUNK_SIZE + column];
            const x = column * CELL_SIZE;
            const y = row * CELL_SIZE;
            context.fillStyle = value === MINE ? colors.hidden : colors.revealed;
            context.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
            if (value) {
              context.fillStyle = value === MINE ? "#ef4444" : colors.numbers[(value - 1) % 8];
              context.fillText(value === MINE ? "`" : String(value), x + textCenterX, y + textCenterY);
            }
          }
        }

        if (showMySolvedOnly && !chunk.isSolvedByMe) {
          // Fade the finished preview as a whole, like the chunk's CSS opacity.
          context.globalCompositeOperation = "destination-out";
          context.fillStyle = "rgba(0, 0, 0, 0.75)";
          context.fillRect(0, 0, CHUNK_PIXEL_SIZE, CHUNK_PIXEL_SIZE);
          context.globalCompositeOperation = "source-over";
        }
      }
    };

    const scheduleDraw = () => {
      if (active && frame === undefined) frame = requestAnimationFrame(draw);
    };
    const unsubscribe = transform.onChange(scheduleDraw);
    const resizeObserver = new ResizeObserver(scheduleDraw);
    resizeObserver.observe(canvas);
    const themeObserver = new MutationObserver(() => {
      colors = getColors();
      scheduleDraw();
    });
    themeObserver.observe(document.documentElement, { attributeFilter: ["class"] });
    if (!document.fonts.check(FONT)) void document.fonts.load(FONT).then(scheduleDraw, () => {});
    scheduleDraw();

    return () => {
      active = false;
      if (frame !== undefined) cancelAnimationFrame(frame);
      unsubscribe();
      resizeObserver.disconnect();
      themeObserver.disconnect();
      if (!canvas.isConnected) canvas.width = canvas.height = 1;
    };
  }, [previews, showMySolvedOnly, transform]);

  return previews.length > 0 ? (
    <canvas ref={canvasRef} width={1} height={1} aria-hidden className="pointer-events-none absolute inset-0 size-full" />
  ) : null;
};
