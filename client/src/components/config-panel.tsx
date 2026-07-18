import { useState, useEffect, useRef, useMemo } from "react";
import { extractNarrativeVoiceFromGuide } from "@shared/narrative-voice-extractor";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Play, RotateCcw, BookOpen, FileText, ScrollText, User, Library, BookMarked, Plus, Trash2, Zap, Repeat, Sparkles, CheckCircle2 } from "lucide-react";
import type { Pseudonym, StyleGuide, Series, ExtendedGuide } from "@shared/schema";

// [Fix202] Listas centralizadas en client/src/lib/genre-options.ts
import { GENRE_OPTIONS as genres, TONE_OPTIONS as tones } from "@/lib/genre-options";

const workTypes = [
  { value: "standalone", label: "Obra Independiente", description: "Una novela autónoma sin continuación" },
  { value: "series", label: "Serie", description: "Parte de una serie de libros" },
  { value: "trilogy", label: "Trilogía", description: "Parte de una trilogía de 3 libros" },
  { value: "bookbox", label: "Bookbox", description: "Serie completa en un solo manuscrito (hasta 350 capítulos, múltiples libros)" },
];

const bookboxBookSchema = z.object({
  bookNumber: z.number(),
  title: z.string(),
  startChapter: z.number(),
  endChapter: z.number(),
  hasPrologue: z.boolean().default(false),
  hasEpilogue: z.boolean().default(false),
});

const bookboxStructureSchema = z.object({
  books: z.array(bookboxBookSchema),
}).nullable().optional();

const configSchema = z.object({
  title: z.string().min(1, "El título es requerido").max(100),
  premise: z.string().min(10, "Describe la idea de tu novela (mínimo 10 caracteres)").max(2000).or(z.string().length(0)),
  genre: z.string().min(1, "Selecciona un género"),
  tone: z.string().min(1, "Selecciona un tono"),
  chapterCount: z.number().min(1).max(350), // Increased for bookbox support
  // [Fix90] Rango opcional. Si ambos están a null, comportamiento clásico exacto.
  minChapterCount: z.number().min(1).max(350).nullable().optional(),
  maxChapterCount: z.number().min(1).max(350).nullable().optional(),
  hasPrologue: z.boolean().default(false),
  hasEpilogue: z.boolean().default(false),
  hasAuthorNote: z.boolean().default(false),
  autoBetaLoop: z.boolean().default(false),
  autoBetaLoopMaxIterations: z.number().min(1).max(10).default(3),
  deferPolishToCure: z.boolean().default(false),
  pseudonymId: z.number().nullable().optional(),
  styleGuideId: z.number().nullable().optional(),
  extendedGuideId: z.number().nullable().optional(),
  workType: z.string().default("standalone"),
  seriesId: z.number().nullable().optional(),
  seriesOrder: z.number().nullable().optional(),
  minWordCount: z.number().min(0).nullable().optional(),
  minWordsPerChapter: z.number().min(500).max(10000).default(1500),
  maxWordsPerChapter: z.number().min(500).max(15000).default(3500),
  kindleUnlimitedOptimized: z.boolean().default(false),
  bookboxStructure: bookboxStructureSchema,
  // [Fix108] Voz narrativa canónica fijada explícitamente por el usuario.
  // Si se deja en null se cae al comportamiento anterior (regex sobre guía).
  narrativeVoice: z.object({
    pov: z.enum(["first", "third", "dual_first", "dual_third", "second"]),
    tense: z.enum(["present", "past"]),
    narratorType: z.enum(["omnisciente", "limitado", "testigo"]).optional(),
  }).nullable().optional(),
});

type ConfigFormData = z.infer<typeof configSchema>;

interface ConfigPanelProps {
  onSubmit: (data: ConfigFormData) => void;
  onReset?: () => void;
  isLoading?: boolean;
  defaultValues?: Partial<ConfigFormData>;
  isEditing?: boolean;
}

export function ConfigPanel({ onSubmit, onReset, isLoading, defaultValues, isEditing }: ConfigPanelProps) {
  const form = useForm<ConfigFormData>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      title: defaultValues?.title || "",
      premise: (defaultValues as any)?.premise || "",
      genre: defaultValues?.genre || "fantasy",
      tone: defaultValues?.tone || "dramatic",
      chapterCount: defaultValues?.chapterCount || 10,
      minChapterCount: (defaultValues as any)?.minChapterCount ?? null,
      maxChapterCount: (defaultValues as any)?.maxChapterCount ?? null,
      hasPrologue: defaultValues?.hasPrologue || false,
      hasEpilogue: defaultValues?.hasEpilogue || false,
      hasAuthorNote: defaultValues?.hasAuthorNote || false,
      autoBetaLoop: (defaultValues as any)?.autoBetaLoop || false,
      autoBetaLoopMaxIterations: (defaultValues as any)?.autoBetaLoopMaxIterations || 3,
      deferPolishToCure: (defaultValues as any)?.deferPolishToCure || false,
      pseudonymId: defaultValues?.pseudonymId || null,
      styleGuideId: defaultValues?.styleGuideId || null,
      extendedGuideId: (defaultValues as any)?.extendedGuideId || null,
      workType: (defaultValues as any)?.workType || "standalone",
      seriesId: (defaultValues as any)?.seriesId || null,
      seriesOrder: (defaultValues as any)?.seriesOrder || null,
      minWordCount: (defaultValues as any)?.minWordCount || null,
      minWordsPerChapter: (defaultValues as any)?.minWordsPerChapter || 1500,
      maxWordsPerChapter: (defaultValues as any)?.maxWordsPerChapter || 3500,
      kindleUnlimitedOptimized: (defaultValues as any)?.kindleUnlimitedOptimized || false,
      bookboxStructure: (defaultValues as any)?.bookboxStructure || null,
      narrativeVoice: (defaultValues as any)?.narrativeVoice || null,
    },
  });

  const chapterCount = form.watch("chapterCount");
  const minWordCount = form.watch("minWordCount");
  const hasPrologue = form.watch("hasPrologue");
  const hasEpilogue = form.watch("hasEpilogue");
  const hasAuthorNote = form.watch("hasAuthorNote");
  const autoBetaLoop = form.watch("autoBetaLoop");
  const selectedPseudonymId = form.watch("pseudonymId");
  const selectedWorkType = form.watch("workType");
  const selectedSeriesId = form.watch("seriesId");
  const bookboxStructure = form.watch("bookboxStructure");

  const isBookbox = selectedWorkType === "bookbox";

  const [bookboxBooks, setBookboxBooks] = useState<Array<{
    bookNumber: number;
    title: string;
    startChapter: number;
    endChapter: number;
    hasPrologue: boolean;
    hasEpilogue: boolean;
  }>>(bookboxStructure?.books || [{ bookNumber: 1, title: "Libro 1", startChapter: 1, endChapter: 50, hasPrologue: true, hasEpilogue: false }]);

  const addBookboxBook = () => {
    const lastBook = bookboxBooks[bookboxBooks.length - 1];
    const newBook = {
      bookNumber: bookboxBooks.length + 1,
      title: `Libro ${bookboxBooks.length + 1}`,
      startChapter: lastBook ? lastBook.endChapter + 1 : 1,
      endChapter: lastBook ? lastBook.endChapter + 50 : 50,
      hasPrologue: false,
      hasEpilogue: false,
    };
    const newBooks = [...bookboxBooks, newBook];
    setBookboxBooks(newBooks);
    form.setValue("bookboxStructure", { books: newBooks });
    const totalChapters = newBook.endChapter;
    if (totalChapters > chapterCount) {
      form.setValue("chapterCount", totalChapters);
    }
  };

  const removeBookboxBook = (index: number) => {
    if (bookboxBooks.length <= 1) return;
    const newBooks = bookboxBooks.filter((_, i) => i !== index).map((book, i) => ({
      ...book,
      bookNumber: i + 1,
    }));
    setBookboxBooks(newBooks);
    form.setValue("bookboxStructure", { books: newBooks });
  };

  const updateBookboxBook = (index: number, field: string, value: any) => {
    const newBooks = [...bookboxBooks];
    (newBooks[index] as any)[field] = value;
    setBookboxBooks(newBooks);
    form.setValue("bookboxStructure", { books: newBooks });
    const maxEnd = Math.max(...newBooks.map(b => b.endChapter));
    if (maxEnd > chapterCount) {
      form.setValue("chapterCount", maxEnd);
    }
  };

  const totalSections = chapterCount + (hasPrologue ? 1 : 0) + (hasEpilogue ? 1 : 0) + (hasAuthorNote ? 1 : 0);

  const { data: pseudonyms = [] } = useQuery<Pseudonym[]>({
    queryKey: ["/api/pseudonyms"],
  });

  const { data: styleGuides = [] } = useQuery<StyleGuide[]>({
    queryKey: ["/api/pseudonyms", selectedPseudonymId, "style-guides"],
    enabled: !!selectedPseudonymId && selectedPseudonymId > 0,
  });

  const { data: allSeries = [] } = useQuery<Series[]>({
    queryKey: ["/api/series"],
  });

  const { data: extendedGuides = [] } = useQuery<ExtendedGuide[]>({
    queryKey: ["/api/extended-guides"],
  });

  const selectedExtendedGuideId = form.watch("extendedGuideId");
  const selectedStyleGuideId = form.watch("styleGuideId");
  const isSerialized = selectedWorkType === "series" || selectedWorkType === "trilogy";

  // [Fix114] Auto-extracción de voz narrativa desde la guía seleccionada.
  // Cuando el usuario elige una guía de estilo / guía extendida que contenga
  // POV + tiempo verbal, los selectores se rellenan solos (la guía es la
  // fuente de verdad). Si la guía no lo dice, los campos quedan vacíos para
  // que el usuario los fije a mano. Prioridad: guía extendida > guía de
  // estilo (la extendida es más prescriptiva).
  //
  // Defensa anti-overwrite (post-review): en el primer montaje del form
  // NO autorellenamos si `defaultValues.narrativeVoice` ya venía seteado
  // (proyecto en edición). Solo se autorellena en cambios explícitos del
  // usuario tras el mount, o cuando el campo está vacío.
  //
  // Defensa anti-dedup-prematuro (post-review): solo marcamos el sourceKey
  // como "procesado" cuando hemos tenido contenido real que evaluar. Si las
  // queries de styleGuides/extendedGuides aún no han devuelto, esperamos a
  // que carguen sin perder el evento.
  const lastAutoFilledFromRef = useRef<string>("");
  const skipInitialAutofillRef = useRef<boolean>(
    !!(defaultValues as any)?.narrativeVoice,
  );
  useEffect(() => {
    const styleGuide = styleGuides.find((g) => g.id === selectedStyleGuideId);
    const extendedGuide = extendedGuides.find((g) => g.id === selectedExtendedGuideId);
    const sourceKey = `e:${selectedExtendedGuideId ?? "_"}|s:${selectedStyleGuideId ?? "_"}`;
    if (sourceKey === lastAutoFilledFromRef.current) return;

    // Si el usuario tiene una guía seleccionada pero la query aún no ha
    // devuelto su contenido, NO marcamos el sourceKey como procesado: el
    // effect se re-ejecutará cuando los datos lleguen.
    const styleGuidePending =
      !!selectedStyleGuideId && selectedStyleGuideId > 0 && !styleGuide;
    const extendedGuidePending =
      !!selectedExtendedGuideId && selectedExtendedGuideId > 0 && !extendedGuide;
    if (styleGuidePending || extendedGuidePending) return;

    // Si en el mount inicial ya había una voz canónica fijada (proyecto en
    // edición), respetamos la elección previa y nos saltamos UN solo ciclo
    // de autorelleno. A partir del siguiente cambio explícito de guía, sí
    // autorellenamos como en un proyecto nuevo.
    if (skipInitialAutofillRef.current) {
      skipInitialAutofillRef.current = false;
      lastAutoFilledFromRef.current = sourceKey;
      return;
    }

    // La guía extendida es más prescriptiva: si ambas están presentes, gana.
    const candidate = extendedGuide?.content || styleGuide?.content || "";
    lastAutoFilledFromRef.current = sourceKey;
    if (!candidate.trim()) return;

    const extracted = extractNarrativeVoiceFromGuide(candidate);
    if (!extracted.detected || !extracted.pov || !extracted.tense) return;

    form.setValue(
      "narrativeVoice",
      {
        pov: extracted.pov as any,
        tense: extracted.tense,
        narratorType: extracted.narratorType,
      },
      { shouldDirty: true, shouldValidate: false },
    );
  }, [selectedStyleGuideId, selectedExtendedGuideId, styleGuides, extendedGuides, form, defaultValues]);

  // [Fix126] ¿La guía seleccionada aporta una voz canónica COMPLETA (POV +
  // tiempo verbal)? Si la aporta, el panel de voz es solo-lectura (la guía es
  // la fuente de verdad, intención de Fix122). Si NO la aporta (guías antiguas
  // anteriores a Fix125 que describen la voz solo en prosa, o ninguna guía),
  // el panel pasa a editable para que el usuario fije la voz a mano y el
  // pre-flight (Fix108) no aborte la generación.
  const guideProvidesVoice = useMemo(() => {
    const styleGuide = styleGuides.find((g) => g.id === selectedStyleGuideId);
    const extendedGuide = extendedGuides.find(
      (g) => g.id === selectedExtendedGuideId,
    );
    const candidate = extendedGuide?.content || styleGuide?.content || "";
    if (!candidate.trim()) return false;
    const ex = extractNarrativeVoiceFromGuide(candidate);
    return !!(ex.detected && ex.pov && ex.tense);
  }, [selectedStyleGuideId, selectedExtendedGuideId, styleGuides, extendedGuides]);

  return (
    <Form {...form}>
      <form 
        onSubmit={form.handleSubmit(onSubmit)} 
        className="space-y-6"
        data-testid="config-form"
      >
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Título del Proyecto</FormLabel>
              <FormControl>
                <Input 
                  placeholder="La última esperanza..." 
                  {...field}
                  data-testid="input-project-title"
                />
              </FormControl>
              <FormDescription>
                El título de tu novela o manuscrito
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="premise"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Idea / Premisa de la Novela</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Describe la idea central de tu novela: ¿De qué trata? ¿Quién es el protagonista? ¿Cuál es el conflicto principal? ¿En qué época y lugar transcurre?"
                  className="min-h-[120px]"
                  {...field}
                  data-testid="input-project-premise"
                />
              </FormControl>
              <FormDescription>
                {selectedExtendedGuideId 
                  ? "La guía extendida seleccionada proporcionará la premisa completa. Puedes dejar este campo vacío."
                  : "Esta premisa guiará a los agentes para diseñar la trama, personajes y mundo de tu novela"}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="extendedGuideId"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Guía Extendida (Opcional)
              </FormLabel>
              <Select
                onValueChange={(val) => field.onChange(val === "none" ? null : parseInt(val))}
                value={field.value?.toString() || "none"}
              >
                <FormControl>
                  <SelectTrigger data-testid="select-extended-guide">
                    <SelectValue placeholder="Sin guía extendida" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">Sin guía extendida</SelectItem>
                  {extendedGuides.map((guide) => (
                    <SelectItem key={guide.id} value={guide.id.toString()}>
                      <div className="flex flex-col">
                        <span>{guide.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {guide.wordCount?.toLocaleString()} palabras
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                Sube una guía de escritura extendida en Word que sustituya o complemente la premisa
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="genre"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Género</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger data-testid="select-genre">
                    <SelectValue placeholder="Selecciona un género" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {genres.map((genre) => (
                    <SelectItem key={genre.value} value={genre.value}>
                      <div className="flex flex-col">
                        <span>{genre.label}</span>
                        <span className="text-xs text-muted-foreground">{genre.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="tone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tono Narrativo</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger data-testid="select-tone">
                    <SelectValue placeholder="Selecciona un tono" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {tones.map((tone) => (
                    <SelectItem key={tone.value} value={tone.value}>
                      <div className="flex flex-col">
                        <span>{tone.label}</span>
                        <span className="text-xs text-muted-foreground">{tone.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-4 pt-2 border-t">
          <div className="flex items-center gap-2 pt-4">
            <Library className="h-4 w-4 text-muted-foreground" />
            <FormLabel className="text-base mb-0">Tipo de Obra</FormLabel>
          </div>
          
          <FormField
            control={form.control}
            name="workType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Clasificación</FormLabel>
                <Select 
                  onValueChange={(value) => {
                    field.onChange(value);
                    if (value === "standalone") {
                      form.setValue("seriesId", null);
                      form.setValue("seriesOrder", null);
                    }
                  }} 
                  value={field.value || "standalone"}
                >
                  <FormControl>
                    <SelectTrigger data-testid="select-work-type">
                      <SelectValue placeholder="Selecciona tipo de obra" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {workTypes.map((wt) => (
                      <SelectItem key={wt.value} value={wt.value}>
                        <div className="flex flex-col">
                          <span>{wt.label}</span>
                          <span className="text-xs text-muted-foreground">{wt.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Define si esta novela es parte de una serie o trilogía
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {isSerialized && (
            <>
              <FormField
                control={form.control}
                name="seriesId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Serie / Saga</FormLabel>
                    <Select 
                      onValueChange={(value) => field.onChange(value === "none" ? null : parseInt(value))} 
                      value={field.value?.toString() || "none"}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-series">
                          <SelectValue placeholder="Selecciona o crea una serie" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">Ninguna (crear nueva después)</SelectItem>
                        {allSeries.map((s) => (
                          <SelectItem key={s.id} value={s.id.toString()}>
                            <div className="flex items-center gap-2">
                              <BookMarked className="h-3 w-3" />
                              <span>{s.title}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Agrupa novelas en una serie para mantener continuidad narrativa
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="seriesOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Orden en la Serie</FormLabel>
                    <FormControl>
                      <Input 
                        type="number"
                        min={1}
                        placeholder="1, 2, 3..."
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                        data-testid="input-series-order"
                      />
                    </FormControl>
                    <FormDescription>
                      Posición de esta novela dentro de la serie (1 = primera, 2 = segunda, etc.)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}

          {isBookbox && (
            <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-between">
                <FormLabel className="text-sm font-medium">Estructura de Libros</FormLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addBookboxBook}
                  data-testid="button-add-bookbox-book"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Añadir Libro
                </Button>
              </div>
              <FormDescription className="text-xs">
                Define los libros internos del bookbox. Cada libro puede tener su propio prólogo y epílogo.
              </FormDescription>

              <div className="space-y-3">
                {bookboxBooks.map((book, index) => (
                  <div key={index} className="p-3 bg-background rounded border space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Input
                        value={book.title}
                        onChange={(e) => updateBookboxBook(index, "title", e.target.value)}
                        placeholder={`Libro ${index + 1}`}
                        className="flex-1"
                        data-testid={`input-bookbox-title-${index}`}
                      />
                      {bookboxBooks.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeBookboxBook(index)}
                          data-testid={`button-remove-bookbox-${index}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <FormLabel className="text-xs">Capítulo Inicial</FormLabel>
                        <Input
                          type="number"
                          min={1}
                          value={book.startChapter}
                          onChange={(e) => updateBookboxBook(index, "startChapter", parseInt(e.target.value) || 1)}
                          data-testid={`input-bookbox-start-${index}`}
                        />
                      </div>
                      <div>
                        <FormLabel className="text-xs">Capítulo Final</FormLabel>
                        <Input
                          type="number"
                          min={book.startChapter}
                          value={book.endChapter}
                          onChange={(e) => updateBookboxBook(index, "endChapter", parseInt(e.target.value) || book.startChapter)}
                          data-testid={`input-bookbox-end-${index}`}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={book.hasPrologue}
                          onCheckedChange={(checked) => updateBookboxBook(index, "hasPrologue", !!checked)}
                          id={`bookbox-prologue-${index}`}
                          data-testid={`checkbox-bookbox-prologue-${index}`}
                        />
                        <label htmlFor={`bookbox-prologue-${index}`} className="text-xs">Prólogo</label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={book.hasEpilogue}
                          onCheckedChange={(checked) => updateBookboxBook(index, "hasEpilogue", !!checked)}
                          id={`bookbox-epilogue-${index}`}
                          data-testid={`checkbox-bookbox-epilogue-${index}`}
                        />
                        <label htmlFor={`bookbox-epilogue-${index}`} className="text-xs">Epílogo</label>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {book.endChapter - book.startChapter + 1} capítulos
                      {book.hasPrologue && " + prólogo"}
                      {book.hasEpilogue && " + epílogo"}
                    </div>
                  </div>
                ))}
              </div>

              <div className="text-xs text-muted-foreground pt-2 border-t">
                Total: {bookboxBooks.reduce((sum, b) => sum + (b.endChapter - b.startChapter + 1) + (b.hasPrologue ? 1 : 0) + (b.hasEpilogue ? 1 : 0), 0)} secciones en {bookboxBooks.length} libro{bookboxBooks.length > 1 ? "s" : ""}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4 pt-2 border-t">
          <div className="flex items-center gap-2 pt-4">
            <User className="h-4 w-4 text-muted-foreground" />
            <FormLabel className="text-base mb-0">Identidad del Autor</FormLabel>
          </div>
          
          <FormField
            control={form.control}
            name="pseudonymId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Pseudónimo (Opcional)</FormLabel>
                <Select 
                  onValueChange={(value) => {
                    field.onChange(value === "none" ? null : parseInt(value));
                    form.setValue("styleGuideId", null);
                  }} 
                  value={field.value?.toString() || "none"}
                >
                  <FormControl>
                    <SelectTrigger data-testid="select-pseudonym">
                      <SelectValue placeholder="Selecciona un pseudónimo" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">Sin pseudónimo</SelectItem>
                    {pseudonyms.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Asocia una identidad de autor al proyecto
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {selectedPseudonymId && styleGuides.length > 0 && (
            <FormField
              control={form.control}
              name="styleGuideId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Guía de Estilo</FormLabel>
                  <Select 
                    onValueChange={(value) => field.onChange(value === "none" ? null : parseInt(value))} 
                    value={field.value?.toString() || "none"}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-style-guide">
                        <SelectValue placeholder="Selecciona una guía de estilo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">Sin guía específica</SelectItem>
                      {styleGuides.map((sg) => (
                        <SelectItem key={sg.id} value={sg.id.toString()}>
                          {sg.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    La guía de estilo define la voz y estilo narrativo
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        <FormField
          control={form.control}
          name="chapterCount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Número de Capítulos: {chapterCount}</FormLabel>
              <FormControl>
                <Slider
                  min={1}
                  max={isBookbox ? 350 : 100}
                  step={1}
                  value={[field.value]}
                  onValueChange={(value) => field.onChange(value[0])}
                  className="py-4"
                  data-testid="slider-chapter-count"
                />
              </FormControl>
              <FormDescription>
                Entre 1 y {isBookbox ? 350 : 100} capítulos (aproximadamente {(chapterCount * 2500).toLocaleString()} - {(chapterCount * 3500).toLocaleString()} palabras)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* [Fix90] Rango opcional para que el Arquitecto decida el número
            final según los hilos que aguante la premisa. Si quedan vacíos,
            se usa el número exacto del slider de arriba. */}
        {!isBookbox && (
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-3">
            <div className="text-sm font-medium">Rango flexible (opcional)</div>
            <p className="text-xs text-muted-foreground">
              Si rellenas mín. y máx., el Arquitecto decide el número final
              de capítulos dentro de ese rango tras auditar la densidad de
              hilos argumentales. Déjalo vacío para usar el número exacto del
              slider de arriba.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="minChapterCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mínimo</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        placeholder="Ej: 20"
                        value={field.value ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          field.onChange(v ? parseInt(v) : null);
                        }}
                        data-testid="input-min-chapter-count"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="maxChapterCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Máximo</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        placeholder="Ej: 35"
                        value={field.value ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          field.onChange(v ? parseInt(v) : null);
                        }}
                        data-testid="input-max-chapter-count"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        )}

        <FormField
          control={form.control}
          name="minWordCount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Palabras Mínimas (objetivo)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="Ej: 80000"
                  value={field.value ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    field.onChange(val ? parseInt(val) : null);
                  }}
                  data-testid="input-min-word-count"
                />
              </FormControl>
              <FormDescription>
                {minWordCount && chapterCount > 0 
                  ? `Aproximadamente ${Math.round(minWordCount / chapterCount).toLocaleString()} palabras por capítulo`
                  : "Opcional: Define el mínimo de palabras para la novela completa"}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="minWordsPerChapter"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Mínimo palabras/capítulo</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={500}
                    max={10000}
                    value={field.value}
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 1500)}
                    data-testid="input-min-words-per-chapter"
                  />
                </FormControl>
                <FormDescription className="text-xs">
                  Extensión mínima por capítulo
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="maxWordsPerChapter"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Máximo palabras/capítulo</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={500}
                    max={15000}
                    value={field.value}
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 3500)}
                    data-testid="input-max-words-per-chapter"
                  />
                </FormControl>
                <FormDescription className="text-xs">
                  Extensión máxima por capítulo
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="kindleUnlimitedOptimized"
          render={({ field }) => (
            <FormItem className="flex items-center gap-3 space-y-0 rounded-md border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 p-3">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  data-testid="checkbox-kindle-unlimited"
                />
              </FormControl>
              <div className="flex items-center gap-2 flex-1">
                <Zap className="h-4 w-4 text-orange-500" />
                <div>
                  <FormLabel className="font-medium cursor-pointer">Optimizar para Kindle Unlimited</FormLabel>
                  <FormDescription className="text-xs">
                    Capítulos cortos con cliffhangers, ritmo rápido y técnicas page-turner para maximizar páginas leídas
                  </FormDescription>
                </div>
              </div>
            </FormItem>
          )}
        />

        {/* [Fix122] Voz narrativa canónica MOSTRADA SOLO EN LECTURA. La fuente
            de verdad es la guía de estilo / extendida: el useEffect anterior
            extrae POV + tiempo verbal + tipo de narrador automáticamente al
            seleccionar guía. Aquí solo se muestra lo detectado, sin permitir
            edición manual (para evitar que un valor en la UI contradiga la
            guía y produzca capítulos con mezcla presente/pretérito). */}
        <FormField
          control={form.control}
          name="narrativeVoice"
          render={({ field }) => {
            const v = (field.value as any) || {};
            const POV_LABELS: Record<string, string> = {
              first: "Primera persona",
              third: "Tercera persona",
              dual_first: "Dual (primera, alternando)",
              dual_third: "Dual (tercera, alternando)",
              second: "Segunda persona",
            };
            const TENSE_LABELS: Record<string, string> = {
              present: "Presente",
              past: "Pretérito (pasado)",
            };
            const NARRATOR_LABELS: Record<string, string> = {
              omnisciente: "Omnisciente",
              limitado: "Limitado",
              testigo: "Testigo",
            };
            const povLabel = v.pov ? POV_LABELS[v.pov] || v.pov : null;
            const tenseLabel = v.tense ? TENSE_LABELS[v.tense] || v.tense : null;
            const narratorLabel = v.narratorType ? NARRATOR_LABELS[v.narratorType] || v.narratorType : null;

            // [Fix126] Merge parcial-o-completo en el field. Si POV+tiempo
            // quedan ambos fijados, el objeto cumple narrativeVoiceConfigSchema;
            // si falta uno, el zodResolver bloquea el submit con FormMessage.
            const setPart = (patch: Record<string, string | undefined>) => {
              const base = (field.value as any) || {};
              const merged: Record<string, any> = { ...base, ...patch };
              if (!merged.narratorType) delete merged.narratorType;
              field.onChange(merged);
            };

            return (
              <div className="space-y-3 pt-2" data-testid="narrative-voice-display">
                <FormLabel className="text-base">Voz narrativa canónica</FormLabel>

                {guideProvidesVoice ? (
                  <>
                    <FormDescription className="text-xs">
                      Se extrae automáticamente de la guía seleccionada y es la fuente de verdad para el Arquitecto, el Narrador y el Revisor Final. Para cambiarla, edita la guía (bloque "VOZ NARRATIVA CANÓNICA" con POV y tiempo verbal explícitos).
                    </FormDescription>
                    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-xs font-medium text-muted-foreground w-32">Persona narrativa:</span>
                        <span className="text-sm font-semibold" data-testid="text-narrative-pov">{povLabel || <span className="text-muted-foreground italic">detectando…</span>}</span>
                      </div>
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-xs font-medium text-muted-foreground w-32">Tiempo verbal:</span>
                        <span className="text-sm font-semibold" data-testid="text-narrative-tense">{tenseLabel || <span className="text-muted-foreground italic">detectando…</span>}</span>
                      </div>
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-xs font-medium text-muted-foreground w-32">Tipo de narrador:</span>
                        <span className="text-sm" data-testid="text-narrator-type">{narratorLabel || <span className="text-muted-foreground italic">no especificado en la guía</span>}</span>
                      </div>
                      <p className="text-xs text-muted-foreground pt-1">Detectado desde la guía seleccionada.</p>
                    </div>
                  </>
                ) : (
                  <>
                    <FormDescription className="text-xs">
                      La guía seleccionada no especifica la voz narrativa de forma explícita. Fíjala aquí a mano: el Arquitecto, el Narrador y el Revisor Final la usarán como canon. (Alternativa: edita la guía y añade un bloque final "## VOZ NARRATIVA CANÓNICA".)
                    </FormDescription>
                    <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 space-y-3" data-testid="narrative-voice-manual">
                      <div className="space-y-1.5">
                        <span className="text-xs font-medium">Persona narrativa (POV)</span>
                        <Select value={v.pov || ""} onValueChange={(val) => setPart({ pov: val })}>
                          <SelectTrigger data-testid="select-narrative-pov">
                            <SelectValue placeholder="Selecciona POV" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="first">Primera persona</SelectItem>
                            <SelectItem value="third">Tercera persona</SelectItem>
                            <SelectItem value="dual_first">Dual (primera, alternando)</SelectItem>
                            <SelectItem value="dual_third">Dual (tercera, alternando)</SelectItem>
                            <SelectItem value="second">Segunda persona</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <span className="text-xs font-medium">Tiempo verbal</span>
                        <Select value={v.tense || ""} onValueChange={(val) => setPart({ tense: val })}>
                          <SelectTrigger data-testid="select-narrative-tense">
                            <SelectValue placeholder="Selecciona tiempo verbal" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="present">Presente</SelectItem>
                            <SelectItem value="past">Pretérito (pasado)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <span className="text-xs font-medium">Tipo de narrador (opcional)</span>
                        <Select value={v.narratorType || "_none"} onValueChange={(val) => setPart({ narratorType: val === "_none" ? undefined : val })}>
                          <SelectTrigger data-testid="select-narrator-type">
                            <SelectValue placeholder="Sin especificar" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">Sin especificar</SelectItem>
                            <SelectItem value="omnisciente">Omnisciente</SelectItem>
                            <SelectItem value="limitado">Limitado</SelectItem>
                            <SelectItem value="testigo">Testigo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {(v.pov || v.tense) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => field.onChange(null)}
                          data-testid="button-clear-narrative-voice"
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Limpiar
                        </Button>
                      )}
                      <FormMessage />
                    </div>
                  </>
                )}
              </div>
            );
          }}
        />

        <div className="space-y-4 pt-2">
          <FormLabel className="text-base">Secciones Adicionales</FormLabel>
          
          <FormField
            control={form.control}
            name="hasPrologue"
            render={({ field }) => (
              <FormItem className="flex items-center gap-3 space-y-0 rounded-md border p-3">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    data-testid="checkbox-prologue"
                  />
                </FormControl>
                <div className="flex items-center gap-2 flex-1">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <FormLabel className="font-medium cursor-pointer">Prólogo</FormLabel>
                    <FormDescription className="text-xs">
                      Introducción previa al primer capítulo
                    </FormDescription>
                  </div>
                </div>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="hasEpilogue"
            render={({ field }) => (
              <FormItem className="flex items-center gap-3 space-y-0 rounded-md border p-3">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    data-testid="checkbox-epilogue"
                  />
                </FormControl>
                <div className="flex items-center gap-2 flex-1">
                  <ScrollText className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <FormLabel className="font-medium cursor-pointer">Epílogo</FormLabel>
                    <FormDescription className="text-xs">
                      Cierre posterior al último capítulo
                    </FormDescription>
                  </div>
                </div>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="hasAuthorNote"
            render={({ field }) => (
              <FormItem className="flex items-center gap-3 space-y-0 rounded-md border p-3">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    data-testid="checkbox-author-note"
                  />
                </FormControl>
                <div className="flex items-center gap-2 flex-1">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <FormLabel className="font-medium cursor-pointer">Nota del Autor</FormLabel>
                    <FormDescription className="text-xs">
                      Reflexiones del autor sobre la obra
                    </FormDescription>
                  </div>
                </div>
              </FormItem>
            )}
          />
        </div>

        <div className="bg-muted/50 rounded-md p-3 text-sm">
          <span className="font-medium">Total de secciones:</span>{" "}
          <span className="text-muted-foreground">
            {totalSections} ({hasPrologue ? "Prólogo + " : ""}{chapterCount} capítulos{hasEpilogue ? " + Epílogo" : ""}{hasAuthorNote ? " + Nota del Autor" : ""})
          </span>
        </div>

        {/* [Fix84] Indicador informativo: el loop nuevo Holístico+Beta (Fix77/Fix81)
            corre por defecto sin necesidad de ningún flag (ver orquestador
            L11195-11198). Esta casilla queda marcada y deshabilitada — es solo
            visibilidad, no toca el backend. La casilla "Auto-loop con Lector Beta"
            de abajo activa el camino LEGACY (Fix47) y, si se marca, sustituye
            al loop nuevo (mutua exclusión). */}
        <div
          className="flex items-start gap-3 rounded-md border border-primary/30 bg-primary/5 p-3"
          data-testid="indicator-auto-holistic-beta-loop"
        >
          <Checkbox
            checked
            disabled
            aria-label="Auto-revisión Holístico+Beta activada por defecto"
            data-testid="checkbox-auto-holistic-beta-loop"
            className="mt-0.5 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
          />
          <div className="flex items-start gap-2 flex-1">
            <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Auto-revisión Holístico + Beta</span>
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold text-primary">
                  <CheckCircle2 className="h-3 w-3" /> Activa por defecto
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-snug">
                Al terminar la novela se ejecuta automáticamente un bucle iterativo (hasta 8 iteraciones) que combina al Lector Holístico y al Lector Beta. El manuscrito se reescribe hasta alcanzar el objetivo dual <span className="font-mono">Beta ≥ 9 AND Holístico ≥ 8</span>, con instantáneas para no perder versiones mejores. Tras aprobar se aplica la corrección ortotipográfica final.
              </p>
            </div>
          </div>
        </div>

        <FormField
          control={form.control}
          name="autoBetaLoop"
          render={({ field }) => (
            <FormItem className="flex flex-col gap-3 space-y-0 rounded-md border p-3">
              <div className="flex items-center gap-3">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    data-testid="checkbox-auto-beta-loop"
                  />
                </FormControl>
                <div className="flex items-center gap-2 flex-1">
                  <Repeat className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <FormLabel className="font-medium cursor-pointer">Auto-loop legacy (solo Lector Beta)</FormLabel>
                    <FormDescription className="text-xs">
                      Alternativa al ciclo Holístico+Beta de arriba: si marcas esta opción, el Beta lee → aplica correcciones → re-lee, en bucle, hasta que apruebe (≤3 obs, ninguna alta) o se alcance el máximo de iteraciones. <strong>Sustituye al loop por defecto</strong> (no se ejecutan ambos). Consume tokens.
                    </FormDescription>
                  </div>
                </div>
              </div>
              {autoBetaLoop && (
                <FormField
                  control={form.control}
                  name="autoBetaLoopMaxIterations"
                  render={({ field: iterField }) => (
                    <FormItem className="pl-7">
                      <div className="flex items-center justify-between">
                        <FormLabel className="text-xs text-muted-foreground">Máximo de iteraciones</FormLabel>
                        <span className="text-xs font-mono" data-testid="text-auto-beta-loop-iterations">{iterField.value}</span>
                      </div>
                      <FormControl>
                        <Slider
                          min={1}
                          max={10}
                          step={1}
                          value={[iterField.value]}
                          onValueChange={(v) => iterField.onChange(v[0])}
                          data-testid="slider-auto-beta-loop-iterations"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              )}
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="deferPolishToCure"
          render={({ field }) => (
            <FormItem className="flex flex-col gap-3 space-y-0 rounded-md border p-3">
              <div className="flex items-center gap-3">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    data-testid="checkbox-defer-polish-to-cure"
                  />
                </FormControl>
                <div className="flex items-center gap-2 flex-1">
                  <Repeat className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <FormLabel className="font-medium cursor-pointer">Aplazar el pulido a la Cura de Serie</FormLabel>
                    <FormDescription className="text-xs">
                      Al terminar la novela NO se lanza el pulido automático (Holístico+Beta) ni la ortotipográfica: quedan para el paso de pulido de la <strong>Cura de Serie</strong>, que los ejecuta con la saga completa como contexto. Útil en series: evita pagar dos pulidos por volumen. Si nunca lanzas la Cura, puedes forzar el pulido manualmente desde el dashboard.
                    </FormDescription>
                  </div>
                </div>
              </div>
            </FormItem>
          )}
        />

        <div className="flex gap-3 pt-4">
          <Button 
            type="submit" 
            className="flex-1"
            disabled={isLoading}
            data-testid="button-start-project"
          >
            <Play className="h-4 w-4 mr-2" />
            {isLoading ? (isEditing ? "Guardando..." : "Creando...") : (isEditing ? "Guardar Cambios" : "Crear Proyecto")}
          </Button>
          {onReset && (
            <Button 
              type="button" 
              variant="outline"
              onClick={onReset}
              disabled={isLoading}
              data-testid="button-reset-config"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}

export { configSchema };
export type { ConfigFormData };
