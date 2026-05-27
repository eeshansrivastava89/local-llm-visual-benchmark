import { assetHref } from "./assets.js";
import { displayRunError, hasCapturedVideo, runCardState, runKind, runRecordText, stackAttemptIdentity } from "./runs.js";
import { renderStackPill } from "./stack-pills.js";
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
  const kind = runKind(run);
  const isVisualRun = kind === "visual";
  const isDsRun = kind === "data-science";
  return {
    openHtml: Boolean(isVisualRun && run.runDirectory && run.assets?.html),
    openRunFolder: Boolean(run.runDirectory),
    copyPath: Boolean(run.runDirectory),
    showCapture: Boolean(isVisualRun),
    capture: Boolean(isVisualRun && run.runDirectory && run.assets?.html),
    deleteRun: Boolean(run.runDirectory),
    recaptureLabel: run.assets?.preview || hasCapturedVideo(run) ? "Recapture media" : "Capture preview",
    openNotebook: Boolean(isDsRun && run.assets?.ds?.notebook && run.runDirectory)
  };
}

function renderDetailMeta(run) {
  const stateLabel = runCardState(run);
  const stack = stackAttemptIdentity(run);
  const completedAt = run.completedAt || run.capture?.video?.capturedAt || run.capture?.preview?.capturedAt;
  return (
    '<span class="meta-label">State</span><strong>' + escapeHtml(stateLabel.label) + "</strong>" +
    '<span class="meta-label">Backend</span><strong>' + renderStackPill(stack.backend ?? "source unrecorded", "backend") + "</strong>" +
    '<span class="meta-label">Harness</span><strong>' + renderStackPill(stack.harness ?? "manual", "harness") + "</strong>" +
    '<span class="meta-label">Model</span><strong>' + escapeHtml(run.model?.id ?? "-") + "</strong>" +
    '<span class="meta-label">Created</span><strong>' + escapeHtml(formatDateTime(run.createdAt)) + "</strong>" +
    '<span class="meta-label">Updated</span><strong>' + escapeHtml(formatDateTime(run.updatedAt)) + "</strong>" +
    (completedAt ? '<span class="meta-label">Captured</span><strong>' + escapeHtml(formatDateTime(completedAt)) + "</strong>" : "")
  );
}

function renderDetailArtifact(run) {
  if (runKind(run) === "data-science") {
    return renderDataScienceArtifact(run);
  }
  return renderVisualArtifact(run);
}

function renderDataScienceArtifact(run) {
  const ds = run.assets?.ds ?? {};
  const hasCharts = ds.chartTreatmentEffect || ds.chartDistribution || ds.chartCompletionRates;
  if (!hasCharts && !ds.summary) {
    return renderDetailEmpty(run, "Save analysis outputs into the run folder.");
  }
  const treatmentHref = assetHref(run, ds.chartTreatmentEffect);
  const distributionHref = assetHref(run, ds.chartDistribution);
  const completionHref = assetHref(run, ds.chartCompletionRates);
  let html = '<div class="ds-triptych">';
  if (treatmentHref) {
    html += '<div class="ds-chart-full"><img src="' + escapeAttribute(treatmentHref) + '" alt="Treatment effect confidence interval" loading="lazy" /></div>';
  }
  html += '<div class="ds-chart-pair">';
  if (distributionHref) {
    html += '<div class="ds-chart-half"><img src="' + escapeAttribute(distributionHref) + '" alt="Completion time distribution" loading="lazy" /></div>';
  }
  if (completionHref) {
    html += '<div class="ds-chart-half"><img src="' + escapeAttribute(completionHref) + '" alt="Completion rates" loading="lazy" /></div>';
  }
  html += '</div></div>';
  html += renderMetricsRibbon(run);
  return html;
}

function renderMetricsRibbon(run) {
  const summary = run.dsSummary;
  if (!summary) return '';
  const verdict = verdictPill(summary);
  const chips = (summary.metrics ?? []).map(renderMetricChip).join('');
  const scoreBar = renderScoreBar(run.dsScorecard);
  return '<div class="ds-ribbon">' + verdict + chips + '</div>' + scoreBar;
}

function verdictPill(summary) {
  const tone = summary.status === 'significant'
    ? (summary.recommended_variant === 'B' ? 'safe' : 'danger')
    : summary.status === 'not_significant'
      ? 'caution'
      : 'caution';
  const label = summary.status === 'significant'
    ? (summary.recommended_variant === 'B' ? 'Ship B' : 'Ship A')
    : 'Inconclusive';
  return '<span class="verdict-pill" data-verdict="' + escapeAttribute(tone) + '">' + escapeHtml(label) + '</span>';
}

function renderMetricChip(metric) {
  if (!metric.value) return '';
  const direction = metric.delta_direction ? ' data-direction="' + escapeAttribute(metric.delta_direction) + '"' : '';
  return '<span class="ds-chip"' + direction + '>' +
    '<span class="ds-chip-label">' + escapeHtml(metric.label) + '</span>' +
    '<span class="ds-chip-value">' + escapeHtml(metric.value) + '</span>' +
  '</span>';
}

function renderScoreBar(scorecard) {
  if (!scorecard) return '';
  const pct = scorecard.pct ?? 0;
  const earned = scorecard.earned ?? 0;
  const total = scorecard.total ?? 0;
  const tone = pct >= 80 ? 'safe' : pct >= 50 ? 'caution' : 'danger';
  const checks = scorecard.checks ?? {};
  const indicators = Object.values(checks).map(function(c) {
    const symbol = c.pass ? '\u2713' : '\u2717';
    return '<span class="ds-check-dot" data-pass="' + (c.pass ? '1' : '0') + '"/' + String(c.earned) + '"' + escapeHtml(c.label) + '">' + symbol + '</span>';
  }).join('');
  return '<div class="ds-score-bar" data-tone="' + escapeAttribute(tone) + '">' +
    '<div class="ds-score-track"><div class="ds-score-fill" style="width:' + String(pct) + '%"></div></div>' +
    '<div class="ds-score-text">' + String(earned) + '/' + String(total) + ' ' + String(pct) + '%</div>' +
    '<div class="ds-score-dots">' + indicators + '</div>' +
  '</div>';
}

function renderDetailEmpty(run, preparedHint) {
  if (run.assets?.html) {
    return '<span class="artifact-empty">' +
      '<strong>Video not captured yet</strong>' +
      '<span>Use Capture preview in server mode to generate preview.png and preview video from the saved index.html source.</span>' +
      "</span>";
  }
  const hint = run.status === "prepared"
    ? (preparedHint ?? "Save index.html into the run folder, then run Capture preview.")
    : (displayRunError(run) ?? "No output is available for this run.");
  return '<span class="artifact-empty">' +
    '<strong>' + escapeHtml(run.status === "prepared" ? "Run slot prepared" : "Artifact unavailable") + "</strong>" +
    '<span>' + escapeHtml(hint) + "</span>" +
    "</span>";
}

function renderVisualArtifact(run) {
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

  return renderDetailEmpty(run);
}