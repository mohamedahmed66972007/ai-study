import { createRequire } from "node:module";
import {
  getDocument,
  GlobalWorkerOptions,
} from "pdfjs-dist/legacy/build/pdf.mjs";

interface PdfTextItem {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
  hasEOL?: boolean;
  dir?: string;
}

const RTL_RE =
  /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

const localRequire = createRequire(import.meta.url);
try {
  GlobalWorkerOptions.workerSrc = localRequire.resolve(
    "pdfjs-dist/legacy/build/pdf.worker.mjs",
  );
} catch {
  // worker resolution failure is non-fatal; pdfjs falls back to a fake worker
}

export interface ExtractedPdf {
  totalPages: number;
  pages: { pageNumber: number; content: string }[];
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export async function extractPdfPages(buffer: Buffer): Promise<ExtractedPdf> {
  const data = new Uint8Array(buffer);
  const loadingTask = getDocument({
    data,
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
  });

  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;
  const pages: ExtractedPdf["pages"] = [];

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();

    type Positioned = {
      str: string;
      x: number;
      y: number;
      width: number;
      height: number;
    };

    const positioned: Positioned[] = [];
    for (const raw of tc.items as PdfTextItem[]) {
      if (typeof raw.str !== "string" || raw.str.length === 0) continue;
      const t = raw.transform ?? [1, 0, 0, 1, 0, 0];
      positioned.push({
        str: raw.str,
        x: t[4] ?? 0,
        y: t[5] ?? 0,
        width: raw.width ?? 0,
        height: raw.height ?? Math.abs(t[3] ?? 12),
      });
    }

    // Group items into lines by Y. Tolerance scales with the median glyph height.
    const heights = positioned.map((p) => p.height).filter((h) => h > 0);
    heights.sort((a, b) => a - b);
    const medianHeight =
      heights.length > 0 ? heights[Math.floor(heights.length / 2)] : 12;
    const yTolerance = Math.max(2, medianHeight * 0.5);

    const sortedByY = [...positioned].sort((a, b) => b.y - a.y); // PDF y axis: larger = higher on page
    const lineGroups: Positioned[][] = [];
    for (const item of sortedByY) {
      const group = lineGroups[lineGroups.length - 1];
      if (group && Math.abs(group[0]!.y - item.y) <= yTolerance) {
        group.push(item);
      } else {
        lineGroups.push([item]);
      }
    }

    const lines: string[] = [];
    for (const group of lineGroups) {
      const lineText = group.map((g) => g.str).join("");
      const isRTL = RTL_RE.test(lineText);
      // For RTL we want right-to-left visual order (descending X first).
      group.sort((a, b) => (isRTL ? b.x - a.x : a.x - b.x));

      // Re-assemble, adding a space when the visual gap between fragments is
      // larger than ~30% of the glyph width — this keeps Arabic ligatures
      // joined while still separating words.
      let line = "";
      for (let idx = 0; idx < group.length; idx++) {
        const cur = group[idx]!;
        if (idx === 0) {
          line += cur.str;
          continue;
        }
        const prev = group[idx - 1]!;
        const gap = isRTL
          ? prev.x - (cur.x + cur.width)
          : cur.x - (prev.x + prev.width);
        const avgCharW =
          (prev.width || medianHeight) /
          Math.max(1, prev.str.replace(/\s/g, "").length);
        const needsSpace =
          gap > avgCharW * 0.3 &&
          !/\s$/.test(line) &&
          !/^\s/.test(cur.str);
        if (needsSpace) line += " ";
        line += cur.str;
      }
      const cleaned = line.replace(/\s+/g, " ").trim();
      if (cleaned) lines.push(cleaned);
    }

    const content = normalizeText(lines.join("\n"));
    pages.push({ pageNumber: i, content });
    page.cleanup();
  }

  await pdf.cleanup();
  await pdf.destroy();
  return { totalPages, pages };
}
