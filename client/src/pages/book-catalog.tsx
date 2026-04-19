import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Plus, Trash2, Pencil, BookOpen, ExternalLink, Loader2,
  Library, ShoppingCart, Star, Check, X
} from "lucide-react";
import type { BookCatalogEntry, Pseudonym } from "@shared/schema";

const GENRE_OPTIONS = [
  { value: "thriller", label: "Thriller" },
  { value: "mystery", label: "Misterio" },
  { value: "fantasy", label: "Fantasía" },
  { value: "sci-fi", label: "Ciencia Ficción" },
  { value: "romance", label: "Romance" },
  { value: "historical", label: "Histórica" },
  { value: "historical_thriller", label: "Thriller Histórico" },
  { value: "horror", label: "Terror" },
  { value: "literary", label: "Literaria" },
  { value: "adventure", label: "Aventura" },
  { value: "crime", label: "Crimen" },
  { value: "suspense", label: "Suspense" },
  { value: "dark_fantasy", label: "Fantasía Oscura" },
  { value: "urban_fantasy", label: "Fantasía Urbana" },
  { value: "dystopian", label: "Distopía" },
  { value: "other", label: "Otro" },
];

function BookFormDialog({
  open,
  onClose,
  entry,
  pseudonyms,
}: {
  open: boolean;
  onClose: () => void;
  entry?: BookCatalogEntry | null;
  pseudonyms: Pseudonym[];
}) {
  const { toast } = useToast();
  const isEdit = !!entry;

  const [title, setTitle] = useState(entry?.title || "");
  const [authorName, setAuthorName] = useState(entry?.authorName || "");
  const [pseudonymId, setPseudonymId] = useState<string>(entry?.pseudonymId?.toString() || "none");
  const [amazonUrl, setAmazonUrl] = useState(entry?.amazonUrl || "");
  const [goodreadsUrl, setGoodreadsUrl] = useState(entry?.goodreadsUrl || "");
  const [synopsis, setSynopsis] = useState(entry?.synopsis || "");
  const [genre, setGenre] = useState(entry?.genre || "");
  const [asin, setAsin] = useState(entry?.asin || "");
  const [isKindleUnlimited, setIsKindleUnlimited] = useState(entry?.isKindleUnlimited || false);

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (isEdit) {
        const res = await apiRequest("PATCH", `/api/book-catalog/${entry!.id}`, data);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/book-catalog", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/book-catalog"] });
      toast({ title: isEdit ? "Libro actualizado" : "Libro añadido al catálogo" });
      onClose();
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo guardar", variant: "destructive" });
    },
  });

  const handleSave = () => {
    if (!title.trim() || !authorName.trim()) return;
    saveMutation.mutate({
      title: title.trim(),
      authorName: authorName.trim(),
      pseudonymId: pseudonymId !== "none" ? parseInt(pseudonymId) : null,
      amazonUrl: amazonUrl.trim() || null,
      goodreadsUrl: goodreadsUrl.trim() || null,
      synopsis: synopsis.trim() || null,
      genre: genre || null,
      asin: asin.trim() || null,
      isKindleUnlimited,
    });
  };

  const handlePseudonymChange = (val: string) => {
    setPseudonymId(val);
    if (val !== "none") {
      const p = pseudonyms.find((x) => x.id.toString() === val);
      if (p) setAuthorName(p.name);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Libro" : "Añadir Libro al Catálogo"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Título *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título del libro..."
              data-testid="input-catalog-title"
            />
          </div>

          <div>
            <Label>Pseudónimo / Autor</Label>
            <Select value={pseudonymId} onValueChange={handlePseudonymChange}>
              <SelectTrigger data-testid="select-catalog-pseudonym">
                <SelectValue placeholder="Seleccionar..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin pseudónimo</SelectItem>
                {pseudonyms.map((p) => (
                  <SelectItem key={p.id} value={p.id.toString()}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Nombre del Autor *</Label>
            <Input
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="Nombre que aparece en la publicación..."
              data-testid="input-catalog-author"
            />
          </div>

          <div>
            <Label>Género</Label>
            <Select value={genre} onValueChange={setGenre}>
              <SelectTrigger data-testid="select-catalog-genre">
                <SelectValue placeholder="Seleccionar género..." />
              </SelectTrigger>
              <SelectContent>
                {GENRE_OPTIONS.map((g) => (
                  <SelectItem key={g.value} value={g.value}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div>
            <Label>Enlace Amazon</Label>
            <Input
              value={amazonUrl}
              onChange={(e) => setAmazonUrl(e.target.value)}
              placeholder="https://www.amazon.es/dp/..."
              data-testid="input-catalog-amazon-url"
            />
          </div>

          <div>
            <Label>Enlace Goodreads</Label>
            <Input
              value={goodreadsUrl}
              onChange={(e) => setGoodreadsUrl(e.target.value)}
              placeholder="https://www.goodreads.com/book/show/..."
              data-testid="input-catalog-goodreads-url"
            />
          </div>

          <div>
            <Label>ASIN</Label>
            <Input
              value={asin}
              onChange={(e) => setAsin(e.target.value)}
              placeholder="B0XXXXXXXXX"
              data-testid="input-catalog-asin"
            />
          </div>

          <label className="flex items-center gap-2 text-sm" data-testid="check-catalog-ku">
            <input
              type="checkbox"
              checked={isKindleUnlimited}
              onChange={(e) => setIsKindleUnlimited(e.target.checked)}
              className="rounded"
            />
            Disponible en Kindle Unlimited
          </label>

          <Separator />

          <div>
            <Label>Sinopsis</Label>
            <Textarea
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              placeholder="Breve descripción del libro para mostrar en la página 'Otras obras'..."
              rows={4}
              data-testid="input-catalog-synopsis"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={!title.trim() || !authorName.trim() || saveMutation.isPending}
              data-testid="button-save-catalog"
            >
              {saveMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Check className="w-4 h-4 mr-2" />
              )}
              {isEdit ? "Guardar" : "Añadir"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function BookCatalogPage() {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<BookCatalogEntry | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [filterPseudonym, setFilterPseudonym] = useState<string>("all");
  const [filterGenre, setFilterGenre] = useState<string>("all");

  const { data: entries = [], isLoading } = useQuery<BookCatalogEntry[]>({
    queryKey: ["/api/book-catalog"],
  });

  const { data: pseudonyms = [] } = useQuery<Pseudonym[]>({
    queryKey: ["/api/pseudonyms"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/book-catalog/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/book-catalog"] });
      toast({ title: "Libro eliminado del catálogo" });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo eliminar", variant: "destructive" });
    },
  });

  const filtered = entries.filter((e) => {
    if (filterPseudonym !== "all" && e.pseudonymId?.toString() !== filterPseudonym) return false;
    if (filterGenre !== "all" && e.genre !== filterGenre) return false;
    return true;
  });

  const genresInUse = [...new Set(entries.map((e) => e.genre).filter(Boolean))];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Library className="w-8 h-8" />
            Catálogo de Libros
          </h1>
          <p className="text-muted-foreground mt-1">
            Gestiona tu catálogo de obras publicadas para incluir en las páginas finales de tus libros.
          </p>
        </div>
        <Button onClick={() => { setEditEntry(null); setFormOpen(true); }} data-testid="button-add-catalog">
          <Plus className="w-4 h-4 mr-2" />
          Añadir Libro
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Select value={filterPseudonym} onValueChange={setFilterPseudonym}>
          <SelectTrigger className="w-[200px]" data-testid="filter-pseudonym">
            <SelectValue placeholder="Filtrar por autor..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los autores</SelectItem>
            {pseudonyms.map((p) => (
              <SelectItem key={p.id} value={p.id.toString()}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterGenre} onValueChange={setFilterGenre}>
          <SelectTrigger className="w-[200px]" data-testid="filter-genre">
            <SelectValue placeholder="Filtrar por género..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los géneros</SelectItem>
            {genresInUse.map((g) => {
              const label = GENRE_OPTIONS.find((o) => o.value === g)?.label || g;
              return (
                <SelectItem key={g} value={g!}>
                  {label}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        <Badge variant="secondary" className="h-9 px-3 flex items-center">
          {filtered.length} libro{filtered.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <BookOpen className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground text-lg mb-2">No hay libros en el catálogo</p>
            <p className="text-muted-foreground/60 text-sm">
              Añade tus libros publicados para incluirlos en las páginas finales
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((entry) => {
            const genreLabel = GENRE_OPTIONS.find((g) => g.value === entry.genre)?.label || entry.genre;
            return (
              <Card key={entry.id} data-testid={`card-catalog-${entry.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">{entry.title}</CardTitle>
                      <CardDescription className="text-sm">{entry.authorName}</CardDescription>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { setEditEntry(entry); setFormOpen(true); }}
                        data-testid={`button-edit-${entry.id}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteId(entry.id)}
                        data-testid={`button-delete-${entry.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {genreLabel && (
                      <Badge variant="outline" className="text-xs">{genreLabel}</Badge>
                    )}
                    {entry.isKindleUnlimited && (
                      <Badge variant="secondary" className="text-xs">KU</Badge>
                    )}
                    {entry.asin && (
                      <Badge variant="outline" className="text-xs font-mono">{entry.asin}</Badge>
                    )}
                  </div>
                  {entry.synopsis && (
                    <p className="text-sm text-muted-foreground line-clamp-3">{entry.synopsis}</p>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    {entry.amazonUrl && (
                      <a
                        href={entry.amazonUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                      >
                        <ShoppingCart className="w-3 h-3" /> Amazon
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {entry.goodreadsUrl && (
                      <a
                        href={entry.goodreadsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                      >
                        <Star className="w-3 h-3" /> Goodreads
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {formOpen && (
        <BookFormDialog
          open={formOpen}
          onClose={() => { setFormOpen(false); setEditEntry(null); }}
          entry={editEntry}
          pseudonyms={pseudonyms}
        />
      )}

      <ConfirmDialog
        open={deleteId !== null}
        onConfirm={() => {
          if (deleteId) deleteMutation.mutate(deleteId);
          setDeleteId(null);
        }}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title="Eliminar del catálogo"
        description="¿Seguro que quieres eliminar este libro del catálogo? Se quitará de las páginas finales de cualquier proyecto que lo use."
      />
    </div>
  );
}
