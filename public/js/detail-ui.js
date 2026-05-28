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
    showScore: Boolean(isDsRun && run.runDirectory && run.assets?.ds?.summary),
    deleteRun: Boolean(run.runDirectory),
    recaptureLabel: isVisualRun
      ? (run.assets?.preview || hasCapturedVideo(run) ? "Recapture media" : "Capture preview")
      : (run.assets?.ds?.scorecard ? "Rescore" : "Score"),
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

  const summaryHtml = renderDsSummaryCard(run);
  const chartsHtml = renderDsCharts(treatmentHref, distributionHref, completionHref);
  const scoresHtml = renderDsScores(run);

  return '<div class="ds-dashboard">' +
    summaryHtml +
    chartsHtml +
    scoresHtml +
    '</div>';
}

function renderDsSummaryCard(run) {
  const summary = run.dsSummary;
  if (!summary) return '<div class="ds-card ds-summary-card"><span class="muted-copy">No summary data.</span></div>';
  const verdict = verdictPill(summary);
  const decisionText = escapeHtml(summary.decision || '');
  const chips = (summary.metrics ?? []).map(renderMetricChip).join('');
  const warnings = (summary.warnings ?? []).length > 0
    ? '<div class="ds-warnings">' + summary.warnings.map(function(w) { return '<span class="ds-warning-tag">' + escapeHtml(w) + '</span>'; }).join('') + '</div>'
    : '';

  return '<div class="ds-card ds-summary-card">' +
    '<div class="ds-summary-top">' +
      verdict +
      '<p class="ds-decision">' + decisionText + '</p>' +
    '</div>' +
    warnings +
    '<div class="ds-metrics-strip">' + chips + '</div>' +
    '</div>';
}

function renderDsCharts(treatmentHref, distributionHref, completionHref) {
  if (!treatmentHref && !distributionHref && !completionHref) return '';
  let html = '<div class="ds-charts-row">';
  if (treatmentHref) {
    html += '<div class="ds-chart-card"><span class="ds-chart-label">Treatment effect</span><img src="' + escapeAttribute(treatmentHref) + '" alt="Treatment effect confidence interval" loading="lazy" /></div>';
  }
  if (distributionHref) {
    html += '<div class="ds-chart-card"><span class="ds-chart-label">Completion time distribution</span><img src="' + escapeAttribute(distributionHref) + '" alt="Completion time distribution" loading="lazy" /></div>';
  }
  if (completionHref) {
    html += '<div class="ds-chart-card"><span class="ds-chart-label">Guardrail metrics</span><img src="' + escapeAttribute(completionHref) + '" alt="Completion rates" loading="lazy" /></div>';
  }
  html += '</div>';
  return html;
}

function renderDsScores(run) {
  const scorecard = run.dsScorecard;
  const judgeScorecard = run.dsJudgeScorecard;
  if (!scorecard && !judgeScorecard) return '';

  let html = '<div class="ds-scores-row">';

  if (scorecard) {
    html += renderLayer1ScoreCard(scorecard);
  }

  if (judgeScorecard) {
    html += renderLayer2ScoreCard(judgeScorecard);
  }

  html += '</div>';
  return html;
}

function renderLayer1ScoreCard(scorecard) {
  const pct = scorecard.pct ?? 0;
  const earned = scorecard.earned ?? 0;
  const total = scorecard.total ?? 0;
  const tone = pct >= 80 ? 'safe' : pct >= 50 ? 'caution' : 'danger';
  const checks = scorecard.checks ?? {};

  let html = '<div class="ds-card ds-score-card">';
  html += '<div class="ds-score-card-head">';
  html += '<span class="ds-score-card-title">Layer 1 · Deterministic</span>';
  html += '<span class="ds-score-badge" data-tone="' + escapeAttribute(tone) + '">' + String(earned) + '/' + String(total) + '</span>';
  html += '</div>';
  html += '<p class="ds-score-explain">Automated checks comparing model output to the oracle. Each check has a fixed point value.</p>';
  html += renderScoreBar(scorecard);
  html += '<div class="ds-check-list">';
  Object.values(checks).forEach(function(c) {
    const icon = c.pass ? '\u2713' : '\u2717';
    const passClass = c.pass ? 'pass' : 'fail';
    html += '<div class="ds-check-item ' + passClass + '">';
    html += '<span class="ds-check-icon">' + icon + '</span>';
    html += '<span class="ds-check-label">' + escapeHtml(c.label) + '</span>';
    html += '<span class="ds-check-pts">' + String(c.earned) + '/' + String(c.max) + '</span>';
    if (c.detail) {
      html += '<span class="ds-check-detail">' + escapeHtml(c.detail) + '</span>';
    }
    html += '</div>';
  });
  html += '</div>';
  html += '</div>';
  return html;
}

function renderLayer2ScoreCard(judgeScorecard) {
  const dims = [
    { key: 'notebook_structure', label: 'Notebook structure & runnability' },
    { key: 'visualization_quality', label: 'Visualization quality' },
    { key: 'statistical_interpretation', label: 'Statistical interpretation' },
    { key: 'grounding', label: 'Grounding & data provenance' },
    { key: 'product_recommendation', label: 'Product recommendation' }
  ];
  const avg = dims.reduce(function(s, d) { return s + (judgeScorecard[d.key] ?? 0); }, 0) / dims.length;
  const avgRounded = Math.round(avg * 10) / 10;
  const avgPct = Math.round(avg / 10 * 100);
  const tone = avgPct >= 75 ? 'safe' : avgPct >= 50 ? 'caution' : 'danger';

  let html = '<div class="ds-card ds-score-card">';
  html += '<div class="ds-score-card-head">';
  html += '<span class="ds-score-card-title">Layer 2 · LLM Judge</span>';
  html += '<span class="ds-score-badge" data-tone="' + escapeAttribute(tone) + '">' + String(avgRounded) + '/10</span>';
  html += '</div>';
  html += '<p class="ds-score-explain">A second model evaluates the notebook across 5 rubric dimensions (0\u201310 each).</p>';
  html += renderJudgeBar(judgeScorecard);
  html += '<div class="ds-check-list">';
  dims.forEach(function(d) {
    const val = judgeScorecard[d.key] ?? 0;
    const icon = val >= 7 ? '\u2713' : val >= 4 ? '\u25CB' : '\u2717';
    const passClass = val >= 7 ? 'pass' : val >= 4 ? 'partial' : 'fail';
    html += '<div class="ds-check-item ' + passClass + '">';
    html += '<span class="ds-check-icon">' + icon + '</span>';
    html += '<span class="ds-check-label">' + escapeHtml(d.label) + '</span>';
    html += '<span class="ds-check-pts">' + String(val) + '/10</span>';
    html += '</div>';
  });
  html += '</div>';
  if (judgeScorecard.notes) {
    html += '<div class="ds-judge-notes">' + escapeHtml(judgeScorecard.notes) + '</div>';
  }
  html += '</div>';
  return html;
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
  const pct = scorecard.pct ?? 0;
  const tone = pct >= 80 ? 'safe' : pct >= 50 ? 'caution' : 'danger';
  return '<div class="ds-score-bar" data-tone="' + escapeAttribute(tone) + '" data-layer="1">' +
    '<div class="ds-score-track"><div class="ds-score-fill" style="width:' + String(pct) + '%"></div></div>' +
  '</div>';
}

function renderJudgeBar(judgeScorecard) {
  const dims = [
    { key: 'notebook_structure', label: 'Structure' },
    { key: 'visualization_quality', label: 'Viz' },
    { key: 'statistical_interpretation', label: 'Stats' },
    { key: 'grounding', label: 'Grounding' },
    { key: 'product_recommendation', label: 'Rec' }
  ];
  const avg = dims.reduce((s, d) => s + (judgeScorecard[d.key] ?? 0), 0) / dims.length;
  const avgPct = Math.round(avg / 10 * 100);
  const tone = avgPct >= 75 ? 'safe' : avgPct >= 50 ? 'caution' : 'danger';
  return '<div class="ds-score-bar" data-tone="' + escapeAttribute(tone) + '" data-layer="2">' +
    '<div class="ds-score-track"><div class="ds-score-fill" style="width:' + String(avgPct) + '%"></div></div>' +
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