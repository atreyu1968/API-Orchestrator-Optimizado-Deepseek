import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Users, BookOpen, Shield, Heart, Skull, GitBranch, Activity, AlertTriangle, Plus, Trash2, Power, PowerOff, PenLine } from "lucide-react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { WorldBible, Character, TimelineEvent, WorldRule, PlotOutline } from "@shared/schema";

// Helper function to safely convert any value to a displayable string
// Handles objects with keys like {tipo, numero, descripcion, elementos_sensoriales, etc.}
function safeStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object') {
    // Handle objects with common keys from AI-generated content
    const obj = value as Record<string, unknown>;
    if ('descripcion' in obj && typeof obj.descripcion === 'string') {
      return obj.descripcion;
    }
    if ('description' in obj && typeof obj.description === 'string') {
      return obj.description;
    }
    if ('event' in obj && typeof obj.event === 'string') {
      return obj.event;
    }
    if ('name' in obj && typeof obj.name === 'string') {
      return obj.name;
    }
    if ('texto' in obj && typeof obj.texto === 'string') {
      return obj.texto;
    }
    // Fallback: try to create a readable summary
    try {
      return JSON.stringify(value);
    } catch {
      return '[Object]';
    }
  }
  return String(value);
}

interface PlotDecision {
  decision: string;
  capitulo_establecido: number;
  capitulos_afectados: number[];
  consistencia_actual: "consistente" | "inconsistente";
  problema?: string;
}

interface PersistentInjury {
  personaje: string;
  tipo_lesion: string;
  capitulo_ocurre: number;
  efecto_esperado: string;
  capitulos_verificados: number[];
  consistencia: "mantenida" | "ignorada";
  problema?: string;
}

interface AuthorNote {
  id: string;
  text: string;
  category: string;
  priority: string;
  active: boolean;
  createdAt: string;
}

const NOTE_CATEGORIES = [
  { value: "continuity", label: "Continuidad" },
  { value: "character", label: "Personaje" },
  { value: "plot", label: "Trama" },
  { value: "style", label: "Estilo" },
  { value: "worldbuilding", label: "Mundo" },
  { value: "other", label: "Otro" },
];

const CATEGORY_COLORS: Record<string, string> = {
  continuity: "text-orange-600 bg-orange-100 dark:bg-orange-900/30",
  character: "text-blue-600 bg-blue-100 dark:bg-blue-900/30",
  plot: "text-purple-600 bg-purple-100 dark:bg-purple-900/30",
  style: "text-green-600 bg-green-100 dark:bg-green-900/30",
  worldbuilding: "text-amber-600 bg-amber-100 dark:bg-amber-900/30",
  other: "text-gray-600 bg-gray-100 dark:bg-gray-900/30",
};

function AuthorNotesTab({ projectId }: { projectId: number }) {
  const [showForm, setShowForm] = useState(false);
  const [text, setText] = useState("");
  const [category, setCategory] = useState("continuity");
  const [priority, setPriority] = useState("normal");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: notes = [], isLoading } = useQuery<AuthorNote[]>({
    queryKey: ["/api/projects", projectId, "author-notes"],
    enabled: !!projectId,
  });

  const addMutation = useMutation({
    mutationFn: async (note: { text: string; category: string; priority: string }) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/author-notes`, note);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "author-notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "world-bible"] });
      setText("");
      setShowForm(false);
      toast({ title: "Nota guardada" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ noteId, active }: { noteId: string; active: boolean }) => {
      const res = await apiRequest("PATCH", `/api/projects/${projectId}/author-notes/${noteId}`, { active });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "author-notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "world-bible"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      const res = await apiRequest("DELETE", `/api/projects/${projectId}/author-notes/${noteId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "author-notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "world-bible"] });
      toast({ title: "Nota eliminada" });
    },
  });

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground text-sm">Cargando notas...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Instrucciones y restricciones que los agentes respetarán al escribir y revisar.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowForm(!showForm)}
          data-testid="button-add-author-note"
        >
          <Plus className="h-4 w-4 mr-1" />
          Añadir nota
        </Button>
      </div>

      {showForm && (
        <Card data-testid="form-author-note">
          <CardContent className="pt-4 space-y-3">
            <Textarea
              placeholder="Ej: El personaje María no puede caminar desde el capítulo 5 porque se rompió la pierna..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              data-testid="input-author-note-text"
            />
            <div className="flex gap-2 flex-wrap">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-[160px]" data-testid="select-author-note-category">
                  <SelectValue placeholder="Categoría" />
                </SelectTrigger>
                <SelectContent>
                  {NOTE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="w-[140px]" data-testid="select-author-note-priority">
                  <SelectValue placeholder="Prioridad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Crítica</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="low">Baja</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={() => addMutation.mutate({ text, category, priority })}
                disabled={!text.trim() || addMutation.isPending}
                data-testid="button-save-author-note"
              >
                Guardar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {notes.length === 0 && !showForm && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <PenLine className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground text-sm">Sin notas del autor</p>
          <p className="text-muted-foreground/60 text-xs mt-1">
            Añade instrucciones para que los agentes eviten errores conocidos
          </p>
        </div>
      )}

      <ScrollArea className="h-[400px]">
        <div className="space-y-2 pr-4">
          {notes.map((note) => {
            const catLabel = NOTE_CATEGORIES.find(c => c.value === note.category)?.label || note.category;
            const colorClass = CATEGORY_COLORS[note.category] || CATEGORY_COLORS.other;
            const priorityIcon = note.priority === "critical" ? "🔴" : 
                                 note.priority === "high" ? "🟠" : 
                                 note.priority === "normal" ? "🟢" : "⚪";
            return (
              <Card 
                key={note.id} 
                className={`${!note.active ? "opacity-50" : ""}`}
                data-testid={`author-note-${note.id}`}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs">{priorityIcon}</span>
                        <Badge variant="secondary" className={`text-xs ${colorClass}`}>
                          {catLabel}
                        </Badge>
                        {!note.active && (
                          <Badge variant="outline" className="text-xs">Desactivada</Badge>
                        )}
                      </div>
                      <p className="text-sm">{note.text}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(note.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => toggleMutation.mutate({ noteId: note.id, active: !note.active })}
                        title={note.active ? "Desactivar" : "Activar"}
                        data-testid={`button-toggle-note-${note.id}`}
                      >
                        {note.active ? <Power className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => deleteMutation.mutate(note.id)}
                        data-testid={`button-delete-note-${note.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

interface WorldBibleDisplayProps {
  worldBible: WorldBible | null;
  projectId?: number;
}

function TimelineTab({ events }: { events: TimelineEvent[] }) {
  if (!events || events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Clock className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-muted-foreground text-sm">Sin eventos en la línea temporal</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px]">
      <div className="relative pl-6 pr-4 space-y-4">
        <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-border" />
        {events.map((event, index) => (
          <div key={index} className="relative" data-testid={`timeline-event-${index}`}>
            <div className="absolute -left-4 top-1.5 w-3 h-3 rounded-full bg-primary border-2 border-background" />
            <div className="bg-card border border-card-border rounded-md p-3">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary" className="text-xs">Cap. {event.chapter}</Badge>
                <span className="text-sm font-medium">{safeStringify(event.event)}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {event.characters.map((char, i) => (
                  <Badge key={i} className="text-xs bg-chart-1/10 text-chart-1">{safeStringify(char)}</Badge>
                ))}
              </div>
              {event.significance && (
                <p className="text-xs text-muted-foreground mt-2 italic">{safeStringify(event.significance)}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

function CharactersTab({ characters }: { characters: Character[] }) {
  if (!characters || characters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Users className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-muted-foreground text-sm">Sin personajes definidos</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px]">
      <div className="grid gap-3 pr-4">
        {characters.map((character, index) => (
          <Card key={index} data-testid={`character-card-${index}`}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  {character.name}
                  {!character.isAlive && <Skull className="h-4 w-4 text-destructive" />}
                </CardTitle>
                <Badge variant="outline" className="text-xs">{character.role}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">
                  Perfil Psicológico
                </p>
                <p className="text-sm text-foreground">{safeStringify(character.psychologicalProfile)}</p>
              </div>
              {character.arc && (
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">
                    Arco del Personaje
                  </p>
                  <p className="text-sm text-foreground">{safeStringify(character.arc)}</p>
                </div>
              )}
              {character.relationships && character.relationships.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  <Heart className="h-3.5 w-3.5 text-muted-foreground mr-1" />
                  {character.relationships.map((rel, i) => {
                    const displayText = typeof rel === 'string' 
                      ? rel 
                      : typeof rel === 'object' && rel !== null
                        ? (rel as { con?: string; tipo?: string }).con 
                          ? `${(rel as { con: string; tipo?: string }).con}${(rel as { tipo?: string }).tipo ? ` (${(rel as { tipo: string }).tipo})` : ''}`
                          : JSON.stringify(rel)
                        : String(rel);
                    return (
                      <Badge key={i} variant="secondary" className="text-xs">{displayText}</Badge>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </ScrollArea>
  );
}

function WorldRulesTab({ rules }: { rules: WorldRule[] }) {
  if (!rules || rules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Shield className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-muted-foreground text-sm">Sin reglas del mundo definidas</p>
      </div>
    );
  }

  const groupedRules = rules.reduce((acc, rule) => {
    const category = rule.category || "General";
    if (!acc[category]) acc[category] = [];
    acc[category].push(rule);
    return acc;
  }, {} as Record<string, WorldRule[]>);

  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-4 pr-4">
        {Object.entries(groupedRules).map(([category, categoryRules]) => (
          <div key={category}>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">
              {category}
            </h3>
            <div className="space-y-2">
              {categoryRules.map((rule, index) => (
                <div 
                  key={index} 
                  className="bg-card border border-card-border rounded-md p-3"
                  data-testid={`world-rule-${index}`}
                >
                  <p className="text-sm font-medium">{safeStringify(rule.rule)}</p>
                  {rule.constraints && rule.constraints.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {rule.constraints.map((constraint, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{safeStringify(constraint)}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

function PlotDecisionsTab({ decisions }: { decisions: PlotDecision[] }) {
  if (!decisions || decisions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <GitBranch className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-muted-foreground text-sm">Sin decisiones de trama registradas</p>
        <p className="text-muted-foreground/60 text-xs mt-1">
          El Revisor Final detectará decisiones críticas durante la revisión
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-3 pr-4">
        {decisions.map((decision, index) => (
          <Card 
            key={index} 
            className={decision.consistencia_actual === "inconsistente" ? "border-destructive/50" : ""}
            data-testid={`plot-decision-${index}`}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium">{decision.decision}</CardTitle>
                <Badge 
                  variant={decision.consistencia_actual === "consistente" ? "secondary" : "destructive"}
                  className="text-xs"
                >
                  {decision.consistencia_actual === "consistente" ? "Consistente" : "Inconsistente"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-xs">
                  Establecido: Cap. {decision.capitulo_establecido}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Afecta: {decision.capitulos_afectados.map(c => `Cap. ${c}`).join(", ")}
                </span>
              </div>
              {decision.problema && (
                <p className="text-xs text-destructive mt-2">{decision.problema}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </ScrollArea>
  );
}

function PersistentInjuriesTab({ injuries }: { injuries: PersistentInjury[] }) {
  if (!injuries || injuries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Activity className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-muted-foreground text-sm">Sin lesiones persistentes registradas</p>
        <p className="text-muted-foreground/60 text-xs mt-1">
          El Revisor Final detectará lesiones que requieren seguimiento
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-3 pr-4">
        {injuries.map((injury, index) => (
          <Card 
            key={index} 
            className={injury.consistencia === "ignorada" ? "border-destructive/50" : ""}
            data-testid={`persistent-injury-${index}`}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Skull className="h-4 w-4" />
                  {injury.personaje}
                </CardTitle>
                <Badge 
                  variant={injury.consistencia === "mantenida" ? "secondary" : "destructive"}
                  className="text-xs"
                >
                  {injury.consistencia === "mantenida" ? "Mantenida" : "Ignorada"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm">{injury.tipo_lesion}</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-xs">
                  Ocurre: Cap. {injury.capitulo_ocurre}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">Efecto esperado:</span> {injury.efecto_esperado}
              </p>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">Verificado en:</span> {injury.capitulos_verificados.map(c => `Cap. ${c}`).join(", ")}
              </p>
              {injury.problema && (
                <p className="text-xs text-destructive mt-2">{injury.problema}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </ScrollArea>
  );
}

function PlotTab({ plotOutline }: { plotOutline: PlotOutline | null }) {
  if (!plotOutline || !plotOutline.premise) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <BookOpen className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-muted-foreground text-sm">Sin esquema de trama definido</p>
      </div>
    );
  }

  const { threeActStructure, chapterOutlines } = plotOutline;

  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-6 pr-4">
        {plotOutline.premise && (
          <div>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Premisa
            </h3>
            <p className="text-sm">{safeStringify(plotOutline.premise)}</p>
          </div>
        )}

        {threeActStructure && (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Estructura de Tres Actos
            </h3>
            
            {threeActStructure.act1 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Acto I: Planteamiento</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {threeActStructure.act1.setup && (
                    <div>
                      <span className="font-medium">Setup: </span>
                      {safeStringify(threeActStructure.act1.setup)}
                    </div>
                  )}
                  {threeActStructure.act1.incitingIncident && (
                    <div>
                      <span className="font-medium">Incidente Incitador: </span>
                      {safeStringify(threeActStructure.act1.incitingIncident)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {threeActStructure.act2 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Acto II: Confrontación</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {threeActStructure.act2.risingAction && (
                    <div>
                      <span className="font-medium">Acción Ascendente: </span>
                      {safeStringify(threeActStructure.act2.risingAction)}
                    </div>
                  )}
                  {threeActStructure.act2.midpoint && (
                    <div>
                      <span className="font-medium">Punto Medio: </span>
                      {safeStringify(threeActStructure.act2.midpoint)}
                    </div>
                  )}
                  {threeActStructure.act2.complications && (
                    <div>
                      <span className="font-medium">Complicaciones: </span>
                      {safeStringify(threeActStructure.act2.complications)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {threeActStructure.act3 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Acto III: Resolución</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {threeActStructure.act3.climax && (
                    <div>
                      <span className="font-medium">Clímax: </span>
                      {safeStringify(threeActStructure.act3.climax)}
                    </div>
                  )}
                  {threeActStructure.act3.resolution && (
                    <div>
                      <span className="font-medium">Resolución: </span>
                      {safeStringify(threeActStructure.act3.resolution)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {chapterOutlines && chapterOutlines.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Resumen por Capítulo
            </h3>
            <div className="space-y-2">
              {chapterOutlines.map((chapter, index) => (
                <div 
                  key={index} 
                  className="bg-card border border-card-border rounded-md p-3"
                  data-testid={`chapter-outline-${chapter.number}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary" className="text-xs">Cap. {chapter.number}</Badge>
                  </div>
                  <p className="text-sm mb-2">{safeStringify(chapter.summary)}</p>
                  <div className="flex flex-wrap gap-1">
                    {chapter.keyEvents.map((event, i) => (
                      <Badge key={i} variant="outline" className="text-xs">{safeStringify(event)}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

export function WorldBibleDisplay({ worldBible, projectId }: WorldBibleDisplayProps) {
  if (!worldBible) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <BookOpen className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-muted-foreground text-sm">
          No hay biblia del mundo disponible
        </p>
        <p className="text-muted-foreground/60 text-xs mt-1">
          Se generará automáticamente al crear un proyecto
        </p>
      </div>
    );
  }

  const timeline = (worldBible.timeline || []) as TimelineEvent[];
  const characters = (worldBible.characters || []) as Character[];
  const worldRules = (worldBible.worldRules || []) as WorldRule[];
  const plotOutline = (worldBible.plotOutline || null) as PlotOutline | null;
  const plotDecisions = (worldBible.plotDecisions || []) as PlotDecision[];
  const persistentInjuries = (worldBible.persistentInjuries || []) as PersistentInjury[];

  const authorNotes = ((worldBible.authorNotes || []) as any[]);
  const hasDecisions = plotDecisions.length > 0;
  const hasInjuries = persistentInjuries.length > 0;

  return (
    <Tabs defaultValue="plot" className="w-full" data-testid="world-bible-tabs">
      <TabsList className="w-full justify-start mb-4 flex-wrap gap-1">
        <TabsTrigger value="plot" className="gap-1.5">
          <BookOpen className="h-4 w-4" />
          Trama
        </TabsTrigger>
        <TabsTrigger value="timeline" className="gap-1.5">
          <Clock className="h-4 w-4" />
          Cronología
        </TabsTrigger>
        <TabsTrigger value="characters" className="gap-1.5">
          <Users className="h-4 w-4" />
          Personajes
        </TabsTrigger>
        <TabsTrigger value="rules" className="gap-1.5">
          <Shield className="h-4 w-4" />
          Reglas
        </TabsTrigger>
        <TabsTrigger value="decisions" className="gap-1.5">
          <GitBranch className="h-4 w-4" />
          Decisiones
          {hasDecisions && (
            <Badge variant="secondary" className="ml-1 text-xs">{plotDecisions.length}</Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="injuries" className="gap-1.5">
          <Activity className="h-4 w-4" />
          Lesiones
          {hasInjuries && (
            <Badge variant="secondary" className="ml-1 text-xs">{persistentInjuries.length}</Badge>
          )}
        </TabsTrigger>
        {projectId && (
          <TabsTrigger value="author-notes" className="gap-1.5">
            <AlertTriangle className="h-4 w-4" />
            Notas del Autor
            {authorNotes.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{authorNotes.length}</Badge>
            )}
          </TabsTrigger>
        )}
      </TabsList>
      
      <TabsContent value="plot">
        <PlotTab plotOutline={plotOutline} />
      </TabsContent>
      
      <TabsContent value="timeline">
        <TimelineTab events={timeline} />
      </TabsContent>
      
      <TabsContent value="characters">
        <CharactersTab characters={characters} />
      </TabsContent>
      
      <TabsContent value="rules">
        <WorldRulesTab rules={worldRules} />
      </TabsContent>

      <TabsContent value="decisions">
        <PlotDecisionsTab decisions={plotDecisions} />
      </TabsContent>

      <TabsContent value="injuries">
        <PersistentInjuriesTab injuries={persistentInjuries} />
      </TabsContent>

      {projectId && (
        <TabsContent value="author-notes">
          <AuthorNotesTab projectId={projectId} />
        </TabsContent>
      )}
    </Tabs>
  );
}
