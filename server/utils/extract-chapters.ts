export function extractChapterNumbersFromText(text: string): number[] {
  if (!text) return [];
  
  const chapters = new Set<number>();
  
  const patterns = [
    /[Cc]ap(?:ítulo|itulo|\.)\s*(\d+)/g,
    /[Cc]hapter\s*(\d+)/g,
    /[Cc]ap\s+(\d+)/g,
    /[Cc]aps?\s+(\d+(?:\s*[,y]\s*\d+)*)/g,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const numStr = match[1];
      const nums = numStr.split(/\s*[,y]\s*/);
      for (const n of nums) {
        const parsed = parseInt(n.trim(), 10);
        if (!isNaN(parsed) && parsed > 0 && parsed <= 500) {
          chapters.add(parsed);
        }
      }
    }
  }
  
  const rangePattern = /[Cc]ap(?:ítulo|itulo)?s?\s+(\d+)\s*[-–a]\s*(\d+)/g;
  let rangeMatch;
  while ((rangeMatch = rangePattern.exec(text)) !== null) {
    const start = parseInt(rangeMatch[1], 10);
    const end = parseInt(rangeMatch[2], 10);
    if (!isNaN(start) && !isNaN(end) && end > start && end - start <= 20) {
      for (let i = start; i <= end; i++) {
        chapters.add(i);
      }
    }
  }
  
  return Array.from(chapters).sort((a, b) => a - b);
}

export function ensureChapterNumbers(issue: { capitulos_afectados?: number[]; descripcion?: string; instrucciones_correccion?: string }): number[] {
  if (issue.capitulos_afectados && Array.isArray(issue.capitulos_afectados) && issue.capitulos_afectados.length > 0) {
    return issue.capitulos_afectados;
  }
  
  const fromDesc = extractChapterNumbersFromText(issue.descripcion || '');
  const fromInstr = extractChapterNumbersFromText(issue.instrucciones_correccion || '');
  
  const merged = new Set([...fromDesc, ...fromInstr]);
  return Array.from(merged).sort((a, b) => a - b);
}
