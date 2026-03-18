import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { FileText, Clock, Loader2 } from "lucide-react";
import type { Chapter } from "@shared/schema";

interface ChapterViewerProps {
  chapter: Chapter | null;
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
