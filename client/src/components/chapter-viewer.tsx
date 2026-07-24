import { useState, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileText, Clock, Loader2, Pencil, Check, X, Sparkles, Wand2, ShieldCheck, AlertTriangle, HelpCircle, CheckCircle2 } from "lucide-react";
import type { Chapter } from "@shared/schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ChapterViewerProps {
  chapter: Chapter | null;
}

// [Fix252] Hallazgo del verificador de datos
interface FactFinding {
  afirmacion: string;
  categoria: string;
  veredicto: "incorrecto" | "dudoso" | "correcto";
  explicacion: string;
  sugerencia: string;
}

function splitLongParagraphs(content: string): string {
  const blocks = content.split(/\n\n+/);
  const result: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const hasDialogue = /\n\s*[—«\u201C"]/.test(trimmed) || /^[—«\u201C"]/.test(trimmed);

    if (trimmed.length < 600 && !hasDialogue) {
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

// [Fix250] Extrae la prosa editable (sin el bloque tecnico de continuidad).
// A diferencia de cleanContentForDisplay, NO reparte parrafos ni borra lineas:
// lo que el usuario edita es el texto real guardado.
function getEditableProse(raw: string): string {
  const MARKER = "---CONTINUITY_STATE---";
  let content = raw;
  if (content.includes(MARKER)) {
    content = content.split(MARKER)[0];
  }
  return content.trimEnd();
}

function getChapterLabel(chapterNumber: number): string {
  if (chapterNumber === 0) return "Prólogo";
  if (chapterNumber === -1) return "Epílogo";
  if (chapterNumber === -2) return "Nota del Autor";
  return `Capítulo ${chapterNumber}`;
}

export function ChapterViewer({ chapter }: ChapterViewerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // [Fix250] Edicion manual del texto del capitulo. Se guarda el id del
  // capitulo en edicion para que cambiar de capitulo no arrastre el borrador.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const isEditing = editingId !== null && editingId === chapter?.id;
  const setIsEditing = (v: boolean) => setEditingId(v && chapter ? chapter.id : null);
  // [Fix251] Edicion del titulo del capitulo + sugerencias IA, movidas aqui
  // desde la tarjeta de la lista (peticion del usuario). Ligadas al id.
  const [titleEditingId, setTitleEditingId] = useState<number | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const isTitleEditing = titleEditingId !== null && titleEditingId === chapter?.id;
  const [suggestions, setSuggestions] = useState<string[] | null>(null);

  const renameChapterMutation = useMutation({
    mutationFn: async (title: string) => {
      if (!chapter) throw new Error("Sin capítulo");
      const res = await apiRequest("PATCH", `/api/projects/${chapter.projectId}/chapters/${chapter.id}/title`, { title });
      return res.json();
    },
    onSuccess: () => {
      setTitleEditingId(null);
      setTitleDraft("");
      setSuggestions(null);
      if (chapter) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", chapter.projectId, "chapters"] });
      }
      toast({ title: "Título actualizado" });
    },
    onError: (err: any) => {
      toast({ title: "No se pudo renombrar", description: err?.message || "Error desconocido", variant: "destructive" });
    },
  });

  const suggestTitlesMutation = useMutation({
    mutationFn: async () => {
      if (!chapter) throw new Error("Sin capítulo");
      const res = await apiRequest("POST", `/api/projects/${chapter.projectId}/title-suggestions`, { chapterId: chapter.id });
      const data = await res.json();
      return (data.suggestions || []) as string[];
    },
    onSuccess: (s) => setSuggestions(s),
    onError: (err: any) => {
      toast({ title: "No se pudieron generar sugerencias", description: err?.message || "Error desconocido", variant: "destructive" });
    },
  });

  // [Fix252] Verificador de datos del capitulo (fechas, geografia, nombres,
  // cifras). Resultado ligado al id del capitulo para no mostrar el de otro.
  const [factCheck, setFactCheck] = useState<{ chapterId: number; summary: string; findings: FactFinding[] } | null>(null);
  const [factCheckOpen, setFactCheckOpen] = useState(false);

  const factCheckMutation = useMutation({
    mutationFn: async () => {
      if (!chapter) throw new Error("Sin capítulo");
      const res = await apiRequest("POST", `/api/projects/${chapter.projectId}/chapters/${chapter.id}/fact-check`, {});
      const data = await res.json();
      return { chapterId: chapter.id, summary: (data.summary || "") as string, findings: (data.findings || []) as FactFinding[] };
    },
    onSuccess: (data) => {
      setFactCheck(data);
      setFactCheckOpen(true);
    },
    onError: (err: any) => {
      toast({ title: "No se pudo verificar el capítulo", description: err?.message || "Error desconocido", variant: "destructive" });
    },
  });

  const saveContentMutation = useMutation({
    mutationFn: async () => {
      if (!chapter) throw new Error("Sin capítulo");
      const res = await apiRequest(
        "PATCH",
        `/api/projects/${chapter.projectId}/chapters/${chapter.id}/content`,
        { content: draft },
      );
      return res.json();
    },
    onSuccess: () => {
      setIsEditing(false);
      if (chapter) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", chapter.projectId, "chapters"] });
      }
      toast({ title: "Texto guardado", description: "El capítulo se ha actualizado." });
    },
    onError: (err: any) => {
      toast({ title: "No se pudo guardar", description: err?.message || "Error desconocido", variant: "destructive" });
    },
  });

  // [Fix253] Reescritura de un pasaje seleccionado con IA dentro del editor.
  // La seleccion se captura del textarea; el resultado se previsualiza y solo
  // se aplica al borrador si el usuario acepta (guardar sigue siendo manual).
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [selRange, setSelRange] = useState<{ start: number; end: number } | null>(null);
  const [customInstr, setCustomInstr] = useState("");
  const [rewriteAction, setRewriteAction] = useState<string | null>(null);
  const [rewritePreview, setRewritePreview] = useState<{ original: string; rewritten: string; start: number; end: number } | null>(null);

  const updateSelection = () => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    setSelRange(end > start ? { start, end } : null);
  };

  const rewriteMutation = useMutation({
    mutationFn: async ({ action }: { action: string }) => {
      if (!chapter || !selRange) throw new Error("Sin selección");
      const passage = draft.substring(selRange.start, selRange.end);
      const res = await apiRequest(
        "POST",
        `/api/projects/${chapter.projectId}/chapters/${chapter.id}/rewrite-passage`,
        { passage, action, instructions: action === "custom" ? customInstr.trim() : undefined },
      );
      const data = await res.json();
      return { original: passage, rewritten: (data.rewritten || "") as string, start: selRange.start, end: selRange.end };
    },
    onSuccess: (data) => {
      setRewritePreview(data);
      setRewriteAction(null);
    },
    onError: (err: any) => {
      setRewriteAction(null);
      toast({ title: "No se pudo reescribir el pasaje", description: err?.message || "Error desconocido", variant: "destructive" });
    },
  });

  const startRewrite = (action: string) => {
    setRewriteAction(action);
    rewriteMutation.mutate({ action });
  };

  const applyRewrite = () => {
    if (!rewritePreview) return;
    // Guarda de integridad: si el borrador cambio desde que se lanzo la
    // reescritura, el rango ya no es fiable y no se debe reemplazar a ciegas.
    if (draft.substring(rewritePreview.start, rewritePreview.end) !== rewritePreview.original) {
      setRewritePreview(null);
      setSelRange(null);
      toast({
        title: "El texto cambió mientras se reescribía",
        description: "No se aplicó nada para no corromper el borrador. Vuelve a seleccionar el pasaje.",
        variant: "destructive",
      });
      return;
    }
    setDraft(draft.substring(0, rewritePreview.start) + rewritePreview.rewritten + draft.substring(rewritePreview.end));
    setRewritePreview(null);
    setSelRange(null);
    setCustomInstr("");
    toast({ title: "Pasaje reescrito", description: "Aplicado al borrador. Recuerda Guardar para conservarlo." });
  };

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

  const startEditing = () => {
    setDraft(getEditableProse(chapter.content || ""));
    setIsEditing(true);
  };

  const cancelEditing = () => {
    if (draft !== getEditableProse(chapter.content || "")) {
      if (!window.confirm("Hay cambios sin guardar. ¿Descartarlos?")) return;
    }
    setIsEditing(false);
    setDraft("");
  };

  return (
    <div className="h-full flex flex-col" data-testid={`viewer-chapter-${chapter.id}`}>
      <div className="flex items-center justify-between gap-4 pb-4 border-b mb-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold font-serif">
            {getChapterLabel(chapter.chapterNumber)}
          </h2>
          {isTitleEditing ? (
            <div className="flex items-center gap-1 mt-1 max-w-xl">
              <Input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && titleDraft.trim()) {
                    renameChapterMutation.mutate(titleDraft.trim());
                  }
                  if (e.key === "Escape") { setTitleEditingId(null); setTitleDraft(""); }
                }}
                className="h-8 font-serif"
                autoFocus
                data-testid="input-chapter-title"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => titleDraft.trim() && renameChapterMutation.mutate(titleDraft.trim())}
                disabled={renameChapterMutation.isPending || !titleDraft.trim()}
                data-testid="button-save-chapter-title"
              >
                {renameChapterMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => { setTitleEditingId(null); setTitleDraft(""); }}
                data-testid="button-cancel-chapter-title"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1 mt-1">
              {chapter.title && (
                <p className="text-lg text-muted-foreground font-serif truncate" data-testid="text-chapter-title">
                  {chapter.title}
                </p>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                title="Editar título del capítulo"
                onClick={() => {
                  setTitleDraft(chapter.title || "");
                  setTitleEditingId(chapter.id);
                }}
                data-testid="button-edit-chapter-title"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                title="Sugerir títulos con IA"
                onClick={() => suggestTitlesMutation.mutate()}
                disabled={suggestTitlesMutation.isPending || !chapter.content}
                data-testid="button-suggest-chapter-titles"
              >
                {suggestTitlesMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Sparkles className="h-3.5 w-3.5" />}
              </Button>
            </div>
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
          {!isLoading && !!chapter.content && !isEditing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (factCheck && factCheck.chapterId === chapter.id) {
                  setFactCheckOpen(true);
                } else {
                  factCheckMutation.mutate();
                }
              }}
              disabled={factCheckMutation.isPending}
              title="Verifica fechas, datos históricos, geografía, nombres y cifras de este capítulo"
              data-testid="button-fact-check-chapter"
            >
              {factCheckMutation.isPending
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <ShieldCheck className="h-4 w-4 mr-2" />}
              {factCheckMutation.isPending ? "Verificando..." : "Verificar datos"}
            </Button>
          )}
          {!isLoading && !!chapter.content && !isEditing && (
            <Button
              variant="outline"
              size="sm"
              onClick={startEditing}
              data-testid="button-edit-chapter-content"
            >
              <Pencil className="h-4 w-4 mr-2" />
              Editar texto
            </Button>
          )}
          {isEditing && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => saveContentMutation.mutate()}
                disabled={saveContentMutation.isPending || !draft.trim()}
                data-testid="button-save-chapter-content"
              >
                {saveContentMutation.isPending
                  ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  : <Check className="h-4 w-4 mr-2" />}
                Guardar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={cancelEditing}
                disabled={saveContentMutation.isPending}
                data-testid="button-cancel-chapter-content"
              >
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
            </div>
          )}
        </div>
      </div>

      {isEditing ? (
        <div className="flex-1 flex flex-col min-h-0">
          <Textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setSelRange(null); }}
            onSelect={updateSelection}
            readOnly={rewriteMutation.isPending}
            className="flex-1 resize-none font-serif text-base leading-7 min-h-0"
            placeholder="Texto del capítulo..."
            data-testid="textarea-chapter-content"
          />
          {/* [Fix253] Panel de reescritura IA sobre la seleccion */}
          <div className="mt-2 rounded-md border bg-muted/30 p-2" data-testid="panel-rewrite-ai">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium flex items-center gap-1 text-muted-foreground shrink-0">
                <Wand2 className="h-3.5 w-3.5" />
                Reescribir con IA
              </span>
              {!selRange && (
                <span className="text-xs text-muted-foreground/70">Selecciona un pasaje en el editor y elige una acción.</span>
              )}
              {selRange && (
                <>
                  <span className="text-xs text-muted-foreground/70" data-testid="text-rewrite-selection-words">
                    {draft.substring(selRange.start, selRange.end).trim().split(/\s+/).filter(Boolean).length} palabras seleccionadas
                  </span>
                  {[
                    { action: "improve", label: "Mejorar" },
                    { action: "expand", label: "Expandir" },
                    { action: "shorten", label: "Acortar" },
                    { action: "simplify", label: "Simplificar" },
                  ].map(({ action, label }) => (
                    <Button
                      key={action}
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={rewriteMutation.isPending}
                      onClick={() => startRewrite(action)}
                      data-testid={`button-rewrite-${action}`}
                    >
                      {rewriteMutation.isPending && rewriteAction === action && (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      )}
                      {label}
                    </Button>
                  ))}
                  <div className="flex items-center gap-1 flex-1 min-w-[220px]">
                    <Input
                      value={customInstr}
                      onChange={(e) => setCustomInstr(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && customInstr.trim() && !rewriteMutation.isPending) startRewrite("custom");
                      }}
                      placeholder="Instrucción personalizada... (ej. hazlo más tenso)"
                      className="h-7 text-xs"
                      disabled={rewriteMutation.isPending}
                      data-testid="input-rewrite-custom"
                    />
                    <Button
                      size="sm"
                      className="h-7 text-xs shrink-0"
                      disabled={rewriteMutation.isPending || !customInstr.trim()}
                      onClick={() => startRewrite("custom")}
                      data-testid="button-rewrite-custom"
                    >
                      {rewriteMutation.isPending && rewriteAction === "custom"
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Sparkles className="h-3 w-3" />}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {draft.trim() ? draft.trim().split(/\s+/).filter(Boolean).length.toLocaleString() : 0} palabras
            {" · "}Los metadatos técnicos del capítulo se conservan automáticamente al guardar.
          </p>
        </div>
      ) : (
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
      )}

      {/* [Fix253] Vista previa de la reescritura del pasaje */}
      <Dialog open={!!rewritePreview} onOpenChange={(open) => { if (!open) setRewritePreview(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5" />
              Vista previa de la reescritura
            </DialogTitle>
            <DialogDescription>
              Compara el pasaje original con la versión reescrita antes de aplicarla al borrador.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 pr-3">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Original ({rewritePreview ? rewritePreview.original.trim().split(/\s+/).filter(Boolean).length : 0} palabras)</p>
                <div className="rounded-md border bg-muted/30 p-3 text-sm font-serif whitespace-pre-wrap" data-testid="text-rewrite-original">
                  {rewritePreview?.original}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Reescrito ({rewritePreview ? rewritePreview.rewritten.trim().split(/\s+/).filter(Boolean).length : 0} palabras)</p>
                <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm font-serif whitespace-pre-wrap" data-testid="text-rewrite-result">
                  {rewritePreview?.rewritten}
                </div>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRewritePreview(null)} data-testid="button-rewrite-discard">
              Descartar
            </Button>
            <Button onClick={applyRewrite} data-testid="button-rewrite-apply">
              <Check className="h-4 w-4 mr-2" />
              Aplicar al borrador
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* [Fix252] Dialogo de resultados del verificador de datos */}
      <Dialog open={factCheckOpen} onOpenChange={setFactCheckOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Verificación de datos del capítulo
            </DialogTitle>
            <DialogDescription>
              Fechas, datos históricos, geografía, nombres reales y cifras. Los elementos ficticios de la novela no se señalan.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 pr-3">
            {factCheck?.summary && (
              <p className="text-sm mb-4" data-testid="text-fact-check-summary">{factCheck.summary}</p>
            )}
            {factCheck && factCheck.findings.length === 0 && (
              <div className="flex flex-col items-center py-8 text-center">
                <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400 mb-2" />
                <p className="text-sm text-muted-foreground">No se detectaron datos problemáticos en este capítulo.</p>
              </div>
            )}
            <div className="space-y-3">
              {(factCheck?.findings || []).map((f, i) => {
                const isBad = f.veredicto === "incorrecto";
                const isDoubt = f.veredicto === "dudoso";
                return (
                  <div
                    key={i}
                    className={`rounded-md border p-3 ${isBad ? "border-destructive/50 bg-destructive/5" : isDoubt ? "border-amber-500/50 bg-amber-500/5" : "border-green-500/40 bg-green-500/5"}`}
                    data-testid={`card-fact-finding-${i}`}
                  >
                    <div className="flex items-start gap-2">
                      {isBad ? (
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
                      ) : isDoubt ? (
                        <HelpCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-600 dark:text-green-400" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={isBad ? "destructive" : "secondary"} className="text-[10px] uppercase">
                            {f.veredicto}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">{f.categoria}</Badge>
                        </div>
                        <p className="text-sm font-medium mt-1.5">{f.afirmacion}</p>
                        {f.explicacion && <p className="text-sm text-muted-foreground mt-1">{f.explicacion}</p>}
                        {f.sugerencia && f.veredicto !== "correcto" && (
                          <p className="text-sm mt-1"><span className="font-medium">Sugerencia:</span> {f.sugerencia}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => factCheckMutation.mutate()}
              disabled={factCheckMutation.isPending}
              data-testid="button-rerun-fact-check"
            >
              {factCheckMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
              Volver a verificar
            </Button>
            <Button variant="outline" onClick={() => setFactCheckOpen(false)} data-testid="button-close-fact-check">
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* [Fix251] Dialogo de sugerencias de titulo por IA (movido desde la lista) */}
      <Dialog open={suggestions !== null} onOpenChange={(open) => { if (!open) setSuggestions(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Sugerencias de título del capítulo
            </DialogTitle>
            <DialogDescription>
              Haz clic en una sugerencia para usarla como título del capítulo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {(suggestions || []).map((s, i) => (
              <Button
                key={i}
                variant="outline"
                className="w-full justify-start text-left h-auto py-2 whitespace-normal"
                onClick={() => renameChapterMutation.mutate(s)}
                disabled={renameChapterMutation.isPending}
                data-testid={`button-chapter-title-suggestion-${i}`}
              >
                {s}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => suggestTitlesMutation.mutate()}
              disabled={suggestTitlesMutation.isPending}
              data-testid="button-regenerate-chapter-title-suggestions"
            >
              {suggestTitlesMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}
              Otras sugerencias
            </Button>
            <Button variant="outline" onClick={() => setSuggestions(null)} data-testid="button-close-chapter-title-suggestions">
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
