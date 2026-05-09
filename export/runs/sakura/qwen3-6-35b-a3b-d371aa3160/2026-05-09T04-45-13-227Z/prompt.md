Model label: qwen3.6-35b-a3b
Benchmark: Sakura Tree (sakura)
Run folder: export/runs/sakura/qwen3-6-35b-a3b-d371aa3160/2026-05-09T04-45-13-227Z

Required output:
- Save one complete self-contained HTML document to: export/runs/sakura/qwen3-6-35b-a3b-d371aa3160/2026-05-09T04-45-13-227Z/index.html
- Do not place the final HTML in any other folder.
- Do not require external network assets.
- Only create index.html; the benchmark viewer captures preview media after index.html exists.

Animate a dreamy Japanese cherry blossom tree in full bloom during a gentle petal storm. The complete tree must fit comfortably inside the viewport at all common screen sizes: the full crown, outer blossoms, side branches, trunk, and base must stay visible with at least 8-10% empty margin from the top and left/right edges. Compose the tree as a centered full-body subject, not a cropped close-up. Keep the trunk base near the lower part of the canvas, but do not let it extend below the viewport. The crown should use no more than about 80% of the canvas width and 70% of the canvas height, so no branches or blossoms are clipped. Use dark, elegant lines for the trunk and branches, with pink-white blossoms throughout. Thousands of delicate pink and white petals should fall continuously with realistic physics: subtle rotation, wind-curved paths, varied speeds, and occasional small gusts. Add a soft pastel sky gradient from light pink to lavender, distant misty mountains, a few petals accumulating on the ground, and subtle sunlight from the top right. The scene should feel poetic and serene, loop naturally, and run in real time. Use a full-page canvas and no external libraries.

Please make sure the entire tree fits cleanly within the viewport. Use the most efficient complete approach, then use Playwright screenshots to see the output yourself, check for errors, review and adjust the output until it looks correct. If you don't have access to Playwright, still double check for errors and adjust the output.

Output contract:
- Return exactly one complete self-contained HTML document.
- The document must include <!doctype html>, <html>, <head>, and <body>.
- Do not depend on external network assets or CDN libraries.
- Inline small helper functions if useful, but keep the final artifact portable as one file.
- Use no explanations, Markdown fences, commentary, or extra text before or after the HTML.