import { jsonrepair } from 'jsonrepair';

function extractJsonBlock(raw: string): string {
  const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();

  const startIdx = raw.indexOf('{');
  if (startIdx === -1) throw new Error("No JSON object found in response");
  let text = raw.substring(startIdx);
  const lastBrace = text.lastIndexOf('}');
  if (lastBrace >= 0) text = text.substring(0, lastBrace + 1);
  return text;
}

function manualRepair(text: string): any {
  text = text.replace(/,\s*([\]}])/g, '$1');
  text = text.replace(/(["\d\w\]}])\s*\n\s*"/g, '$1,\n"');
  text = text.replace(/}\s*\n\s*{/g, '},\n{');
  text = text.replace(/]\s*\n\s*"/g, '],\n"');
  text = text.replace(/"\s*\n\s*\[/g, '",\n[');
  text = text.replace(/(true|false|null|\d|"|\]|\})\s*\n\s*\[/g, '$1,\n[');

  try {
    return JSON.parse(text);
  } catch (_) {}

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
  text = text.replace(/,\s*([\]}])/g, '$1');

  return JSON.parse(text);
}

/**
 * Smart truncation salvage: walks the raw output character by character maintaining
 * a stack of open contexts (object/array). When it hits a hard truncation (mid-string,
 * mid-key, mid-value), it rewinds to the last *clean* boundary — defined as the end of
 * the last fully-closed element inside the deepest array — drops the partial trailing
 * element, then closes the open contexts in proper LIFO order.
 *
 * This handles the common Gemini failure mode where Phase 1 output stops mid-way through
 * a long array (e.g. inside the 17th personajes entry, or inside vocabulario_epoca_autorizado).
 */
function smartTruncationSalvage(raw: string): any {
  // 1. Extract everything from first { to end of stream (DON'T trim at last } —
  //    we want the partial tail so we can analyze it).
  const startIdx = raw.indexOf('{');
  if (startIdx === -1) throw new Error("No JSON object found");
  let text = raw.substring(startIdx);

  // Strip code fences if present.
  text = text.replace(/```(?:json)?\s*\n?/, '').replace(/```\s*$/, '');

  // 2. Walk the text char-by-char maintaining a stack and tracking the last position
  //    where the buffer was "structurally clean" — i.e. between top-level array/object
  //    elements with all strings closed and no half-written key/value.
  type Frame = { kind: 'object' | 'array'; openedAt: number };
  const stack: Frame[] = [];
  let inString = false;
  let escape = false;
  // lastCleanEnd[depth] = position (exclusive) up to which the JSON is balanced AND
  // the last element of the array/object at this depth is fully closed.
  // We track the global last-known clean position too.
  let lastCleanPos = -1;
  let lastCleanStack: Frame[] = [];
  // "expectingValue" tracks if we're between a key and its value (e.g. after `:`),
  // which means a truncation here is BAD and we'd need to drop the whole pair.
  let expectingValue = false;
  let afterColon = false;
  let lastCommaInArrayPos = -1;
  let lastCommaInArrayStack: Frame[] = [];

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (escape) { escape = false; continue; }
    if (c === '\\' && inString) { escape = true; continue; }
    if (c === '"') {
      inString = !inString;
      if (!inString && expectingValue) {
        // We just finished a string value. Now we're after a complete key:value.
        expectingValue = false;
        afterColon = false;
      }
      continue;
    }
    if (inString) continue;

    if (c === '{') {
      stack.push({ kind: 'object', openedAt: i });
      expectingValue = false;
      afterColon = false;
    } else if (c === '[') {
      stack.push({ kind: 'array', openedAt: i });
      expectingValue = false;
      afterColon = false;
    } else if (c === '}') {
      stack.pop();
      // After closing, we're inside the parent. If parent is object and we just
      // finished a value, mark clean. If parent is array, mark clean.
      lastCleanPos = i + 1;
      lastCleanStack = stack.slice();
      expectingValue = false;
      afterColon = false;
    } else if (c === ']') {
      stack.pop();
      lastCleanPos = i + 1;
      lastCleanStack = stack.slice();
      expectingValue = false;
      afterColon = false;
    } else if (c === ':') {
      afterColon = true;
      expectingValue = true;
    } else if (c === ',') {
      // A comma at top-of-array level means: previous element fully closed.
      // Track the position right BEFORE the comma as a safe rewind point inside arrays.
      const top = stack[stack.length - 1];
      if (top && top.kind === 'array') {
        lastCommaInArrayPos = i; // position of the comma
        lastCommaInArrayStack = stack.slice();
      }
      expectingValue = false;
      afterColon = false;
    } else if (!/\s/.test(c)) {
      // Any non-whitespace token (number digit, t/f/n for true/false/null start, etc.)
      // — if we were expecting a value, we're now mid-value (could be number/literal).
      // Don't update clean pos here; only on full close.
    }
  }

  // 3. Decide rewind position.
  // Strategy: if the truncation left us mid-string OR we ended expecting a value
  // OR after a comma without a following element, prefer rewinding to lastCleanPos
  // (last fully-closed boundary). If we can rewind even further to drop a half-built
  // last element of an array, use lastCommaInArrayPos.
  let rewindPos = text.length;
  let rewindStack = stack.slice();

  // If we ended INSIDE a string, we can't safely keep the partial tail.
  if (inString && lastCleanPos > 0) {
    rewindPos = lastCleanPos;
    rewindStack = lastCleanStack.slice();
  } else if (expectingValue && lastCleanPos > 0) {
    rewindPos = lastCleanPos;
    rewindStack = lastCleanStack.slice();
  } else if (afterColon && lastCleanPos > 0) {
    rewindPos = lastCleanPos;
    rewindStack = lastCleanStack.slice();
  }

  // If rewinding to lastCleanPos still leaves us inside an array but the very next
  // chars after rewindPos suggest mid-element (e.g. an opening { with no close),
  // try rewinding further to the comma before it (drop the trailing partial element).
  // We do this by checking if any frames in current stack opened AFTER rewindPos.
  while (rewindStack.length > 0) {
    const top = rewindStack[rewindStack.length - 1];
    if (top.openedAt >= rewindPos) {
      // This frame was opened after our rewind point — pop it from rewindStack.
      rewindStack.pop();
    } else {
      break;
    }
  }

  let truncated = text.substring(0, rewindPos);

  // Strip trailing whitespace and dangling commas.
  truncated = truncated.replace(/[\s,]+$/, '');

  // 4. Close all open frames in LIFO order (correct nesting).
  for (let i = rewindStack.length - 1; i >= 0; i--) {
    const frame = rewindStack[i];
    truncated += frame.kind === 'object' ? '}' : ']';
  }

  // Final dangling-comma cleanup.
  truncated = truncated.replace(/,(\s*[\]}])/g, '$1');

  return JSON.parse(truncated);
}

export function repairJson(raw: string): any {
  // Strategy 1: plain parse on extracted block (the happy path).
  let lastErr: Error | null = null;
  try {
    const text = extractJsonBlock(raw);
    return JSON.parse(text);
  } catch (e) { lastErr = e as Error; }

  // Strategy 2: jsonrepair on extracted block (fixes minor issues like trailing
  // commas, unquoted keys, single quotes, etc).
  try {
    const text = extractJsonBlock(raw);
    const repaired = jsonrepair(text);
    return JSON.parse(repaired);
  } catch (e) { lastErr = e as Error; }

  // Strategy 3: stack-based smart truncation salvage on the RAW text (preserves
  // partial tail so we can intelligently rewind to last clean boundary).
  try {
    return smartTruncationSalvage(raw);
  } catch (e) { lastErr = e as Error; }

  // Strategy 4: existing manual bracket-balancing repair (legacy fallback).
  try {
    const text = extractJsonBlock(raw);
    return manualRepair(text);
  } catch (e) { lastErr = e as Error; }

  // Strategy 5: last-resort jsonrepair on the entire raw text.
  try {
    const repaired = jsonrepair(raw);
    return JSON.parse(repaired);
  } catch (e) {
    throw lastErr || (e as Error);
  }
}
