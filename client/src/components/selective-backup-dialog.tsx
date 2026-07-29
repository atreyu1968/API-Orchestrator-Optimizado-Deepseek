import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, Upload, Loader2, FileText, CheckCheck, X } from "lucide-react";
import type { Project } from "@shared/schema";

interface SelectiveBackupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    completed: "Completado",
    completed_with_issues: "Completado",
    generating: "Generando",
    applying_editorial: "Editando",
    failed: "Fallido",
    paused: "Pausado",
  };
  return map[status] || status;
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status.startsWith("completed")) return "default";
  if (status === "failed") return "destructive";
  return "secondary";
}

// ─── EXPORT TAB ─────────────────────────────────────────────────────────────

function ExportTab() {
  const { toast } = useToast();
  const { data: projects = [], isLoading } = useQuery<Project[]>({ queryKey: ["/api/projects"] });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [exporting, setExporting] = useState(false);

  const toggle = (id: number) =>
    setSelected(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });

  const toggleAll = () =>
    setSelected(prev =>
      prev.size === projects.length ? new Set() : new Set(projects.map(p => p.id))
    );

  const handleExport = async () => {
    setExporting(true);
    try {
      const ids = selected.size > 0 ? [...selected].join(",") : null;
      const url = ids ? `/api/data-export?projectIds=${ids}` : "/api/data-export";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Error al exportar");
      const data = await res.json();
      const date = new Date().toISOString().split("T")[0];
      const suffix = ids ? `seleccion-${selected.size}proyectos` : "completo";
      downloadJson(`litagents-backup-${suffix}-${date}.json`, data);
      toast({ title: "Exportación completada", description: `${data.data?.projects?.length ?? 0} proyecto(s) exportados` });
    } catch {
      toast({ title: "Error", description: "No se pudo exportar", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Selecciona los proyectos a incluir. Si no marcas ninguno se exporta todo.
      </p>

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={toggleAll}>
          {selected.size === projects.length ? <><X className="h-3 w-3 mr-1" />Deseleccionar todo</> : <><CheckCheck className="h-3 w-3 mr-1" />Seleccionar todo</>}
        </Button>
        <span className="text-xs text-muted-foreground">
          {selected.size === 0 ? "Exportar todo" : `${selected.size} de ${projects.length} seleccionados`}
        </span>
      </div>

      <ScrollArea className="h-64 border rounded-md">
        <div className="p-2 space-y-1">
          {projects.map(p => (
            <label
              key={p.id}
              className="flex items-center gap-3 p-2 rounded hover:bg-muted/50 cursor-pointer"
            >
              <Checkbox
                checked={selected.has(p.id)}
                onCheckedChange={() => toggle(p.id)}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{p.title}</p>
                <p className="text-xs text-muted-foreground">{p.genre || "Sin género"}</p>
              </div>
              <Badge variant={statusVariant(p.status)} className="text-xs shrink-0">
                {statusLabel(p.status)}
              </Badge>
            </label>
          ))}
        </div>
      </ScrollArea>

      <Button onClick={handleExport} disabled={exporting} className="w-full">
        {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
        {selected.size === 0 ? "Exportar todo" : `Exportar ${selected.size} proyecto(s)`}
      </Button>
    </div>
  );
}

// ─── IMPORT TAB ─────────────────────────────────────────────────────────────

interface BackupProject { id: number; title: string; status: string; genre?: string | null; }

function ImportTab() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [backup, setBackup] = useState<{ exportedAt: string; data: any } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const backupProjects: BackupProject[] = backup?.data?.projects ?? [];

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    setBackup(null);
    setSelected(new Set());
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (!json.data?.projects) throw new Error("El archivo no tiene el formato de backup esperado");
      setBackup(json);
      // Preseleccionar todos
      setSelected(new Set(json.data.projects.map((p: BackupProject) => p.id)));
    } catch (err: any) {
      setParseError(err.message || "No se pudo leer el archivo");
    }
    e.target.value = "";
  };

  const toggle = (id: number) =>
    setSelected(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });

  const toggleAll = () =>
    setSelected(prev =>
      prev.size === backupProjects.length
        ? new Set()
        : new Set(backupProjects.map(p => p.id))
    );

  const handleImport = async () => {
    if (!backup || selected.size === 0) return;
    setImporting(true);
    try {
      const body: any = { data: backup.data };
      if (selected.size < backupProjects.length) {
        body.projectIds = [...selected];
      }
      const res = await fetch("/api/data-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Error al importar");
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pseudonyms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/style-guides"] });
      queryClient.invalidateQueries({ queryKey: ["/api/extended-guides"] });
      queryClient.invalidateQueries({ queryKey: ["/api/guides"] });
      queryClient.invalidateQueries({ queryKey: ["/api/series"] });
      const imported = result.results?.imported || {};
      toast({
        title: "Importación completada",
        description: Object.entries(imported).map(([k, v]) => `${v} ${k}`).join(", ") || "Sin cambios",
      });
      setBackup(null);
      setSelected(new Set());
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "No se pudo importar", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Sube un archivo de backup y elige qué proyectos importar.
      </p>

      {!backup ? (
        <>
          <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />
            Seleccionar archivo de backup (.json)
          </Button>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFile} />
          {parseError && <p className="text-sm text-destructive">{parseError}</p>}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 p-2 bg-muted rounded-md">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Backup cargado</p>
                <p className="text-xs text-muted-foreground truncate">
                  {new Date(backup.exportedAt).toLocaleString("es-ES")} · {backupProjects.length} proyecto(s)
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => { setBackup(null); setSelected(new Set()); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={toggleAll}>
              {selected.size === backupProjects.length
                ? <><X className="h-3 w-3 mr-1" />Deseleccionar todo</>
                : <><CheckCheck className="h-3 w-3 mr-1" />Seleccionar todo</>}
            </Button>
            <span className="text-xs text-muted-foreground">{selected.size} de {backupProjects.length} seleccionados</span>
          </div>

          <ScrollArea className="h-52 border rounded-md">
            <div className="p-2 space-y-1">
              {backupProjects.map(p => (
                <label key={p.id} className="flex items-center gap-3 p-2 rounded hover:bg-muted/50 cursor-pointer">
                  <Checkbox
                    checked={selected.has(p.id)}
                    onCheckedChange={() => toggle(p.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.title}</p>
                    <p className="text-xs text-muted-foreground">{p.genre || "Sin género"}</p>
                  </div>
                  <Badge variant={statusVariant(p.status)} className="text-xs shrink-0">
                    {statusLabel(p.status)}
                  </Badge>
                </label>
              ))}
            </div>
          </ScrollArea>

          <Button onClick={handleImport} disabled={importing || selected.size === 0} className="w-full">
            {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            {selected.size === 0 ? "Selecciona al menos un proyecto" : `Importar ${selected.size} proyecto(s)`}
          </Button>
        </>
      )}
    </div>
  );
}

// ─── DIALOG ─────────────────────────────────────────────────────────────────

export function SelectiveBackupDialog({ open, onOpenChange }: SelectiveBackupDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Copia de seguridad</DialogTitle>
          <DialogDescription>
            Exporta o importa proyectos seleccionados
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="export">
          <TabsList className="w-full">
            <TabsTrigger value="export" className="flex-1">
              <Download className="h-4 w-4 mr-2" />
              Exportar
            </TabsTrigger>
            <TabsTrigger value="import" className="flex-1">
              <Upload className="h-4 w-4 mr-2" />
              Importar
            </TabsTrigger>
          </TabsList>

          <TabsContent value="export" className="mt-4">
            <ExportTab />
          </TabsContent>
          <TabsContent value="import" className="mt-4">
            <ImportTab />
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
