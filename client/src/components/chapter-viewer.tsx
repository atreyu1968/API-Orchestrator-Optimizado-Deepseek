import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { FileText, Clock, Loader2 } from "lucide-react";
import type { Chapter } from "@shared/schema";

interface ChapterViewerProps {
  chapter: Chapter | null;
}

function splitLongParagraphs(content: string): string {
  const blocks = content.split(/\n\n+/);
  const result: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    if (trimmed.length < 600) {
      result.push(trimmed);
      continue;
    }

    const lines = trimmed.split('\n');
    const subResult: string[] = [];
    let currentNarrative: string[] = [];

    const flushNarrative = () => {
      if (currentNarrative.length === 0) return;
      const text = currentNarrative.join(' ');
      currentNarrative = [];
      if (text.length < 600) {
        subResult.push(text);
        return;
      }
      const sentences = text.match(/[^.!?…]+[.!?…]+["»"'\u201D]?\s*/g);
      if (!sentences || sentences.length <= 3) {
        subResult.push(text);
        return;
      }
      const matchedLength = sentences.reduce((sum, s) => sum + s.length, 0);
      const remainder = text.slice(matchedLength).trim();
      let chunk = '';
      let sentenceCount = 0;
      for (const sentence of sentences) {
        chunk += sentence;
        sentenceCount++;
        if (sentenceCount >= 3 && chunk.length >= 400) {
          subResult.push(chunk.trim());
          chunk = '';
          sentenceCount = 0;
        }
      }
      if (remainder) {
        chunk += ' ' + remainder;
      }
      if (chunk.trim()) {
        if (subResult.length > 0 && chunk.trim().length < 150) {
          subResult[subResult.length - 1] += ' ' + chunk.trim();
        } else {
          subResult.push(chunk.trim());
        }
      }
    };

    for (const line of lines) {
      const t = line.trim();
      if (t.startsWith('—') || t.startsWith('«') || t.startsWith('\u201C') || t.startsWith('"')) {
        flushNarrative();
        subResult.push(t);
      } else {
        currentNarrative.push(t);
      }
    }
    flushNarrative();

    result.push(...subResult);
  }

  return result.join('\n\n');
}

function cleanContentForDisplay(raw: string): string {
  let content = raw.trim();

  const continuityMarker = "---CONTINUITY_STATE---";
  if (content.includes(continuityMarker)) {
    content = content.split(continuityMarker)[0].trim();
  }

  content = content.replace(/\n*```json[\s\S]*?```\n*/g, '\n');
  content = content.replace(/\n*\{[\s\S]*?"characterStates"[\s\S]*?\}\s*$/g, '');

  content = content.replace(/^#+ *(CHAPTER|CAPÍTULO|CAP\.?|Capítulo|Chapter|Prólogo|Prologue|Epílogo|Epilogue|Nota del Autor|Author'?s? Note)[^\n]*\n+/i, '');

  content = content.replace(/═{10,}[\s\S]*?═{10,}/g, '');
  content = content.replace(/⛔[^\n]*\n/g, '');
  content = content.replace(/⚠️[^\n]*\n/g, '');

  content = content.replace(/^\d+\.\s*(Apertura|Desarrollo|Tensión|Reflexión|Escalada|Cierre|Hook|Clímax|Desenlace|Nudo|Resolución|Transición|Confrontación|Revelación|Setup)[:\.\s]*[^\n]*\n*/gmi, '');
  content = content.replace(/^(?:Beat|BEAT)\s*\d+[:\.\s]*[^\n]*\n*/gm, '');

  content = content.replace(/\n{4,}/g, '\n\n\n');

  content = splitLongParagraphs(content);

  return content.trim();
}

function getChapterLabel(chapterNumber: number): string {
  if (chapterNumber === 0) return "Prólogo";
  if (chapterNumber === -1) return "Epílogo";
  if (chapterNumber === -2) return "Nota del Autor";
  return `Capítulo ${chapterNumber}`;
}

export function ChapterViewer({ chapter }: ChapterViewerProps) {
  if (!chapter) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-16">
        <FileText className="h-16 w-16 text-muted-foreground/20 mb-4" />
        <p className="text-muted-foreground">
          Selecciona un capítulo para ver su contenido
        </p>
      </div>
    );
  }

  const isLoading = chapter.status === "writing" || chapter.status === "editing";
  const displayContent = chapter.content ? cleanContentForDisplay(chapter.content) : null;

  return (
    <div className="h-full flex flex-col" data-testid={`viewer-chapter-${chapter.id}`}>
      <div className="flex items-center justify-between gap-4 pb-4 border-b mb-4">
        <div>
          <h2 className="text-xl font-semibold font-serif">
            {getChapterLabel(chapter.chapterNumber)}
          </h2>
          {chapter.title && (
            <p className="text-lg text-muted-foreground font-serif mt-1">
              {chapter.title}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {chapter.wordCount && chapter.wordCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {chapter.wordCount.toLocaleString()} palabras
            </Badge>
          )}
          {isLoading && (
            <Badge className="bg-chart-2/20 text-chart-2">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              En progreso
            </Badge>
          )}
        </div>
      </div>
      
      <ScrollArea className="flex-1">
        {displayContent ? (
          <article className="prose prose-lg dark:prose-invert max-w-prose mx-auto leading-7 font-serif">
            <div 
              dangerouslySetInnerHTML={{ 
                __html: displayContent
                  .replace(/\n\n/g, '</p><p>')
                  .replace(/\n/g, '<br />')
                  .replace(/^/, '<p>')
                  .replace(/$/, '</p>')
              }} 
            />
          </article>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Clock className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">
              El contenido se está generando...
            </p>
            <p className="text-xs text-muted-foreground/60 mt-2">
              El capítulo aparecerá aquí cuando esté listo
            </p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
