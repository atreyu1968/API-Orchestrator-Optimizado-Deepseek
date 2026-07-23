import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { FileText, CheckCircle, Loader2, Clock, Wand2, Pencil, Sparkles, Check, X } from "lucide-react";
import type { Chapter } from "@shared/schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ChapterListProps {
  chapters: Chapter[];
  selectedChapterId?: number;
  onSelectChapter: (chapter: Chapter) => void;
  // T003: si se pasa projectId, se muestra el botón "Rediseñar trama desde aquí"
  // por capítulo (a partir del 2). Si se omite, el componente sigue siendo
  // 100% retrocompatible.
  projectId?: number;
}

const statusConfig = {
  pending: { icon: Clock, color: "bg-muted text-muted-foreground", label: "Pendiente" },
  writing: { icon: Loader2, color: "bg-chart-2/20 text-chart-2", label: "Escribiendo" },
  editing: { icon: Loader2, color: "bg-chart-3/20 text-chart-3", label: "Editando" },
  completed: { icon: CheckCircle, color: "bg-green-500/20 text-green-600 dark:text-green-400", label: "Completado" },
};

// [Fix249] Fila que se renderiza como button normalmente y como div en modo
// edicion de titulo, para no anidar botones dentro de un button (HTML invalido).
function RowWrapper({ asButton, onClick, className, children, ...rest }: {
  asButton: boolean;
  onClick: () => void;
  className: string;
  children: React.ReactNode;
  [key: string]: any;
}) {
  if (asButton) {
    return <button onClick={onClick} className={className} {...rest}>{children}</button>;
  }
  return <div className={className} {...rest}>{children}</div>;
}

export function ChapterList({ chapters, selectedChapterId, onSelectChapter, projectId }: ChapterListProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [redesignChapter, setRedesignChapter] = useState<number | null>(null);
  const [redesignInstructions, setRedesignInstructions] = useState("");
  // [Fix249] Edicion de titulo de capitulo + sugerencias IA
  const [editingChapterId, setEditingChapterId] = useState<number | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [suggestionsFor, setSuggestionsFor] = useState<{ chapterId: number; suggestions: string[] } | null>(null);

  const renameChapterMutation = useMutation({
    mutationFn: async ({ chapterId, title }: { chapterId: number; title: string }) => {
      if (!projectId) throw new Error("Sin projectId");
      const res = await apiRequest("PATCH", `/api/projects/${projectId}/chapters/${chapterId}/title`, { title });
      return res.json();
    },
    onSuccess: () => {
      setEditingChapterId(null);
      setTitleDraft("");
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "chapters"] });
      }
      toast({ title: "Título actualizado" });
    },
    onError: (err: any) => {
      toast({ title: "No se pudo renombrar", description: err?.message || "Error desconocido", variant: "destructive" });
    },
  });

  const suggestChapterTitlesMutation = useMutation({
    mutationFn: async (chapterId: number) => {
      if (!projectId) throw new Error("Sin projectId");
      const res = await apiRequest("POST", `/api/projects/${projectId}/title-suggestions`, { chapterId });
      const data = await res.json();
      return { chapterId, suggestions: (data.suggestions || []) as string[] };
    },
    onSuccess: (data) => setSuggestionsFor(data),
    onError: (err: any) => {
      toast({ title: "No se pudieron generar sugerencias", description: err?.message || "Error desconocido", variant: "destructive" });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: async ({ fromChapter, instructions }: { fromChapter: number; instructions: string }) => {
      if (!projectId) throw new Error("Sin projectId");
      return apiRequest("POST", `/api/projects/${projectId}/regenerate-outline`, {
        fromChapter,
        instructions: instructions.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast({
        title: "Rediseño iniciado",
        description: `El Arquitecto está rediseñando la trama desde el capítulo ${redesignChapter}. Esto puede tardar unos minutos.`,
      });
      setRedesignChapter(null);
      setRedesignInstructions("");
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "chapters"] });
      }
    },
    onError: (err: any) => {
      toast({
        title: "No se pudo iniciar el rediseño",
        description: err?.message || "Error desconocido",
        variant: "destructive",
      });
    },
  });

  if (chapters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-muted-foreground text-sm">
          No hay capítulos todavía
        </p>
        <p className="text-muted-foreground/60 text-xs mt-1">
          Inicia un proyecto para generar capítulos
        </p>
      </div>
    );
  }

  return (
    <>
      <ScrollArea className="h-[400px]">
        <div className="space-y-2 pr-4">
          {chapters.map((chapter) => {
            const config = statusConfig[chapter.status as keyof typeof statusConfig] || statusConfig.pending;
            const StatusIcon = config.icon;
            const isSelected = selectedChapterId === chapter.id;
            const isLoading = chapter.status === "writing" || chapter.status === "editing";
            const canRedesignFromHere =
              !!projectId && typeof chapter.chapterNumber === "number" && chapter.chapterNumber >= 2;

            return (
              <div
                key={chapter.id}
                className={`group relative rounded-md transition-all duration-200
                  hover-elevate active-elevate-2
                  ${isSelected ? "bg-sidebar-accent" : "bg-card"}`}
              >
                {/* [Fix249] En modo edicion la fila es un div para no anidar botones dentro de un button */}
                <RowWrapper
                  asButton={editingChapterId !== chapter.id}
                  onClick={() => onSelectChapter(chapter)}
                  className="w-full text-left p-3"
                  data-testid={`button-chapter-${chapter.id}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-medium text-sm">
                      {chapter.chapterNumber === 0 ? "Prólogo"
                        : chapter.chapterNumber === -1 ? "Epílogo"
                          : chapter.chapterNumber === -2 ? "Nota del Autor"
                            : `Capítulo ${chapter.chapterNumber}`}
                    </span>
                    <Badge className={`${config.color} text-xs`}>
                      <StatusIcon className={`h-3 w-3 mr-1 ${isLoading ? "animate-spin" : ""}`} />
                      {config.label}
                    </Badge>
                  </div>
                  {editingChapterId === chapter.id ? (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Input
                        value={titleDraft}
                        onChange={(e) => setTitleDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && titleDraft.trim()) {
                            renameChapterMutation.mutate({ chapterId: chapter.id, title: titleDraft.trim() });
                          }
                          if (e.key === "Escape") { setEditingChapterId(null); setTitleDraft(""); }
                        }}
                        className="h-7 text-sm"
                        autoFocus
                        data-testid={`input-chapter-title-${chapter.id}`}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => titleDraft.trim() && renameChapterMutation.mutate({ chapterId: chapter.id, title: titleDraft.trim() })}
                        disabled={renameChapterMutation.isPending || !titleDraft.trim()}
                        data-testid={`button-save-chapter-title-${chapter.id}`}
                      >
                        {renameChapterMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => { setEditingChapterId(null); setTitleDraft(""); }}
                        data-testid={`button-cancel-chapter-title-${chapter.id}`}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : chapter.title ? (
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {chapter.title}
                    </p>
                  ) : null}
                  {chapter.wordCount && chapter.wordCount > 0 && (
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      {chapter.wordCount.toLocaleString()} palabras
                    </p>
                  )}
                </RowWrapper>
                <div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  {!!projectId && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title="Editar título del capítulo"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingChapterId(chapter.id);
                          setTitleDraft(chapter.title || "");
                        }}
                        data-testid={`button-edit-chapter-title-${chapter.id}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title="Sugerir títulos con IA"
                        onClick={(e) => {
                          e.stopPropagation();
                          suggestChapterTitlesMutation.mutate(chapter.id);
                        }}
                        disabled={suggestChapterTitlesMutation.isPending}
                        data-testid={`button-suggest-chapter-titles-${chapter.id}`}
                      >
                        {suggestChapterTitlesMutation.isPending && suggestChapterTitlesMutation.variables === chapter.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Sparkles className="h-3.5 w-3.5" />}
                      </Button>
                    </>
                  )}
                  {canRedesignFromHere && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      title={`Rediseñar trama desde el capítulo ${chapter.chapterNumber}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setRedesignChapter(chapter.chapterNumber);
                      }}
                      data-testid={`button-redesign-from-${chapter.chapterNumber}`}
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <Dialog
        open={redesignChapter !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRedesignChapter(null);
            setRedesignInstructions("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rediseñar trama desde el capítulo {redesignChapter}</DialogTitle>
            <DialogDescription>
              El Arquitecto leerá los capítulos ya escritos (1..{(redesignChapter ?? 1) - 1}) y
              rediseñará la escaleta de los capítulos {redesignChapter} en adelante.
              Los capítulos previos no se tocarán.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="redesign-instructions">
              Instrucciones para el rediseño (opcional)
            </label>
            <Textarea
              id="redesign-instructions"
              placeholder="Ej.: cambia el clímax para que el antagonista resulte ser el mentor; añade un giro romántico al final; reduce el subplot de la familia..."
              value={redesignInstructions}
              onChange={(e) => setRedesignInstructions(e.target.value)}
              rows={5}
              data-testid="textarea-redesign-instructions"
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setRedesignChapter(null);
                setRedesignInstructions("");
              }}
              data-testid="button-cancel-redesign"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (redesignChapter !== null) {
                  regenerateMutation.mutate({
                    fromChapter: redesignChapter,
                    instructions: redesignInstructions,
                  });
                }
              }}
              disabled={regenerateMutation.isPending}
              data-testid="button-confirm-redesign"
            >
              {regenerateMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Iniciando...</>
              ) : (
                <><Wand2 className="h-4 w-4 mr-2" />Rediseñar</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* [Fix249] Dialogo de sugerencias de titulo por IA para un capitulo */}
      <Dialog open={suggestionsFor !== null} onOpenChange={(open) => { if (!open) setSuggestionsFor(null); }}>
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
            {(suggestionsFor?.suggestions || []).map((s, i) => (
              <Button
                key={i}
                variant="outline"
                className="w-full justify-start text-left h-auto py-2 whitespace-normal"
                onClick={() => {
                  if (suggestionsFor) {
                    renameChapterMutation.mutate({ chapterId: suggestionsFor.chapterId, title: s });
                    setSuggestionsFor(null);
                  }
                }}
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
              onClick={() => suggestionsFor && suggestChapterTitlesMutation.mutate(suggestionsFor.chapterId)}
              disabled={suggestChapterTitlesMutation.isPending}
              data-testid="button-regenerate-chapter-title-suggestions"
            >
              {suggestChapterTitlesMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}
              Otras sugerencias
            </Button>
            <Button variant="outline" onClick={() => setSuggestionsFor(null)} data-testid="button-close-chapter-title-suggestions">
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
