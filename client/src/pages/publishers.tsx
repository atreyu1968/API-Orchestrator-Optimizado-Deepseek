import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, Building2, Upload, X } from "lucide-react";
import type { Publisher } from "@shared/schema";

interface FormState { name: string; websiteUrl: string; copyrightLine: string; logoDataUrl: string | null }
const EMPTY: FormState = { name: "", websiteUrl: "", copyrightLine: "", logoDataUrl: null };

export default function PublishersPage() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Publisher | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const { data: publishers = [], isLoading } = useQuery<Publisher[]>({ queryKey: ["/api/publishers"] });

  const createMutation = useMutation({
    mutationFn: async (data: FormState) => apiRequest("POST", "/api/publishers", {
      name: data.name.trim(),
      websiteUrl: data.websiteUrl.trim() || null,
      copyrightLine: data.copyrightLine.trim() || null,
      logoDataUrl: data.logoDataUrl,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/publishers"] });
      toast({ title: "Editorial creada" });
      reset();
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message || "No se pudo crear", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: FormState }) => apiRequest("PATCH", `/api/publishers/${id}`, {
      name: data.name.trim(),
      websiteUrl: data.websiteUrl.trim() || null,
      copyrightLine: data.copyrightLine.trim() || null,
      logoDataUrl: data.logoDataUrl,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/publishers"] });
      toast({ title: "Editorial actualizada" });
      reset();
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message || "No se pudo actualizar", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/publishers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/publishers"] });
      toast({ title: "Editorial eliminada" });
    },
  });

  function reset() {
    setOpen(false);
    setEditing(null);
    setForm(EMPTY);
  }

  function startEdit(p: Publisher) {
    setEditing(p);
    setForm({
      name: p.name,
      websiteUrl: p.websiteUrl || "",
      copyrightLine: p.copyrightLine || "",
      logoDataUrl: p.logoDataUrl || null,
    });
    setOpen(true);
  }

  async function handleLogoUpload(file: File) {
    if (file.size > 1024 * 1024) {
      toast({ title: "Logo demasiado grande", description: "Máximo 1 MB.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm(f => ({ ...f, logoDataUrl: String(reader.result) }));
    reader.readAsDataURL(file);
  }

  function submit() {
    if (!form.name.trim()) {
      toast({ title: "El nombre es obligatorio", variant: "destructive" });
      return;
    }
    if (editing) updateMutation.mutate({ id: editing.id, data: form });
    else createMutation.mutate(form);
  }

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="page-publishers">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Building2 className="h-7 w-7" /> Editoriales</h1>
          <p className="text-muted-foreground mt-1">Gestiona las editoriales que aparecerán en la portada y página de copyright de los EPUB exportados.</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); else setOpen(true); }}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditing(null); setForm(EMPTY); setOpen(true); }} data-testid="button-new-publisher">
              <Plus className="h-4 w-4 mr-2" /> Nueva editorial
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar editorial" : "Nueva editorial"}</DialogTitle>
              <DialogDescription>Los datos se usarán en la portada y la página de copyright del EPUB.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="pub-name">Nombre *</Label>
                <Input id="pub-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} data-testid="input-publisher-name" />
              </div>
              <div>
                <Label htmlFor="pub-web">Sitio web</Label>
                <Input id="pub-web" placeholder="https://..." value={form.websiteUrl} onChange={e => setForm(f => ({ ...f, websiteUrl: e.target.value }))} data-testid="input-publisher-website" />
              </div>
              <div>
                <Label htmlFor="pub-copy">Línea de copyright</Label>
                <Textarea id="pub-copy" placeholder="© 2026 Editorial X. Todos los derechos reservados." value={form.copyrightLine} onChange={e => setForm(f => ({ ...f, copyrightLine: e.target.value }))} data-testid="input-publisher-copyright" />
              </div>
              <div>
                <Label>Logo (PNG/JPG, máx 1 MB)</Label>
                <div className="flex items-center gap-3 mt-1">
                  {form.logoDataUrl ? (
                    <div className="relative">
                      <img src={form.logoDataUrl} alt="Logo" className="h-16 w-16 object-contain border rounded" />
                      <button type="button" onClick={() => setForm(f => ({ ...f, logoDataUrl: null }))} className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1" data-testid="button-remove-logo">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="h-16 w-16 border border-dashed rounded flex items-center justify-center text-muted-foreground"><Building2 className="h-6 w-6" /></div>
                  )}
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); }} />
                  <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} data-testid="button-upload-logo">
                    <Upload className="h-4 w-4 mr-2" /> Subir logo
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={reset}>Cancelar</Button>
              <Button onClick={submit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-publisher">
                {editing ? "Guardar" : "Crear"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : publishers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>Todavía no hay editoriales. Crea una para poder usarla en los EPUB.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {publishers.map(p => (
            <Card key={p.id} data-testid={`card-publisher-${p.id}`}>
              <CardHeader>
                <div className="flex items-start gap-3">
                  {p.logoDataUrl ? (
                    <img src={p.logoDataUrl} alt={p.name} className="h-12 w-12 object-contain border rounded" />
                  ) : (
                    <div className="h-12 w-12 border rounded flex items-center justify-center"><Building2 className="h-6 w-6 text-muted-foreground" /></div>
                  )}
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate" data-testid={`text-publisher-name-${p.id}`}>{p.name}</CardTitle>
                    {p.websiteUrl && <CardDescription className="truncate">{p.websiteUrl}</CardDescription>}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {p.copyrightLine && <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{p.copyrightLine}</p>}
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => startEdit(p)} data-testid={`button-edit-publisher-${p.id}`}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { if (confirm(`¿Eliminar editorial "${p.name}"?`)) deleteMutation.mutate(p.id); }} data-testid={`button-delete-publisher-${p.id}`}>
                    <Trash2 className="h-3.5 w-3.5 mr-1 text-destructive" /> Eliminar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
