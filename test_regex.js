const text = `Pinpointing Pre-Sale Details

I've determined that the

\`\`\`python
pesquisar_web
\`\`\`

tool is the optimal choice for this task. I've built a search query combining "Resident Evil filme", "pré venda", and "17 de setembro" into the string

\`\`\`python
"pré venda filme Resident Evil 17 de setembro"
\`\`\`

. Now, I will execute the query to uncover any pre-sale information, hopefully confirming or denying the user's specific release date assumption.

Refining Search Parameters

I'm now zeroing in on the pre-sale details for the Resident Evil movie, given the user's focus on September 17th. My initial query is refined. Recognizing that the data is imminent, I need to check...`;

function cleanTextMonologue(text) {
  if (!text) return '';
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  
  // Strip all markdown blocks that contain our tool names or are just strings
  cleaned = cleaned.replace(/```[\s\S]*?```/gi, (match) => {
    if (match.includes('pesquisar_web') || match.includes('acessar_site') || match.includes('ligar_pc') || match.includes('renderizar_grafico')) {
      return '';
    }
    // if the markdown block is just a single string like "..."
    if (match.match(/```[a-z]*\n\s*"[^"]+"\s*\n```/)) {
        return '';
    }
    return match;
  });

  const lines = cleaned.split('\n');
  const finalLines = [];
  
  const englishCommon = new Set([
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
    'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there',
    'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no',
    'just', 'him', 'know', 'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then',
    'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first',
    'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us', 'user', 'request', 'focus',
    'action', 'context', 'specifics', 'topic', 'scope', 'clarifying', 'tool', 'task', 'query', 'string', 'details', 'choice', 'optimal',
    'built', 'combining', 'execute', 'uncover', 'information', 'hopefully', 'confirming', 'denying', 'specific', 'release', 'date', 'assumption',
    'refining', 'parameters', 'zeroing', 'movie', 'given', 'initial', 'refined', 'recognizing', 'data', 'imminent', 'check', 'pinpointing', 'pre-sale', 'determined'
  ]);

  for (const line of lines) {
    const l = line.toLowerCase().trim();
    if (!l) continue;
    
    // Ignore single characters or punctuation
    if (l.length < 3 && l.match(/^[. ,!?;]+$/)) continue;

    const words = l.match(/[a-z]+/g) || [];
    let engCount = 0;

    for (const w of words) {
      if (englishCommon.has(w)) engCount++;
    }

    // If it's heavily English, skip it
    if (engCount >= 2 && engCount >= words.length * 0.3) {
      continue;
    }
    // If it has thinking keywords
    if (l.includes('tool is') || l.includes("i've determined") || l.includes('now, i will')) {
        continue;
    }

    finalLines.push(line);
  }

  return finalLines.join('\n').trimStart();
}

console.log("CLEANED:");
console.log(cleanTextMonologue(text));
