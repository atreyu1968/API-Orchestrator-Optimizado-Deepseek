// [Fix124] Checklist estática de promoción alineada con A9+COSMO ("A10").
// Se muestra como nueva pestaña en la página de Metadata KDP para recordar
// al autor las palancas que el algoritmo recompensa AHORA: engagement,
// tráfico externo, consistencia y prueba social fresca. No genera contenido
// dinámico — es un recordatorio operacional que el usuario marca a mano si
// quiere (estado en localStorage por proyecto).

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Megaphone, TrendingUp, Mail, Star, Eye, Clock } from "lucide-react";

interface ChecklistItem {
  id: string;
  label: string;
  detail: string;
}

interface ChecklistGroup {
  id: string;
  title: string;
  icon: typeof Megaphone;
  color: string;
  items: ChecklistItem[];
}

const GROUPS: ChecklistGroup[] = [
  {
    id: "metadata",
    title: "Metadata sin keyword stuffing",
    icon: Eye,
    color: "text-violet-600 dark:text-violet-400",
    items: [
      { id: "title_natural", label: "Título legible para humanos", detail: "Sin listas de géneros sueltos en el título ni en el subtítulo. COSMO penaliza el apilamiento de palabras." },
      { id: "subtitle_specific", label: "Subtítulo específico (ambientación + época + arquetipo)", detail: "Ej: \"thriller psicológico en la Galicia rural de los 80\" en lugar de \"misterio suspenso thriller\"." },
      { id: "description_promise", label: "Sinopsis con promesa concreta, no resumen", detail: "Habla del conflicto, los personajes y la experiencia del lector. El algoritmo extrae frases-señal específicas." },
      { id: "keywords_longtail", label: "7 keywords backend de 4-7 palabras", detail: "Frases que un lector real teclearía en Amazon. Sin palabras sueltas ni el género solo." },
    ],
  },
  {
    id: "engagement",
    title: "Engagement (la nueva moneda)",
    icon: TrendingUp,
    color: "text-emerald-600 dark:text-emerald-400",
    items: [
      { id: "look_inside", label: "Verificar \"Ojear dentro\" (Look Inside)", detail: "El sistema mide si el lector lo abre. Asegúrate de que los 2 primeros capítulos enganchen sin frenar." },
      { id: "cover_genre", label: "Portada comunica género al primer vistazo", detail: "Cumplir las convenciones visuales del subgénero sube clicks; un portada genérica los hunde." },
      { id: "kenp_hooks", label: "Cliffhangers/ganchos al final de capítulo", detail: "El Ghostwriter ya planta micro-hooks (Fix124). Si reeditas a mano, mantén la pista de continuidad emocional." },
    ],
  },
  {
    id: "external",
    title: "Tráfico externo (peso x3 vs interno)",
    icon: Mail,
    color: "text-blue-600 dark:text-blue-400",
    items: [
      { id: "newsletter", label: "Anuncio en newsletter de lectores", detail: "El tráfico externo cualificado tiene ahora el triple de peso que el PPC interno de Amazon." },
      { id: "social", label: "Publicación en redes con enlace directo", detail: "Posts con hook + portada + enlace al producto. Una sola red bien usada > 5 redes a medias." },
      { id: "web", label: "Página del libro en tu web / landing", detail: "Si tienes web de autor, ficha del libro con enlace de compra. Sirve para SEO Google y como hub de tráfico." },
    ],
  },
  {
    id: "consistency",
    title: "Consistencia primeras 3-4 semanas",
    icon: Clock,
    color: "text-amber-600 dark:text-amber-400",
    items: [
      { id: "weekly_promo", label: "Pequeña promoción cada semana", detail: "COSMO premia consistencia, no picos. Un email semanal o una promo controlada mantiene el libro \"vivo\"." },
      { id: "no_burst", label: "Evita lanzamiento agresivo de 24h", detail: "Antes funcionaba; ahora el sistema penaliza el patrón pico-caída. Distribuye los empujes." },
    ],
  },
  {
    id: "social_proof",
    title: "Prueba social fresca",
    icon: Star,
    color: "text-pink-600 dark:text-pink-400",
    items: [
      { id: "reviews_request", label: "Pedir reseñas a tu lista", detail: "Reseñas regulares y detalladas valen más que un pico de reseñas iniciales. Pídelas a quien ya leyó." },
      { id: "back_matter", label: "Back matter con call-to-review", detail: "Última página del libro: invita amablemente a dejar una reseña honesta. El sistema de back matter del proyecto lo soporta." },
    ],
  },
];

const STORAGE_PREFIX = "kdp-promo-checklist:";

export function KdpPromoChecklist({ projectId }: { projectId: string | number }) {
  const storageKey = `${STORAGE_PREFIX}${projectId}`;
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setChecked(JSON.parse(raw));
    } catch {
      // ignore corrupt storage
    }
  }, [storageKey]);

  function toggle(itemId: string) {
    setChecked((prev) => {
      const next = { ...prev, [itemId]: !prev[itemId] };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // ignore quota
      }
      return next;
    });
  }

  const totalItems = GROUPS.reduce((acc, g) => acc + g.items.length, 0);
  const doneItems = GROUPS.reduce(
    (acc, g) => acc + g.items.filter((i) => checked[i.id]).length,
    0,
  );

  return (
    <div className="space-y-4" data-testid="kdp-promo-checklist">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Megaphone className="h-4 w-4" />
              Checklist de promoción alineada con A9 + COSMO ("A10")
            </CardTitle>
            <Badge variant="outline" data-testid="text-checklist-progress">
              {doneItems} / {totalItems}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground pt-1">
            Amazon ha desplegado COSMO sobre A9 en 2025. Ahora pesan más el engagement (tiempo en página, Look Inside, KENP),
            el tráfico externo y la consistencia que los picos de venta o el keyword stuffing. Marca lo que ya hayas hecho;
            el estado se guarda en este navegador.
          </p>
        </CardHeader>
      </Card>

      {GROUPS.map((group) => {
        const Icon = group.icon;
        const groupDone = group.items.filter((i) => checked[i.id]).length;
        return (
          <Card key={group.id} data-testid={`checklist-group-${group.id}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${group.color}`} />
                  {group.title}
                </span>
                <Badge variant="secondary" className="text-xs">
                  {groupDone} / {group.items.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {group.items.map((item) => (
                <label
                  key={item.id}
                  htmlFor={`chk-${item.id}`}
                  className="flex items-start gap-3 p-2 rounded-md hover-elevate cursor-pointer"
                  data-testid={`checklist-item-${item.id}`}
                >
                  <Checkbox
                    id={`chk-${item.id}`}
                    checked={!!checked[item.id]}
                    onCheckedChange={() => toggle(item.id)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${checked[item.id] ? "line-through text-muted-foreground" : ""}`}>
                      {item.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
                  </div>
                </label>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
