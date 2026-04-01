export const EMAIL_HTML_RULES = `
Email HTML requirements — follow all of these without exception:

STRUCTURE
- Always include <!DOCTYPE html>, <html>, <head>, <body>
- Layout must be table-based: <table>, <tr>, <td> — never use <div> for layout
- Outer wrapper table at width="100%", inner content table at max 600px wide
- Every table must have cellpadding="0" cellspacing="0" border="0"

CSS
- All styles must be inline (style="...") — no <style> tag, no external stylesheets
- No flexbox, no grid, no CSS variables, no CSS shorthand (use padding-top not padding)
- font-family must always include web-safe fallbacks (Arial, Helvetica, Georgia, sans-serif)
- Always set font-size, line-height, and color explicitly on every text element

IMAGES
- Always set width, height, border="0", display:block on every <img>
- Use absolute URLs only — no relative paths
- Always include alt text

LINKS & BUTTONS
- Never use <button> — use <a> styled as a button inside a <td>
- No <video>, <form>, or <input> elements
- No JavaScript of any kind

OUTLOOK COMPATIBILITY
- Use bgcolor attribute on <td> alongside CSS background-color
- No CSS background-image (poor Outlook support)
- Add <!--[if mso]> conditionals where needed for Outlook rendering

META (in <head>)
- <meta charset="UTF-8">
- <meta name="viewport" content="width=device-width, initial-scale=1.0">
- <meta http-equiv="X-UA-Compatible" content="IE=edge">
`.trim();
