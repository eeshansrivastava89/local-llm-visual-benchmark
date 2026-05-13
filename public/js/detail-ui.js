import { assetHref } from "./assets.js";
import { displayRunError, hasCapturedVideo, runCardState, runKind, runRecordText, stackAttemptIdentity } from "./runs.js";
import { escapeAttribute, escapeHtml, formatDateTime } from "./utils.js";

export function detailViewModel(run) {
  const textRecord = runRecordText(run);
  return {
    title: run.benchmark?.title ?? "Run detail",
    subtitle: (run.model?.id ?? "Unknown model") + " · updated " + formatDateTime(run.updatedAt ?? run.createdAt),
    previewHtml: renderDetailArtifact(run),
    textRecord,
    promptText: textRecord.value || textRecord.emptyText,
    promptLength: textRecord.value ? textRecord.value.length.toLocaleString() + " chars" : "missing",
    canCopyPrompt: Boolean(textRecord.value),
    metaHtml: renderDetailMeta(run)
  };
}

export function detailActionAvailability(run) {
  const isVisualRun = runKind(run) === "visual";
  return {
    openHtml: Boolean(isVisualRun && run.runDirectory && run.assets?.html),
    openRunFolder: Boolean(run.runDirectory),
    copyPath: Boolean(run.runDirectory),
    showCapture: Boolean(isVisualRun),
    capture: Boolean(isVisualRun && run.runDirectory && run.assets?.html),
    deleteRun: Boolean(run.runDirectory),
    recaptureLabel: run.assets?.preview || hasCapturedVideo(run) ? "Recapture media" : "Capture preview"
  };
}

function renderDetailMeta(run) {
  const stateLabel = runCardState(run);
  const stack = stackAttemptIdentity(run);
  const completedAt = run.completedAt || run.capture?.video?.capturedAt || run.capture?.preview?.capturedAt;
  return (
    '<span class="meta-label">State</span><strong>' + escapeHtml(stateLabel.label) + "</strong>" +
    '<span class="meta-label">Backend</span><strong>' + escapeHtml(stack.backend ?? "source unrecorded") + "</strong>" +
    '<span class="meta-label">Harness</span><strong>' + escapeHtml(stack.harness ?? "manual") + "</strong>" +
    '<span class="meta-label">Model</span><strong>' + escapeHtml(run.model?.id ?? "-") + "</strong>" +
    '<span class="meta-label">Created</span><strong>' + escapeHtml(formatDateTime(run.createdAt)) + "</strong>" +
    '<span class="meta-label">Updated</span><strong>' + escapeHtml(formatDateTime(run.updatedAt)) + "</strong>" +
    (completedAt ? '<span class="meta-label">Captured</span><strong>' + escapeHtml(formatDateTime(completedAt)) + "</strong>" : "")
  );
}

function renderDetailArtifact(run) {
  const videoHref = assetHref(run, run.assets?.video);
  const mp4Href = assetHref(run, run.assets?.videoMp4);
  if (videoHref || mp4Href) {
    const firstVideoHref = mp4Href || videoHref;
    const previewHref = assetHref(run, run.assets?.preview);
    return '<video class="artifact-video" src="' + escapeAttribute(firstVideoHref) + '" ' +
      (previewHref ? 'poster="' + escapeAttribute(previewHref) + '" ' : '') +
      'autoplay muted loop playsinline controls>' +
      (mp4Href ? '<source src="' + escapeAttribute(mp4Href) + '" type="video/mp4" />' : '') +
      (videoHref ? '<source src="' + escapeAttribute(videoHref) + '" type="video/webm" />' : '') +
      '</video>';
  }

  const previewHref = assetHref(run, run.assets?.preview);
  if (previewHref) {
    return '<span class="artifact-image"><img src="' + escapeAttribute(previewHref) + '" alt="" /></span>';
  }

  if (run.assets?.html) {
    return '<span class="artifact-empty">' +
      '<strong>Video not captured yet</strong>' +
      '<span>Use Capture preview in server mode to generate preview.png and preview video from the saved index.html source.</span>' +
      "</span>";
  }

  return '<span class="artifact-empty">' +
    '<strong>' + escapeHtml(run.status === "prepared" ? "Run slot prepared" : "Artifact unavailable") + "</strong>" +
    '<span>' + escapeHtml(run.status === "prepared" ? "Save index.html into the run folder, then run Capture preview." : displayRunError(run) ?? "No captured video is available for this run.") + "</span>" +
    "</span>";
}
