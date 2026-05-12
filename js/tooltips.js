import { els } from "./dom.js";
import { clamp } from "./utils.js";

export function wireHelpTooltips() {
  document.querySelectorAll("[data-tooltip]").forEach((button) => {
    if (button.classList.contains("source-status-pill")) {
      button.addEventListener("mousemove", () => showHelpTooltip(button));
      button.addEventListener("mouseleave", hideHelpTooltip);
      return;
    }
    button.addEventListener("mouseenter", () => showHelpTooltip(button));
    button.addEventListener("focus", () => showHelpTooltip(button));
    button.addEventListener("mouseleave", hideHelpTooltip);
    button.addEventListener("blur", hideHelpTooltip);
  });
  window.addEventListener("resize", hideHelpTooltip);
  document.addEventListener("scroll", hideHelpTooltip, true);
}

function showHelpTooltip(anchor) {
  const text = anchor.dataset.tooltip?.trim();
  if (!text) return;
  if (anchor.dataset.tooltipKind === "machine" && anchor.dataset.tooltipHtml) {
    els.helpTooltip.innerHTML = anchor.dataset.tooltipHtml;
    els.helpTooltip.dataset.kind = "machine";
  } else {
    els.helpTooltip.textContent = text;
    delete els.helpTooltip.dataset.kind;
  }
  els.helpTooltip.hidden = false;

  const anchorRect = anchor.getBoundingClientRect();
  const tooltipRect = els.helpTooltip.getBoundingClientRect();
  const gap = 8;
  const viewportGap = 12;
  if (anchor.dataset.tooltipKind === "machine") {
    const rawLeft = anchorRect.left + (anchorRect.width - tooltipRect.width) / 2;
    const rawTop = anchorRect.bottom + gap;
    const left = clamp(rawLeft, viewportGap, window.innerWidth - tooltipRect.width - viewportGap);
    const top = clamp(rawTop, viewportGap, window.innerHeight - tooltipRect.height - viewportGap);
    els.helpTooltip.style.left = left + "px";
    els.helpTooltip.style.top = top + "px";
    return;
  }

  if (anchor.classList.contains("source-status-pill")) {
    const canPlaceAbove = anchorRect.top - tooltipRect.height - gap >= viewportGap;
    const rawLeft = anchorRect.left;
    const rawTop = canPlaceAbove
      ? anchorRect.top - tooltipRect.height - gap
      : anchorRect.bottom + gap;
    const left = clamp(rawLeft, viewportGap, window.innerWidth - tooltipRect.width - viewportGap);
    const top = clamp(rawTop, viewportGap, window.innerHeight - tooltipRect.height - viewportGap);
    els.helpTooltip.style.left = left + "px";
    els.helpTooltip.style.top = top + "px";
    return;
  }
  const spaceRight = window.innerWidth - anchorRect.right;
  const side = spaceRight >= tooltipRect.width + gap + viewportGap ? "right" : "left";
  const rawLeft = side === "right"
    ? anchorRect.right + gap
    : anchorRect.left - tooltipRect.width - gap;
  const rawTop = anchorRect.top + (anchorRect.height - tooltipRect.height) / 2;
  const left = clamp(rawLeft, viewportGap, window.innerWidth - tooltipRect.width - viewportGap);
  const top = clamp(rawTop, viewportGap, window.innerHeight - tooltipRect.height - viewportGap);

  els.helpTooltip.style.left = left + "px";
  els.helpTooltip.style.top = top + "px";
}

function hideHelpTooltip() {
  els.helpTooltip.hidden = true;
  delete els.helpTooltip.dataset.kind;
}
