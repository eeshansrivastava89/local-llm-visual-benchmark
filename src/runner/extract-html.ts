import type { RunPaths } from "./paths";
import { markRunFailed, writeRawResponse, writeRunHtml } from "./runs";

const FENCED_HTML_PATTERN = /```html\s*([\s\S]*?)```/i;

export interface WriteExtractedHtmlRunOptions {
  now?: Date;
}

export class HtmlExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HtmlExtractionError";
  }
}

export function extractHtmlDocument(rawResponse: string): string {
  const fenced = rawResponse.match(FENCED_HTML_PATTERN);
  const candidate = fenced?.[1] ?? extractDocumentCandidate(rawResponse);

  if (!candidate) {
    throw new HtmlExtractionError("No HTML document found in model response.");
  }

  const html = candidate.trim();
  validateDocumentMarkers(html);
  return html;
}

export async function writeExtractedHtmlRun(
  paths: RunPaths,
  rawResponse: string,
  options: WriteExtractedHtmlRunOptions = {}
): Promise<string> {
  await writeRawResponse(paths, rawResponse);

  try {
    const html = extractHtmlDocument(rawResponse);
    await writeRunHtml(paths, html);
    return html;
  } catch (error) {
    await markRunFailed(paths, error, options.now);
    throw error;
  }
}

function extractDocumentCandidate(rawResponse: string): string | undefined {
  const lower = rawResponse.toLowerCase();
  const doctypeIndex = lower.indexOf("<!doctype");
  const htmlIndex = lower.indexOf("<html");
  const endHtmlIndex = lower.lastIndexOf("</html>");

  if (doctypeIndex === -1 && htmlIndex === -1) {
    return undefined;
  }

  if (endHtmlIndex === -1) {
    return rawResponse.slice(firstDocumentMarkerIndex(doctypeIndex, htmlIndex));
  }

  return rawResponse.slice(
    firstDocumentMarkerIndex(doctypeIndex, htmlIndex),
    endHtmlIndex + "</html>".length
  );
}

function firstDocumentMarkerIndex(doctypeIndex: number, htmlIndex: number): number {
  if (doctypeIndex === -1) {
    return htmlIndex;
  }

  if (htmlIndex === -1) {
    return doctypeIndex;
  }

  return Math.min(doctypeIndex, htmlIndex);
}

function validateDocumentMarkers(html: string): void {
  const requiredMarkers = [
    /<!doctype\s+html/i,
    /<html[\s>]/i,
    /<head[\s>]/i,
    /<body[\s>]/i,
    /<\/html>/i
  ];

  if (!requiredMarkers.every((marker) => marker.test(html))) {
    throw new HtmlExtractionError(
      "Extracted HTML is missing required HTML document markers: doctype, html, head, and body."
    );
  }
}
