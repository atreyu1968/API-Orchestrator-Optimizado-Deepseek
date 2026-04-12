import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Headphones, Play, Download, Trash2, RefreshCw, AlertCircle, CheckCircle2,
  Clock, Volume2, FileAudio, Loader2, Plus, ArrowLeft, Upload, Music, Pencil, Check, X, Pause, Square, Package
} from "lucide-react";
import type { AudiobookProject, AudiobookChapter } from "@shared/schema";

interface AudiobookProjectWithChapters extends AudiobookProject {
  chapters: AudiobookChapter[];
}

interface AvailableSource {
  sourceType: string;
  sourceId: number;
  title: string;
  chapters: number;
  language: string;
}

const sourceTypeLabels: Record<string, string> = {
  project: "Proyecto Original",
  reedit: "Reedición",
  imported: "Importado",
  translation: "Traducción",
};

function statusBadge(status: string) {
  const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    pending: { variant: "outline", label: "Pendiente" },
    processing: { variant: "secondary", label: "Procesando" },
    completed: { variant: "default", label: "Completado" },
    error: { variant: "destructive", label: "Error" },
    paused: { variant: "outline", label: "Pausado" },
  };
  const v = variants[status] || { variant: "outline" as const, label: status };
  return <Badge data-testid={`badge-status-${status}`} variant={v.variant}>{v.label}</Badge>;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function CreateAudiobookForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [selectedSource, setSelectedSource] = useState<AvailableSource | null>(null);
  const [voiceId, setVoiceId] = useState("6cd26509e27c42a2908235be0bdc84a1");
  const [voiceName, setVoiceName] = useState("Sergio");
  const [format, setFormat] = useState("mp3");
  const [bitrate, setBitrate] = useState(128);
  const [speed, setSpeed] = useState([1.0]);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  const { data: sources = [], isLoading: loadingSources } = useQuery<AvailableSource[]>({
    queryKey: ["/api/audiobooks/sources/available"],
  });

  const { data: voicesData, isLoading: loadingVoices } = useQuery<any>({
    queryKey: ["/api/audiobooks/voices/list"],
  });

  const voices = voicesData?.items || voicesData || [];

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSource || !voiceId || !title) throw new Error("Complete todos los campos requeridos");
      const formData = new FormData();
      formData.append("title", title);
      formData.append("sourceType", selectedSource.sourceType);
      formData.append("sourceId", String(selectedSource.sourceId));
      formData.append("sourceLanguage", selectedSource.language);
      formData.append("voiceId", voiceId);
      formData.append("voiceName", voiceName);
      formData.append("format", format);
      formData.append("bitrate", String(bitrate));
      formData.append("speed", String(speed[0]));
      if (coverFile) formData.append("coverImage", coverFile);

      const res = await fetch("/api/audiobooks", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error creating audiobook");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/audiobooks"] });
      toast({ title: "Audiolibro creado", description: "Ya puedes iniciar la generación de audio." });
      onCreated();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="h-5 w-5" />
          Nuevo Audiolibro
        </CardTitle>
        <CardDescription>Selecciona un libro completado y configura la voz para generar el audiolibro</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="title">Título del Audiolibro</Label>
          <Input
            id="title"
            data-testid="input-audiobook-title"
            placeholder="Ej: Mi Novela - Audiolibro"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Libro Fuente</Label>
          {loadingSources ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando fuentes...</div>
          ) : sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay libros completados disponibles. Completa un proyecto primero.</p>
          ) : (
            <Select
              value={selectedSource ? `${selectedSource.sourceType}_${selectedSource.sourceId}` : ""}
              onValueChange={(val) => {
                const [type, id] = val.split("_");
                const src = sources.find(s => s.sourceType === type && s.sourceId === Number(id));
                if (src) {
                  setSelectedSource(src);
                  if (!title) setTitle(`${src.title} - Audiolibro`);
                }
              }}
            >
              <SelectTrigger data-testid="select-source">
                <SelectValue placeholder="Selecciona un libro..." />
              </SelectTrigger>
              <SelectContent>
                {sources.map((s) => (
                  <SelectItem key={`${s.sourceType}_${s.sourceId}`} value={`${s.sourceType}_${s.sourceId}`}>
                    {s.title} ({sourceTypeLabels[s.sourceType]}, {s.chapters} caps, {s.language.toUpperCase()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-2">
          <Label>Voz (Fish Audio)</Label>
          {loadingVoices ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando voces...</div>
          ) : (
            <div className="space-y-2">
              <Input
                data-testid="input-voice-id"
                placeholder="ID de voz de Fish Audio (reference_id)"
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
              />
              <Input
                data-testid="input-voice-name"
                placeholder="Nombre de la voz (opcional, para referencia)"
                value={voiceName}
                onChange={(e) => setVoiceName(e.target.value)}
              />
              {Array.isArray(voices) && voices.length > 0 && (
                <div className="border rounded-md p-3 max-h-48 overflow-auto space-y-1">
                  <p className="text-xs text-muted-foreground mb-2">Voces disponibles (click para seleccionar):</p>
                  {voices.slice(0, 20).map((v: any) => (
                    <button
                      key={v._id || v.id}
                      type="button"
                      data-testid={`voice-option-${v._id || v.id}`}
                      className="w-full text-left px-2 py-1 text-sm rounded hover:bg-accent transition-colors"
                      onClick={() => {
                        setVoiceId(v._id || v.id);
                        setVoiceName(v.title || v.name || "");
                      }}
                    >
                      <span className="font-medium">{v.title || v.name || "Sin nombre"}</span>
                      <span className="text-xs text-muted-foreground ml-2">({v._id || v.id})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Formato de Audio</Label>
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger data-testid="select-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mp3">MP3</SelectItem>
                <SelectItem value="wav">WAV</SelectItem>
                <SelectItem value="opus">Opus</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Bitrate (kbps)</Label>
            <Select value={String(bitrate)} onValueChange={(v) => setBitrate(Number(v))}>
              <SelectTrigger data-testid="select-bitrate">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="64">64 kbps</SelectItem>
                <SelectItem value="128">128 kbps</SelectItem>
                <SelectItem value="192">192 kbps</SelectItem>
                <SelectItem value="256">256 kbps</SelectItem>
                <SelectItem value="320">320 kbps</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Velocidad de Lectura: {speed[0].toFixed(1)}x</Label>
          <Slider
            data-testid="slider-speed"
            value={speed}
            onValueChange={setSpeed}
            min={0.5}
            max={2.0}
            step={0.1}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0.5x (lento)</span>
            <span>1.0x (normal)</span>
            <span>2.0x (rápido)</span>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cover">Imagen de Portada (opcional)</Label>
          <div className="flex items-center gap-3">
            <Input
              id="cover"
              type="file"
              data-testid="input-cover-image"
              accept="image/*"
              onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
              className="flex-1"
            />
            {coverFile && (
              <Badge variant="secondary">
                <Upload className="h-3 w-3 mr-1" />
                {coverFile.name}
              </Badge>
            )}
          </div>
        </div>

        <Separator />

        <div className="flex gap-3 justify-end">
          <Button data-testid="button-cancel-create" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            data-testid="button-create-audiobook"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !title || !selectedSource || !voiceId}
          >
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Crear Audiolibro
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AudiobookDetail({ projectId, onBack }: { projectId: number; onBack: () => void }) {
  const { toast } = useToast();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const { data: project, isLoading } = useQuery<AudiobookProjectWithChapters>({
    queryKey: ["/api/audiobooks", projectId],
    refetchInterval: (query) => {
      const d = query.state.data;
      if (d && d.status === "processing") return 3000;
      if (d && d.chapters?.some((ch: any) => ch.status === "processing")) return 3000;
      return false;
    },
  });

  const generateAllMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/audiobooks/${projectId}/generate`);
    },
    onSuccess: () => {
      toast({ title: "Generación iniciada", description: "Los capítulos se están procesando..." });
      queryClient.invalidateQueries({ queryKey: ["/api/audiobooks", projectId] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const generateChapterMutation = useMutation({
    mutationFn: async (chapterId: number) => {
      const res = await apiRequest("POST", `/api/audiobooks/${projectId}/generate-chapter/${chapterId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/audiobooks", projectId] });
      toast({ title: "Generando capítulo...", description: "Se procesará en segundo plano" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/audiobooks/${projectId}/pause`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/audiobooks", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/audiobooks"] });
      toast({ title: "Generación pausada", description: "Se detuvo la generación. No se consumirán más créditos hasta que la reanudes." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const renameMutation = useMutation({
    mutationFn: async (newTitle: string) => {
      await apiRequest("PATCH", `/api/audiobooks/${projectId}`, { title: newTitle });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/audiobooks", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/audiobooks"] });
      toast({ title: "Título actualizado" });
      setEditingTitle(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/audiobooks/${projectId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/audiobooks"] });
      toast({ title: "Audiolibro eliminado" });
      onBack();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!project) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Proyecto no encontrado
        </CardContent>
      </Card>
    );
  }

  const progress = project.totalChapters ? ((project.completedChapters || 0) / project.totalChapters) * 100 : 0;
  const chapters = project.chapters || [];
  const isProcessing = project.status === "processing";
  const hasCompleted = chapters.some(c => c.status === "completed");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button data-testid="button-back" variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          {editingTitle ? (
            <div className="flex items-center gap-2">
              <Input
                data-testid="input-edit-title"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && titleDraft.trim()) renameMutation.mutate(titleDraft.trim());
                  if (e.key === "Escape") setEditingTitle(false);
                }}
                className="text-xl font-semibold h-9"
                autoFocus
              />
              <Button
                data-testid="button-save-title"
                variant="ghost"
                size="icon"
                onClick={() => titleDraft.trim() && renameMutation.mutate(titleDraft.trim())}
                disabled={renameMutation.isPending || !titleDraft.trim()}
              >
                {renameMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </Button>
              <Button data-testid="button-cancel-title" variant="ghost" size="icon" onClick={() => setEditingTitle(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold" data-testid="text-project-title">{project.title}</h2>
              <Button
                data-testid="button-edit-title"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => { setTitleDraft(project.title); setEditingTitle(true); }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            {sourceTypeLabels[project.sourceType] || project.sourceType} · {project.sourceLanguage?.toUpperCase()} · {project.voiceName || project.voiceId}
          </p>
        </div>
        {statusBadge(project.status)}
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Progreso: {project.completedChapters || 0} / {project.totalChapters} capítulos</span>
            <span className="text-sm text-muted-foreground">{Math.round(progress)}%</span>
          </div>
          <Progress data-testid="progress-generation" value={progress} className="h-3" />

          {project.errorMessage && (
            <div className="mt-3 flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {project.errorMessage}
            </div>
          )}

          <div className="flex gap-3 mt-4">
            {isProcessing ? (
              <Button
                data-testid="button-pause-generation"
                variant="secondary"
                onClick={() => pauseMutation.mutate()}
                disabled={pauseMutation.isPending}
              >
                {pauseMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Pause className="h-4 w-4 mr-2" />
                )}
                Pausar
              </Button>
            ) : (
              <Button
                data-testid="button-generate-all"
                onClick={() => generateAllMutation.mutate()}
                disabled={generateAllMutation.isPending}
              >
                {generateAllMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                {project.status === "paused" ? "Reanudar" : project.status === "completed" ? "Regenerar Pendientes" : "Generar Todo"}
              </Button>
            )}

            {hasCompleted && (
              <DownloadButton projectId={projectId!} projectTitle={project.title} />
            )}

            <Button
              data-testid="button-delete-audiobook"
              variant="destructive"
              size="icon"
              onClick={() => {
                const msg = isProcessing
                  ? "¿Eliminar este audiolibro? Se detendrá la generación en curso y se eliminarán todos los archivos."
                  : "¿Eliminar este audiolibro y todos sus archivos de audio?";
                if (confirm(msg)) {
                  deleteMutation.mutate();
                }
              }}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-4 gap-4 mt-4 text-sm">
            <div className="text-center p-2 bg-muted rounded-md">
              <div className="font-medium">{project.format?.toUpperCase()}</div>
              <div className="text-xs text-muted-foreground">Formato</div>
            </div>
            <div className="text-center p-2 bg-muted rounded-md">
              <div className="font-medium">{project.bitrate} kbps</div>
              <div className="text-xs text-muted-foreground">Bitrate</div>
            </div>
            <div className="text-center p-2 bg-muted rounded-md">
              <div className="font-medium">{project.speed?.toFixed(1)}x</div>
              <div className="text-xs text-muted-foreground">Velocidad</div>
            </div>
            <div className="text-center p-2 bg-muted rounded-md">
              <div className="font-medium">{project.totalChapters}</div>
              <div className="text-xs text-muted-foreground">Capítulos</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Capítulos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {chapters.map((ch) => (
              <div
                key={ch.id}
                data-testid={`chapter-row-${ch.id}`}
                className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                  {ch.chapterNumber}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{ch.chapterTitle || `Capítulo ${ch.chapterNumber}`}</div>
                  <div className="text-xs text-muted-foreground">
                    {ch.textContent.length.toLocaleString()} caracteres
                    {ch.audioSizeBytes && ` · ${formatBytes(ch.audioSizeBytes)}`}
                  </div>
                </div>

                {ch.status === "processing" && (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                )}

                {ch.status === "completed" && ch.audioFileName && (ch.audioSizeBytes ?? 0) > 10000 && (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <audio
                      data-testid={`audio-player-${ch.id}`}
                      controls
                      preload="none"
                      className="h-8 max-w-[200px]"
                      src={`/api/audiobooks/${projectId}/chapter/${ch.id}/audio`}
                    />
                  </>
                )}

                {ch.status === "completed" && (ch.audioSizeBytes ?? 0) <= 10000 && (
                  <div className="flex items-center gap-1 text-orange-500 text-xs">
                    <AlertCircle className="h-4 w-4" />
                    <span>Audio corrupto</span>
                  </div>
                )}

                {ch.status === "error" && (
                  <div className="flex items-center gap-1 text-destructive text-xs">
                    <AlertCircle className="h-4 w-4" />
                    <span className="max-w-[150px] truncate">{ch.errorMessage || "Error"}</span>
                  </div>
                )}

                {ch.status === "pending" && (
                  <Clock className="h-4 w-4 text-muted-foreground" />
                )}

                {(ch.status === "pending" || ch.status === "error" || (ch.status === "completed" && (ch.audioSizeBytes ?? 0) <= 10000)) && !isProcessing && (
                  <Button
                    data-testid={`button-generate-chapter-${ch.id}`}
                    variant="ghost"
                    size="sm"
                    onClick={() => generateChapterMutation.mutate(ch.id)}
                    disabled={generateChapterMutation.isPending}
                  >
                    {generateChapterMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AudiobooksPage() {
  const [view, setView] = useState<"list" | "create" | "detail">("list");
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  const { data: projects = [], isLoading } = useQuery<AudiobookProject[]>({
    queryKey: ["/api/audiobooks"],
  });

  if (view === "create") {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <CreateAudiobookForm
          onCreated={() => setView("list")}
          onCancel={() => setView("list")}
        />
      </div>
    );
  }

  if (view === "detail" && selectedProjectId) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <AudiobookDetail
          projectId={selectedProjectId}
          onBack={() => { setView("list"); setSelectedProjectId(null); }}
        />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Headphones className="h-6 w-6" />
            Audiolibros
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Convierte tus libros en audiolibros usando Fish Audio TTS
          </p>
        </div>
        <Button data-testid="button-new-audiobook" onClick={() => setView("create")}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Audiolibro
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Music className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-2">No hay audiolibros</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md">
              Crea tu primer audiolibro seleccionando un libro completado y eligiendo una voz.
              Los capítulos se convierten a audio uno por uno con Fish Audio.
            </p>
            <Button data-testid="button-new-audiobook-empty" onClick={() => setView("create")}>
              <Plus className="h-4 w-4 mr-2" />
              Crear Audiolibro
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {projects.map((p) => {
            const progress = p.totalChapters ? ((p.completedChapters || 0) / (p.totalChapters || 1)) * 100 : 0;
            return (
              <Card
                key={p.id}
                data-testid={`card-audiobook-${p.id}`}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => { setSelectedProjectId(p.id); setView("detail"); }}
              >
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileAudio className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold truncate">{p.title}</h3>
                        {statusBadge(p.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {sourceTypeLabels[p.sourceType] || p.sourceType} · {p.totalChapters} capítulos · {p.format?.toUpperCase()} · {p.voiceName || p.voiceId}
                      </p>
                      {(p.status === "processing" || p.status === "completed") && (
                        <div className="mt-2">
                          <Progress value={progress} className="h-2" />
                          <span className="text-xs text-muted-foreground">{p.completedChapters || 0}/{p.totalChapters} completados</span>
                        </div>
                      )}
                    </div>
                    <Volume2 className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DownloadButton({ projectId, projectTitle }: { projectId: number; projectTitle: string }) {
  const [showParts, setShowParts] = useState(false);
  const [partsInfo, setPartsInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const checkParts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/audiobooks/${projectId}/download-parts?maxMb=90`);
      const data = await res.json();
      setPartsInfo(data);
      if (data.totalParts <= 1) {
        window.location.href = `/api/audiobooks/${projectId}/download`;
      } else {
        setShowParts(true);
      }
    } catch {
      window.location.href = `/api/audiobooks/${projectId}/download`;
    }
    setLoading(false);
  };

  if (!showParts) {
    return (
      <Button
        data-testid="button-download-zip"
        variant="secondary"
        onClick={checkParts}
        disabled={loading}
      >
        {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
        Descargar
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <Badge variant="outline" className="text-xs py-1">
        {partsInfo.totalSizeMb} MB total · {partsInfo.totalParts} partes
      </Badge>
      {partsInfo.parts.map((part: any) => (
        <a key={part.partNumber} href={`/api/audiobooks/${projectId}/download-part/${part.partNumber}?maxMb=90`} download>
          <Button variant="secondary" size="sm" data-testid={`button-download-part-${part.partNumber}`}>
            <Package className="h-3 w-3 mr-1" />
            Parte {part.partNumber} ({part.sizeMb} MB)
          </Button>
        </a>
      ))}
      <Button variant="ghost" size="sm" onClick={() => setShowParts(false)}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
