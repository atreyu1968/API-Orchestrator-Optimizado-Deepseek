// [Fix202] Lista centralizada de generos y tonos (antes duplicada en 4 archivos).
// Ampliada para cubrir seudonimos cuyos nichos no estaban reflejados.

export interface GenreOption {
  value: string;
  label: string;
  description: string;
}

export const GENRE_OPTIONS: GenreOption[] = [
  { value: "fantasy", label: "Fantasía", description: "Mundos mágicos y criaturas sobrenaturales" },
  { value: "dark_fantasy", label: "Fantasía Oscura", description: "Fantasía con atmósfera sombría y moral ambigua" },
  { value: "urban_fantasy", label: "Fantasía Urbana", description: "Magia oculta en el mundo contemporáneo" },
  { value: "romantasy", label: "Romantasy", description: "Fantasía con romance como eje central" },
  { value: "scifi", label: "Ciencia Ficción", description: "Futuros tecnológicos y exploración espacial" },
  { value: "dystopian", label: "Distopía", description: "Sociedades opresivas y futuros sombríos" },
  { value: "post_apocalyptic", label: "Postapocalíptico", description: "Supervivencia tras el colapso de la civilización" },
  { value: "thriller", label: "Thriller", description: "Suspense y tensión narrativa" },
  { value: "psychological_thriller", label: "Thriller Psicológico", description: "Tensión desde la mente y la percepción" },
  { value: "legal_thriller", label: "Thriller Legal", description: "Suspense en juzgados y despachos de abogados" },
  { value: "historical_thriller", label: "Thriller Histórico", description: "Suspense en contextos históricos" },
  { value: "espionage", label: "Espionaje", description: "Agentes, conspiraciones y guerra encubierta" },
  { value: "crime", label: "Novela Negra", description: "Crimen, corrupción y ambigüedad moral" },
  { value: "police_procedural", label: "Policíaca", description: "Investigación policial paso a paso" },
  { value: "mystery", label: "Misterio", description: "Investigación y resolución de enigmas" },
  { value: "cozy_mystery", label: "Cozy Mystery", description: "Misterio amable en comunidades pequeñas" },
  { value: "romance", label: "Romance", description: "Relaciones y conexiones emocionales" },
  { value: "historical_romance", label: "Romance Histórico", description: "Historias de amor en épocas pasadas" },
  { value: "paranormal_romance", label: "Romance Paranormal", description: "Amor con elementos sobrenaturales" },
  { value: "romcom", label: "Comedia Romántica", description: "Romance con humor y enredos" },
  { value: "horror", label: "Horror", description: "Terror y elementos sobrenaturales" },
  { value: "gothic", label: "Gótica", description: "Atmósferas opresivas, secretos y decadencia" },
  { value: "literary", label: "Literaria", description: "Exploración de la condición humana" },
  { value: "contemporary", label: "Contemporánea", description: "Dramas actuales y vida cotidiana" },
  { value: "family_saga", label: "Saga Familiar", description: "Generaciones, herencias y secretos de familia" },
  { value: "magical_realism", label: "Realismo Mágico", description: "Lo extraordinario tejido en lo cotidiano" },
  { value: "historical", label: "Histórica", description: "Narrativas en contextos del pasado" },
  { value: "western", label: "Western", description: "Frontera, forajidos y tierras sin ley" },
  { value: "adventure", label: "Aventura", description: "Viajes y descubrimientos épicos" },
  { value: "comedy", label: "Humor", description: "Comedia y sátira como motor narrativo" },
  { value: "young_adult", label: "Juvenil (YA)", description: "Protagonistas jóvenes y ritos de paso" },
];

export const TONE_OPTIONS: GenreOption[] = [
  { value: "dramatic", label: "Dramático", description: "Emociones intensas y conflictos profundos" },
  { value: "dark", label: "Oscuro", description: "Atmósfera sombría y temas maduros" },
  { value: "gritty", label: "Crudo", description: "Realismo descarnado, sin edulcorar" },
  { value: "macabre", label: "Macabro", description: "Fascinación por lo mórbido e inquietante" },
  { value: "satirical", label: "Satírico", description: "Crítica social con humor mordaz" },
  { value: "humorous", label: "Humorístico", description: "Ligereza y comicidad constantes" },
  { value: "ironic", label: "Irónico", description: "Distancia mordaz y doble lectura" },
  { value: "lyrical", label: "Lírico", description: "Prosa poética y descriptiva" },
  { value: "melancholic", label: "Melancólico", description: "Tristeza serena y pérdida" },
  { value: "nostalgic", label: "Nostálgico", description: "Evocación del pasado y lo perdido" },
  { value: "contemplative", label: "Contemplativo", description: "Ritmo pausado e introspectivo" },
  { value: "minimalist", label: "Minimalista", description: "Estilo conciso y directo" },
  { value: "epic", label: "Épico", description: "Grandeza y eventos monumentales" },
  { value: "intimate", label: "Íntimo", description: "Cercanía emocional con los personajes" },
  { value: "warm", label: "Cálido", description: "Cercano, luminoso y reconfortante" },
  { value: "hopeful", label: "Esperanzador", description: "La luz se impone pese a la adversidad" },
  { value: "romantic", label: "Romántico", description: "Sensibilidad y emoción amorosa en primer plano" },
  { value: "suspenseful", label: "Tenso", description: "Mantiene al lector en vilo" },
  { value: "fast_paced", label: "Trepidante", description: "Ritmo vertiginoso y sin pausa" },
  { value: "unsettling", label: "Inquietante", description: "Desasosiego sutil y amenaza latente" },
  { value: "cynical", label: "Cínico", description: "Descreimiento y mirada desencantada" },
  { value: "costumbrista", label: "Costumbrista", description: "Retrato detallado de la vida cotidiana" },
];
