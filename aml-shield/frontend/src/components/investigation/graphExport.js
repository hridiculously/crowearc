// ═══════════════════════════════════════════════════════════════════════════
// graphExport — PNG capture helpers for the CCEG canvas.
//
// We grab the underlying <canvas> element from the ForceGraph2D container
// (the library renders one) and composite a header strip on top with the
// focus customer, timestamp, and analyst name, so the exported image is
// self-identifying when it lands in case evidence.
//
// captureCanvasPng({container, header})  →  Blob (image/png)
// downloadPng(filename, blob)            →  triggers browser download
// ═══════════════════════════════════════════════════════════════════════════

// Renders the canvas + a 56px header strip into a fresh canvas and returns
// a PNG blob. Throws if the container has no <canvas> element yet (which
// can happen if the analyst clicks Export before the graph has rendered).
export async function captureCanvasPng({ container, header }) {
  if (!container) throw new Error('No container');
  const src = container.querySelector('canvas');
  if (!src) throw new Error('Canvas not ready');

  const HEADER_H = 56;
  const w = src.width;
  const h = src.height + HEADER_H;

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');

  // Header band.
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, w, HEADER_H);

  // Header text — focus customer + window + analyst + timestamp.
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 14px Inter, sans-serif';
  ctx.textBaseline = 'middle';
  const title = header?.title || 'Entity Network';
  ctx.fillText(title, 16, 20);

  ctx.font = '11px Inter, sans-serif';
  ctx.fillStyle = '#CBD5E1';
  const meta = [
    header?.subtitle,
    header?.window ? `Window: ${header.window}` : null,
    header?.analyst ? `Exported by ${header.analyst}` : null,
    header?.timestamp || new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC'
  ].filter(Boolean).join(' · ');
  ctx.fillText(meta, 16, 40);

  // Graph canvas painted underneath the header.
  ctx.drawImage(src, 0, HEADER_H);

  return await new Promise((resolve, reject) => {
    out.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
  });
}

export function downloadPng(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Helper: turn a Blob into a File (for FormData uploads). Blob is fine
// for fetch() but case-documents uses multer which prefers a real File.
export function blobToFile(blob, filename) {
  return new File([blob], filename, { type: blob.type, lastModified: Date.now() });
}
