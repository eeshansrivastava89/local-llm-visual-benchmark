Model label: google_gemma-4-31b-it
Benchmark: Macro Wildflower Meadow (macro-wildflower-meadow)
Run folder: export/runs/macro-wildflower-meadow/google-gemma-4-31b-it-5960b9a04a/2026-05-09T06-24-42-350Z

Required output:
- Save one complete self-contained HTML document to: export/runs/macro-wildflower-meadow/google-gemma-4-31b-it-5960b9a04a/2026-05-09T06-24-42-350Z/index.html
- Do not place the final HTML in any other folder.
- Do not require external network assets.
- Only create index.html; the benchmark viewer captures preview media after index.html exists.

Create a full-screen animated close-up meadow scene on a bright breezy day, viewed from just above flower height as if the camera is inside a small patch of wildflowers. Keep the composition intimate and readable: show about five to seven large foreground flowers with detailed petals, stems, leaves, and pollen centers, rather than a huge field of tiny flowers. Around them, animate a few butterflies and bees moving through the scene. The insects should be large enough to see details: butterfly wing patterns, antennae, soft body shapes, bee stripes, tiny wings, and curved flight paths.

Use a vivid imaginative color palette with saturated flower colors, fresh greens, warm sunlight, and playful accents. The model may choose the flower and butterfly colors freely, but the scene should feel joyful, lush, and eye-catching as a gallery thumbnail. Add wind motion: flower stems should sway gently, petals should flutter, leaves should tilt, and insects should adjust their flight as if riding small gusts. Include a softly blurred background with hints of more flowers and sky, but keep the foreground flowers and insects as the clear focus.

Keep the implementation performant while maximizing creativity. The animation should loop naturally, run smoothly, and adapt to any viewport size. Use a full-page canvas or SVG and no external libraries. Use the most efficient complete approach, then use Playwright screenshots to see the output yourself, check for errors, review and adjust the output until it looks correct. If you don't have access to Playwright, still double check for errors and adjust the output.

Output contract:
- Return exactly one complete self-contained HTML document.
- The document must include <!doctype html>, <html>, <head>, and <body>.
- Do not depend on external network assets or CDN libraries.
- Inline small helper functions if useful, but keep the final artifact portable as one file.
- Use no explanations, Markdown fences, commentary, or extra text before or after the HTML.