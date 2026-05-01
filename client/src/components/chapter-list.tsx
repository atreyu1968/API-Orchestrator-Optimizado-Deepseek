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
import { FileText, CheckCircle, Loader2, Clock, Wand2 } from "lucide-react";
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

export function ChapterList({ chapters, selectedChapterId, onSelectChapter, projectId }: ChapterListProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [redesignChapter, setRedesignChapter] = useState<number | null>(null);
  const [redesignInstructions, setRedesignInstructions] = useState("");

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
                <button
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
                  {chapter.title && (
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {chapter.title}
                    </p>
                  )}
                  {chapter.wordCount && chapter.wordCount > 0 && (
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      {chapter.wordCount.toLocaleString()} palabras
                    </p>
                  )}
                </button>
                {canRedesignFromHere && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-2 h-6 w-6 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
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
    </>
  );
}
