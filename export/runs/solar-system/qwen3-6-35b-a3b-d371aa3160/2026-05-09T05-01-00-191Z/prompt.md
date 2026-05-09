Model label: qwen3.6-35b-a3b
Benchmark: Solar System (solar-system)
Run folder: export/runs/solar-system/qwen3-6-35b-a3b-d371aa3160/2026-05-09T05-01-00-191Z

Required output:
- Save one complete self-contained HTML document to: export/runs/solar-system/qwen3-6-35b-a3b-d371aa3160/2026-05-09T05-01-00-191Z/index.html
- Do not place the final HTML in any other folder.
- Do not require external network assets.
- Only create index.html; the benchmark viewer captures preview media after index.html exists.

Build an HTML animation of the solar system with the Sun at the center and all planets orbiting around it. Make the scene as realistic as practical while keeping all planets visible: the Sun should glow clearly but must not be so large that it hides or overwhelms Mercury, Venus, Earth, or Mars. Preserve the relative scale of orbital distances, use accurate orbital shapes, realistic planet colors, and visible rings where appropriate. Show the system from roughly a 30-degree viewing angle rather than directly overhead. Include as many realistic visual details as possible while keeping the animation smooth.

Use the most efficient complete approach, then use Playwright screenshots to see the output yourself, check for errors, review and adjust the output until it looks correct. If you don't have access to Playwright, still double check for errors and adjust the output.

Output contract:
- Return exactly one complete self-contained HTML document.
- The document must include <!doctype html>, <html>, <head>, and <body>.
- Do not depend on external network assets or CDN libraries.
- Inline small helper functions if useful, but keep the final artifact portable as one file.
- Use no explanations, Markdown fences, commentary, or extra text before or after the HTML.