export function repairJson(raw: string): any {
  const startIdx = raw.indexOf('{');
  if (startIdx === -1) throw new Error("No JSON object found in response");
  let text = raw.substring(startIdx);

  const lastBrace = text.lastIndexOf('}');
  if (lastBrace >= 0) {
    text = text.substring(0, lastBrace + 1);
  }

  try {
    return JSON.parse(text);
  } catch (_firstError) {
  }

  text = text.replace(/,\s*([\]}])/g, '$1');
  text = text.replace(/(["\d\w\]}])\s*\n\s*"/g, '$1,\n"');
  text = text.replace(/}\s*\n\s*{/g, '},\n{');
  text = text.replace(/]\s*\n\s*"/g, '],\n"');
  text = text.replace(/"\s*\n\s*\[/g, '",\n[');
  text = text.replace(/(true|false|null|\d|"|\]|\})\s*\n\s*\[/g, '$1,\n[');

  try {
    return JSON.parse(text);
  } catch (_secondError) {
  }

  let closesNeeded = { braces: 0, brackets: 0 };
  let inString = false, escape = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{') closesNeeded.braces++;
    else if (c === '}') closesNeeded.braces--;
    else if (c === '[') closesNeeded.brackets++;
    else if (c === ']') closesNeeded.brackets--;
  }

  if (inString) text += '"';

  text = text.replace(/[\s,]+$/, '');

  for (let i = 0; i < closesNeeded.brackets; i++) text += ']';
  for (let i = 0; i < closesNeeded.braces; i++) text += '}';

  try {
    return JSON.parse(text);
  } catch (_thirdError) {
  }

  text = text.replace(/,\s*([\]}])/g, '$1');
  try {
    return JSON.parse(text);
  } catch (finalError) {
    throw new Error(`JSON repair failed: ${(finalError as Error).message}`);
  }
}
