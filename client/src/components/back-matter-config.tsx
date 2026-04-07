import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2, Star, ShoppingCart, BookOpen, Check, MessageSquareQuote,
  Library, User
} from "lucide-react";
import type { BookCatalogEntry, ProjectBackMatter, Pseudonym } from "@shared/schema";

interface BackMatterConfigProps {
  projectId?: number;
  reeditProjectId?: number;
  pseudonymId?: number | null;
  projectTitle?: string;
}

export function BackMatterConfig({ projectId, reeditProjectId, pseudonymId, projectTitle }: BackMatterConfigProps) {
  const { toast } = useToast();

  const bmQueryKey = projectId
    ? ["/api/back-matter/project", projectId]
    : ["/api/back-matter/reedit", reeditProjectId];

  const { data: existingBm, isLoading: bmLoading } = useQuery<ProjectBackMatter | null>({
    queryKey: bmQueryKey,
    queryFn: async () => {
      const url = projectId
        ? `/api/back-matter/project/${projectId}`
        : `/api/back-matter/reedit/${reeditProjectId}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!(projectId || reeditProjectId),
  });

  const { data: catalog = [] } = useQuery<BookCatalogEntry[]>({
    queryKey: ["/api/book-catalog"],
  });

  const { data: pseudonyms = [] } = useQuery<Pseudonym[]>({
    queryKey: ["/api/pseudonyms"],
  });

  const [enableReview, setEnableReview] = useState(true);
  const [reviewLang, setReviewLang] = useState("es");
  const [reviewAuthor, setReviewAuthor] = useState("");
  const [reviewAmazonUrl, setReviewAmazonUrl] = useState("");
  const [reviewGoodreadsUrl, setReviewGoodreadsUrl] = useState("");
  const [enableAlsoBy, setEnableAlsoBy] = useState(true);
  const [alsoByTitle, setAlsoByTitle] = useState("");
  const [selectedBookIds, setSelectedBookIds] = useState<number[]>([]);
  const [enableAuthorPage, setEnableAuthorPage] = useState(false);
  const [authorPageBio, setAuthorPageBio] = useState("");

  useEffect(() => {
    if (existingBm) {
      setEnableReview(existingBm.enableReviewRequest);
      setReviewLang(existingBm.reviewRequestLanguage);
      setReviewAuthor(existingBm.reviewAuthorName || "");
      setReviewAmazonUrl(existingBm.reviewAmazonUrl || "");
      setReviewGoodreadsUrl(existingBm.reviewGoodreadsUrl || "");
      setEnableAlsoBy(existingBm.enableAlsoBy);
      setAlsoByTitle(existingBm.alsoByTitle || "");
      setSelectedBookIds((existingBm.selectedBookIds as number[]) || []);
      setEnableAuthorPage(existingBm.enableAuthorPage);
      setAuthorPageBio(existingBm.authorPageBio || "");
    } else if (!bmLoading) {
      if (pseudonymId) {
        const p = pseudonyms.find((x) => x.id === pseudonymId);
        if (p) {
          setReviewAuthor(p.name);
          if (p.goodreadsUrl) setReviewGoodreadsUrl(p.goodreadsUrl);
          if (p.bio) {
            setEnableAuthorPage(true);
            setAuthorPageBio(p.bio);
          }
        }
      }
    }
  }, [existingBm, bmLoading, pseudonymId, pseudonyms]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const data = {
        projectId: projectId || null,
        reeditProjectId: reeditProjectId || null,
        enableReviewRequest: enableReview,
        reviewRequestLanguage: reviewLang,
        reviewAuthorName: reviewAuthor.trim() || null,
        reviewAmazonUrl: reviewAmazonUrl.trim() || null,
        reviewGoodreadsUrl: reviewGoodreadsUrl.trim() || null,
        enableAlsoBy,
        alsoByTitle: alsoByTitle.trim() || null,
        selectedBookIds,
        enableAuthorPage,
        authorPageBio: authorPageBio.trim() || null,
      };
      const res = await apiRequest("POST", "/api/back-matter", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bmQueryKey });
      toast({ title: "Páginas finales guardadas" });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo guardar la configuración", variant: "destructive" });
    },
  });

  const toggleBook = (id: number) => {
    setSelectedBookIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const activeBooks = catalog.filter((b) => b.isActive);
  const authorBooks = pseudonymId
    ? activeBooks.filter((b) => b.pseudonymId === pseudonymId)
    : activeBooks;
  const otherBooks = pseudonymId
    ? activeBooks.filter((b) => b.pseudonymId !== pseudonymId)
    : [];

  if (bmLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="w-5 h-5" />
          Páginas Finales (Back Matter)
        </CardTitle>
        <CardDescription>
          Configura las páginas que se añadirán al final del manuscrito exportado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4 p-4 rounded-lg border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquareQuote className="w-5 h-5 text-amber-600" />
              <Label className="text-base font-medium">Solicitud de Reseña</Label>
            </div>
            <Switch
              checked={enableReview}
              onCheckedChange={setEnableReview}
              data-testid="switch-enable-review"
            />
          </div>

          {enableReview && (
            <div className="space-y-3 pl-7">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm">Idioma</Label>
                  <Select value={reviewLang} onValueChange={setReviewLang}>
                    <SelectTrigger data-testid="select-review-lang">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="es">Español</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="fr">Français</SelectItem>
                      <SelectItem value="de">Deutsch</SelectItem>
                      <SelectItem value="it">Italiano</SelectItem>
                      <SelectItem value="pt">Português</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">Nombre del autor</Label>
                  <Input
                    value={reviewAuthor}
                    onChange={(e) => setReviewAuthor(e.target.value)}
                    placeholder="Tu nombre o pseudónimo..."
                    data-testid="input-review-author"
                  />
                </div>
              </div>

              <div>
                <Label className="text-sm">Enlace Amazon del libro</Label>
                <Input
                  value={reviewAmazonUrl}
                  onChange={(e) => setReviewAmazonUrl(e.target.value)}
                  placeholder="https://www.amazon.es/dp/... (opcional, se incluirá como enlace directo)"
                  data-testid="input-review-amazon"
                />
              </div>

              <div>
                <Label className="text-sm">Enlace Goodreads del libro</Label>
                <Input
                  value={reviewGoodreadsUrl}
                  onChange={(e) => setReviewGoodreadsUrl(e.target.value)}
                  placeholder="https://www.goodreads.com/book/show/... (opcional)"
                  data-testid="input-review-goodreads"
                />
              </div>

              <p className="text-xs text-muted-foreground">
                El texto cumple las normas de Amazon: solicita una opinión sincera sin ofrecer incentivos ni dirigir la puntuación.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-4 p-4 rounded-lg border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Library className="w-5 h-5 text-blue-600" />
              <Label className="text-base font-medium">Otras Obras del Autor</Label>
            </div>
            <Switch
              checked={enableAlsoBy}
              onCheckedChange={setEnableAlsoBy}
              data-testid="switch-enable-also-by"
            />
          </div>

          {enableAlsoBy && (
            <div className="space-y-3 pl-7">
              <div>
                <Label className="text-sm">Título de la sección (opcional)</Label>
                <Input
                  value={alsoByTitle}
                  onChange={(e) => setAlsoByTitle(e.target.value)}
                  placeholder={`También de ${reviewAuthor || "este autor"}...`}
                  data-testid="input-also-by-title"
                />
              </div>

              {activeBooks.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay libros en el catálogo. Añádelos primero en la página "Catálogo de Libros".
                </p>
              ) : (
                <>
                  {authorBooks.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">
                        Del mismo autor ({authorBooks.length})
                      </p>
                      <div className="space-y-1.5">
                        {authorBooks.map((book) => (
                          <label
                            key={book.id}
                            className={`flex items-center gap-3 p-2 rounded-md border cursor-pointer transition-colors ${
                              selectedBookIds.includes(book.id)
                                ? "bg-primary/5 border-primary/30"
                                : "hover:bg-muted/50"
                            }`}
                            data-testid={`check-book-${book.id}`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedBookIds.includes(book.id)}
                              onChange={() => toggleBook(book.id)}
                              className="rounded"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium truncate block">
                                {book.title}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {book.authorName}
                                {book.genre && ` · ${book.genre}`}
                              </span>
                            </div>
                            <div className="flex gap-1">
                              {book.isKindleUnlimited && (
                                <Badge variant="secondary" className="text-xs">KU</Badge>
                              )}
                              {book.amazonUrl && (
                                <ShoppingCart className="w-3 h-3 text-muted-foreground" />
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {otherBooks.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2 mt-3">
                        Otros autores ({otherBooks.length})
                      </p>
                      <div className="space-y-1.5">
                        {otherBooks.map((book) => (
                          <label
                            key={book.id}
                            className={`flex items-center gap-3 p-2 rounded-md border cursor-pointer transition-colors ${
                              selectedBookIds.includes(book.id)
                                ? "bg-primary/5 border-primary/30"
                                : "hover:bg-muted/50"
                            }`}
                            data-testid={`check-book-${book.id}`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedBookIds.includes(book.id)}
                              onChange={() => toggleBook(book.id)}
                              className="rounded"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium truncate block">
                                {book.title}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {book.authorName}
                                {book.genre && ` · ${book.genre}`}
                              </span>
                            </div>
                            <div className="flex gap-1">
                              {book.isKindleUnlimited && (
                                <Badge variant="secondary" className="text-xs">KU</Badge>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedBookIds.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {selectedBookIds.length} libro{selectedBookIds.length !== 1 ? "s" : ""} seleccionado{selectedBookIds.length !== 1 ? "s" : ""}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4 p-4 rounded-lg border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-indigo-600" />
              <Label className="text-base font-medium">Página del Autor</Label>
            </div>
            <Switch
              checked={enableAuthorPage}
              onCheckedChange={setEnableAuthorPage}
              data-testid="switch-enable-author-page"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Añade una sección "Sobre el Autor" al final del libro con tu biografía.
          </p>

          {enableAuthorPage && (
            <div className="space-y-3 pl-2">
              <div>
                <Label className="text-sm">Biografía del autor</Label>
                <Textarea
                  value={authorPageBio}
                  onChange={(e) => setAuthorPageBio(e.target.value)}
                  placeholder="Escribe aquí la biografía que aparecerá en la página del autor..."
                  rows={5}
                  className="mt-1"
                  data-testid="textarea-author-bio"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Se usará el nombre de autor configurado arriba en la sección de Reseña.
                </p>
              </div>
            </div>
          )}
        </div>

        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="w-full"
          data-testid="button-save-back-matter"
        >
          {saveMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Check className="w-4 h-4 mr-2" />
          )}
          Guardar Configuración de Páginas Finales
        </Button>

        {existingBm && (
          <p className="text-xs text-muted-foreground text-center">
            Configuración guardada. Se aplicará automáticamente en las exportaciones DOCX y Markdown.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
