---
id: macro-wildflower-meadow
title: Macro Wildflower Meadow
description: Close-up colorful meadow scene with detailed butterflies, bees, flowers, and wind motion.
---

Create a complete, self-contained HTML file for the request below.
Write the file as `index.html` in the current working directory.
Do not create any folders, do not infer a filesystem path, and do not print the HTML in chat.

The HTML must include all CSS and JavaScript inline and must not depend on external network assets.
Create a full-screen animated close-up meadow scene on a bright breezy day, viewed from just above flower height as if the camera is inside a small patch of wildflowers. Keep the composition intimate and readable: show foreground flowers with detailed petals, stems, leaves, and pollen centers. Around them, animate butterflies and bees moving through the scene. The insects should be large enough to see details: butterfly wing patterns, antennae, soft body shapes, bee stripes, tiny wings, and curved flight paths.

Use a vivid imaginative color palette with saturated flower colors, fresh greens, warm sunlight, and playful accents. The model may choose the flower and butterfly colors freely, but the scene should feel joyful, lush, and eye-catching as a gallery thumbnail. Add wind motion: flower stems should sway gently, petals should flutter, leaves should tilt, and insects should adjust their flight as if riding small gusts. Include a softly blurred background with hints of more flowers and sky, but keep the foreground flowers and insects as the clear focus.

Keep the implementation performant while maximizing creativity. The animation should loop naturally, run smoothly, adapt to the browser viewport, and keep the foreground flowers and insects visible without cropping. Use a full-page canvas or SVG and no external libraries.

After generating the HTML, review it with Playwright. First confirm it opens and runs with no JavaScript syntax or console errors — if it's broken, fix the root cause before anything else. Then check the visual criteria with one or two screenshots; if they're already met and there are no errors, stop and make no changes. When something is genuinely wrong, identify the root cause and fix it with one decisive change rather than many small cosmetic tweaks. Keep it to a few steps — do not over-engineer or refine indefinitely, and stop once the animation meets the stated criteria and runs at the target frame rate.

Optimize for smooth playback: the scene should animate at 30+ fps at 1080p. Prefer lightweight rendering for insects and moving foliage, batch canvas operations, and avoid heavy per-frame effects that would drop the frame rate.
