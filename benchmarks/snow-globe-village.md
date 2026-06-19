---
id: snow-globe-village
title: Snow Globe Village
description: Magical snow globe with a cozy winter village, swirling snow, glass shine, and Santa sleigh loop.
---

Create a complete, self-contained HTML file for the request below.
Write the file as `index.html` in the current working directory.
Do not create any folders, do not infer a filesystem path, and do not print the HTML in chat.

The HTML must include all CSS and JavaScript inline and must not depend on external network assets.
Create a full-screen animated snow globe scene. The snow globe should sit centered on a warm wooden table and must fit comfortably inside the viewport, with the full glass dome, base, and reflections visible without cropping. Inside the globe, build a cozy alpine winter village with small houses, glowing windows, pine trees, snowy hills, and a simple clock tower or chapel silhouette. The village should feel detailed and charming, but use clean readable shapes rather than tiny clutter.

Animate thousands of snowflakes swirling inside the globe with layered depth: some flakes close to the glass, some around the village, and some fading into the background. The snow should move with believable globe-like physics: circular wind currents, varied speeds, gentle rotation, drifting arcs, and occasional soft gusts. Add a tiny Santa sleigh silhouette looping smoothly around the sky inside the globe; keep it simple and readable, like a dark cutout with a few reindeer shapes or a sleigh trail, so the animation does not depend on complex character anatomy.

Make the glass dome visually convincing with curved highlights, soft reflections, subtle refraction, a frosted rim, and a bright specular shine that moves slightly as the scene animates. Add warm bokeh holiday lights outside the globe in the dark background, plus a polished base with a faint reflection on the table. The mood should be magical, cinematic, cozy, and festive without becoming visually cluttered.

The animation should loop naturally, run smoothly in real time, adapt to the browser viewport, and keep the globe as the clear centered subject. Use a full-page canvas or SVG and no external libraries.

After generating the HTML, review it with Playwright. First confirm it opens and runs with no JavaScript syntax or console errors — if it's broken, fix the root cause before anything else. Then check the visual criteria with one or two screenshots; if they're already met and there are no errors, stop and make no changes. When something is genuinely wrong, identify the root cause and fix it with one decisive change rather than many small cosmetic tweaks. Keep it to a few steps — do not over-engineer or refine indefinitely, and stop once the animation meets the stated criteria and runs at the target frame rate.

Optimize for smooth playback: the scene should animate at 30+ fps at 1080p. Keep the snowflake count modest, use simple shapes or cached sprites for particles, and avoid expensive glass refraction or blur effects that would drop the frame rate.
