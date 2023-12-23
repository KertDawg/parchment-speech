/*

Common index.html processing
============================

Copyright (c) 2023 Dannii Willis
MIT licenced
https://github.com/curiousdannii/parchment

*/

import {ParchmentOptions} from '../common/options.js'

// Is ASCII really okay here?
const utf8decoder = new TextDecoder('ascii', {fatal: true})

export interface Story {
    author?: string
    cover?: Uint8Array
    data?: Uint8Array
    description?: string
    filename?: string
    title?: string
}

export interface SingleFileOptions {
    date?: boolean | number
    font?: boolean | number
    format?: string
    single_file?: boolean | number
    story_file?: Story
}

async function Uint8Array_to_base64(data: Buffer | Uint8Array): Promise<string> {
    if (typeof Buffer !== 'undefined') {
        return data.toString('base64')
    }
    // From https://stackoverflow.com/a/66046176/2854284
    else if (typeof FileReader !== 'undefined') {
        const data_url: string = await new Promise(resolve => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.readAsDataURL(new Blob([data]))
        })
        return data_url.split(',', 2)[1]
    }
    throw new Error('Cannot encode base64')
}

export async function make_single_file(options: SingleFileOptions, files: Map<string, Uint8Array>): Promise<string> {
    const inclusions: string[] = []

    // Process the files
    let indexhtml = ''
    for (const [filename, data] of files) {
        if (filename.endsWith('.wasm')) {
            inclusions.push(`<script type="text/plain" id="./${filename}">${await Uint8Array_to_base64(data)}</script>`)
            continue
        }
        else if (filename.endsWith('.gif')) {
            continue
        }

        let data_as_string = utf8decoder.decode(data)
            .replace(/(\/\/|\/\*)# sourceMappingURL.+/, '')
            .trim()

        if (filename === 'ie.js') {
            inclusions.push(`<script nomodule>${data_as_string}</script>`)
        }
        else if (filename === 'index.html') {
            indexhtml = data_as_string
        }
        else if (filename === 'jquery.min.js') {
            inclusions.push(`<script>${data_as_string}</script>`)
        }
        else if (filename === 'main.js') {
            inclusions.push(`<script type="module">${data_as_string}</script>`)
        }
        else if (filename.endsWith('.css')) {
            // Only include a single font, the browser can fake bold and italics
            let fontfile: string | undefined
            if (options.font) {
                fontfile = await Uint8Array_to_base64(files.get('iosevka-extended.woff2')!)
            }
            data_as_string = data_as_string.replace(/@font-face{font-family:([' \w]+);font-style:(\w+);font-weight:(\d+);src:url\([^)]+\) format\(['"]woff2['"]\)}/g, (_, font, style, weight) => {
                if (font === 'Iosevka' && style === 'normal' && weight === '400' && options.font) {
                    return `@font-face{font-family:Iosevka;font-style:normal;font-weight:400;src:url(data:font/woff2;base64,${fontfile}) format('woff2')}`
                }
                return ''
            })
                .replace(/Iosevka Narrow/g, 'Iosevka')
            if (!options.font) {
                data_as_string = data_as_string.replace(/--glkote(-grid)?-mono-family: "Iosevka", monospace;?/g, '')
            }
            inclusions.push(`<style>${data_as_string}</style>`)
        }
        else if (filename.endsWith('.js')) {
            inclusions.push(`<script type="text/plain" id="./${filename}">${data_as_string}</script>`)
        }
    }

    // Parchment options
    const parchment_options: Partial<ParchmentOptions> = {}
    if (options.format) {
        parchment_options.format = options.format
    }
    if (options.single_file) {
        parchment_options.single_file = 1
    }
    if (options.story_file) {
        parchment_options.story = 'embedded:' + options.story_file.filename
        inclusions.push(`<script type="text/plain" id="${options.story_file.filename}">${await Uint8Array_to_base64(options.story_file.data!)}</script>`)
    }
    inclusions.push(`<script>parchment_options = ${JSON.stringify(parchment_options, null, 2)}</script>`)

    // Inject into index.html
    const gif = await Uint8Array_to_base64(files.get('waiting.gif')!)
    indexhtml = indexhtml
        .replace(/<script.+?\/script>/g, '')
        .replace(/<link rel="stylesheet".+?>/g, '')
        .replace(/<img src="dist\/web\/waiting.gif"/, `<img src="data:image/gif;base64,${gif}"`)
        .replace(/^\s+$/gm, '')

    // Add a date if requested
    if (options.date) {
        const today = new Date()
        const title = `Parchment ${today.getFullYear()}.${today.getMonth() + 1}.${today.getDate()}`
        indexhtml = indexhtml
            .replace(/<title.+?\/title>/, `<title>${title}</title>`)
            .replace(/<\/noscript>/, `</noscript>\n<p id="footer-date">${title}</p>`)
    }

    // Add the inclusions
    const parts = indexhtml.split(/\s*<\/head>/)
    indexhtml = `${parts[0]}
    ${inclusions.join('\n')}
    </head>${parts[1]}`

    return indexhtml
}