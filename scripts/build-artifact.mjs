// Monta a página do artefato: CSS e programa principal embutidos; o leitor de PDF vai como arquivos ao lado.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'

const dir = 'dist-artifact'

// A publicação recusa caracteres de controle crus. No código minificado eles só aparecem dentro de
// textos e expressões regulares, onde a forma escapada \\xNN significa exatamente a mesma coisa.
const escapeControls = (code) => code.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, (c) => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0'))
const files = readdirSync(dir)
const html = readFileSync(`${dir}/index.html`, 'utf8')
const entry = html.match(/src="\.\/(index-[^"]+\.js)"/)[1]
const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n')
const js = escapeControls(readFileSync(`${dir}/${entry}`, 'utf8')).replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--')

writeFileSync(
  `${dir}/page.html`,
  `<title>Ascensão</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`,
)
const extra = files.filter((f) => /\.m?js$/.test(f) && f !== entry)
for (const f of extra) writeFileSync(`${dir}/${f}`, escapeControls(readFileSync(`${dir}/${f}`, 'utf8')))
writeFileSync(`${dir}/files.json`, JSON.stringify(extra))
console.log('page.html', (css.length + js.length) >> 10, 'KiB; arquivos ao lado:', extra.join(', '))
