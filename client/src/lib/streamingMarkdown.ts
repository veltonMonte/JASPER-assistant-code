const MEDIA_LANGUAGES = new Set(['recharts', 'table', 'tabela', 'json-table', 'images', 'video'])

// Incomplete media JSON is a loading state, not a failed chart/image.
export function prepareStreamingMarkdown(text: string): { markdown: string; pending: string | null } {
  const lines = text.split('\n')
  let open: { marker: string; length: number; start: number; language: string } | null = null
  let offset = 0
  for (const line of lines) {
    const fence = line.match(/^ {0,3}(`{3,}|~{3,})([^\s]*)\s*$/)
    if (fence) {
      if (!open) open = { marker: fence[1][0], length: fence[1].length, start: offset, language: fence[2].toLowerCase() }
      else if (fence[1][0] === open.marker && fence[1].length >= open.length && !fence[2]) open = null
    }
    offset += line.length + 1
  }
  if (open && MEDIA_LANGUAGES.has(open.language)) return { markdown: text.slice(0, open.start), pending: open.language }
  return { markdown: text, pending: null }
}

export function proseFromStreamingMarkdown(text: string): string {
  return prepareStreamingMarkdown(text).markdown
    .replace(/(`{3,}|~{3,})[^\n]*\n[\s\S]*?\1/g, '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/gi, '')
    .replace(/[*#_~]/g, '').trim()
}
