import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  DollarSign, 
  TrendingUp, 
  Cpu, 
  Calendar,
  Bot,
  Info,
  Layers,
  Zap,
  BookOpen,
  Languages
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ProjectSummary {
  id: number;
  title: string;
  status: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalThinkingTokens: number;
  estimatedCostUsd: number;
  createdAt: string;
}

interface TranslationSummary {
  id: number;
  projectTitle: string;
  sourceLanguage: string;
  targetLanguage: string;
  inputTokens: number;
  outputTokens: number;
  totalWords: number;
  status: string;
  createdAt: string;
}

interface UsageSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalThinkingTokens: number;
  totalCostUsd: number;
  eventCount: number;
}

interface UsageByDay {
  date: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  eventCount: number;
}

interface UsageByAgent {
  agentName: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  eventCount: number;
}

interface UsageByModel {
  model: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalThinkingTokens: number;
  totalCostUsd: number;
  eventCount: number;
}

const PRICING_INFO = `Precios por modelo (por millón de tokens):

gemini-2.5-flash (todos los agentes):
  Input: $0.15/M, Output: $0.60/M, Thinking: $3.50/M

gemini-2.0-flash (analizador):
  Input: $0.10/M, Output: $0.40/M

gemini-2.5-pro (reserva):
  Input: $1.25/M, Output: $10.00/M, Thinking: $10.00/M

Los costos se calculan según el modelo usado por cada agente.`;

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(4)}`;
}

function getModelBadge(model: string) {
  const colors: Record<string, "default" | "secondary" | "outline"> = {
    "gemini-2.5-flash": "default",
    "gemini-2.0-flash": "secondary",
    "gemini-2.5-pro": "outline",
  };
  const shortNames: Record<string, string> = {
    "gemini-2.5-flash": "2.5 Flash",
    "gemini-2.0-flash": "2.0 Flash",
    "gemini-2.5-pro": "2.5 Pro",
  };
  return (
    <Badge variant={colors[model] || "outline"} className="text-xs font-mono">
      {shortNames[model] || model}
    </Badge>
  );
}

export default function CostsPage() {
  const { data: usageSummary, isLoading: loadingSummary } = useQuery<UsageSummary>({
    queryKey: ["/api/ai-usage/summary"],
  });

  const { data: usageByDay, isLoading: loadingByDay } = useQuery<UsageByDay[]>({
    queryKey: ["/api/ai-usage/by-day"],
  });

  const { data: usageByAgent, isLoading: loadingByAgent } = useQuery<UsageByAgent[]>({
    queryKey: ["/api/ai-usage/by-agent"],
  });

  const { data: usageByModel, isLoading: loadingByModel } = useQuery<UsageByModel[]>({
    queryKey: ["/api/ai-usage/by-model"],
  });

  const { data: projectsSummary, isLoading: loadingProjects } = useQuery<ProjectSummary[]>({
    queryKey: ["/api/ai-usage/projects-summary"],
  });

  const { data: translationsList, isLoading: loadingTranslations } = useQuery<TranslationSummary[]>({
    queryKey: ["/api/translations"],
  });

  const calcTranslationCost = (inputTokens: number, outputTokens: number) => {
    return ((inputTokens / 1_000_000) * 0.15) + ((outputTokens / 1_000_000) * 0.60);
  };

  const translationsWithCost = (translationsList || []).filter(t => (t.inputTokens || 0) > 0 || (t.outputTokens || 0) > 0);
  const translationsTotalCost = translationsWithCost.reduce((sum, t) => sum + calcTranslationCost(t.inputTokens || 0, t.outputTokens || 0), 0);
  const translationsTotalInput = translationsWithCost.reduce((sum, t) => sum + (t.inputTokens || 0), 0);
  const translationsTotalOutput = translationsWithCost.reduce((sum, t) => sum + (t.outputTokens || 0), 0);

  // Calculate totals from projects if event-based data is empty
  const projectsTotalCost = projectsSummary?.reduce((sum, p) => sum + p.estimatedCostUsd, 0) || 0;
  const projectsTotalInput = projectsSummary?.reduce((sum, p) => sum + p.totalInputTokens, 0) || 0;
  const projectsTotalOutput = projectsSummary?.reduce((sum, p) => sum + p.totalOutputTokens, 0) || 0;
  const projectsTotalThinking = projectsSummary?.reduce((sum, p) => sum + p.totalThinkingTokens, 0) || 0;

  const eventBasedCost = Number(usageSummary?.totalCostUsd || 0);
  const totalCost = eventBasedCost > 0 ? eventBasedCost : projectsTotalCost;
  // Use event-based data if available, otherwise fall back to project data
  const hasEventData = (usageSummary?.eventCount || 0) > 0;
  const totalInputTokens = hasEventData ? (usageSummary?.totalInputTokens || 0) : projectsTotalInput;
  const totalOutputTokens = hasEventData ? (usageSummary?.totalOutputTokens || 0) : projectsTotalOutput;
  const totalThinkingTokens = hasEventData ? (usageSummary?.totalThinkingTokens || 0) : projectsTotalThinking;
  const eventCount = hasEventData ? (usageSummary?.eventCount || 0) : (projectsSummary?.length || 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Control de Costos API</h1>
          <p className="text-muted-foreground">
            Costos reales basados en el modelo usado por cada agente
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 text-sm text-muted-foreground cursor-help">
              <Info className="h-4 w-4" />
              <span>Info de precios</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-sm whitespace-pre-line">
            {PRICING_INFO}
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Costo Total Real</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{formatCurrency(totalCost)}</div>
                <p className="text-xs text-muted-foreground">
                  {eventCount} llamadas a la API
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Tokens de Entrada</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{formatNumber(totalInputTokens)}</div>
                <p className="text-xs text-muted-foreground">
                  Prompts enviados
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Tokens de Salida</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{formatNumber(totalOutputTokens)}</div>
                <p className="text-xs text-muted-foreground">
                  + {formatNumber(totalThinkingTokens)} thinking
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Costo Promedio</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {formatCurrency(totalCost / Math.max(eventCount, 1))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Por llamada a la API
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Costos por Modelo
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingByModel ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : !usageByModel?.length ? (
              <p className="text-muted-foreground text-center py-8">
                No hay datos de uso registrados
              </p>
            ) : (
              <div className="max-h-96 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Modelo</TableHead>
                      <TableHead className="text-right">Input</TableHead>
                      <TableHead className="text-right">Output</TableHead>
                      <TableHead className="text-right">Thinking</TableHead>
                      <TableHead className="text-right">Costo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usageByModel.map((row) => (
                      <TableRow key={row.model}>
                        <TableCell>{getModelBadge(row.model)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatNumber(row.totalInputTokens)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatNumber(row.totalOutputTokens)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">
                          {formatNumber(row.totalThinkingTokens)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">
                          {formatCurrency(Number(row.totalCostUsd))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Uso por Día (últimos 30 días)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingByDay ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : !usageByDay?.length ? (
              <p className="text-muted-foreground text-center py-8">
                No hay datos de uso diario registrados
              </p>
            ) : (
              <div className="max-h-96 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="text-right">Input</TableHead>
                      <TableHead className="text-right">Output</TableHead>
                      <TableHead className="text-right">Costo</TableHead>
                      <TableHead className="text-right">Llamadas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usageByDay.map((day) => (
                      <TableRow key={day.date}>
                        <TableCell className="font-medium">
                          {new Date(day.date).toLocaleDateString("es-ES", {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatNumber(day.totalInputTokens)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatNumber(day.totalOutputTokens)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">
                          {formatCurrency(Number(day.totalCostUsd))}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {day.eventCount}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {usageByAgent && usageByAgent.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Uso por Agente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agente</TableHead>
                  <TableHead className="text-right">Input Tokens</TableHead>
                  <TableHead className="text-right">Output Tokens</TableHead>
                  <TableHead className="text-right">Costo Total</TableHead>
                  <TableHead className="text-right">Llamadas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usageByAgent.map((agent) => (
                  <TableRow key={agent.agentName}>
                    <TableCell className="font-medium">{agent.agentName}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatNumber(agent.totalInputTokens)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatNumber(agent.totalOutputTokens)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold">
                      {formatCurrency(Number(agent.totalCostUsd))}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {agent.eventCount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Costos por Proyecto
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingProjects ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !projectsSummary?.length ? (
            <p className="text-muted-foreground text-center py-8">
              No hay proyectos registrados
            </p>
          ) : (
            <div className="max-h-[500px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Proyecto</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Input</TableHead>
                    <TableHead className="text-right">Output</TableHead>
                    <TableHead className="text-right">Thinking</TableHead>
                    <TableHead className="text-right">Costo Est.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projectsSummary
                    .filter(p => p.totalInputTokens > 0)
                    .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd)
                    .map((project) => (
                    <TableRow key={project.id} data-testid={`row-project-${project.id}`}>
                      <TableCell className="font-medium max-w-[200px] truncate" title={project.title}>
                        {project.title}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={project.status === "completed" ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {project.status === "completed" ? "Completado" : 
                           project.status === "generating" ? "Generando" :
                           project.status === "queued" ? "En cola" : project.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatNumber(project.totalInputTokens)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatNumber(project.totalOutputTokens)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        {formatNumber(project.totalThinkingTokens)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">
                        ${project.estimatedCostUsd.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell colSpan={2}>TOTAL</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatNumber(projectsTotalInput)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatNumber(projectsTotalOutput)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {formatNumber(projectsTotalThinking)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-lg">
                      ${projectsTotalCost.toFixed(2)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Languages className="h-5 w-5" />
            Costos de Traducciones
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingTranslations ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !translationsWithCost.length ? (
            <p className="text-muted-foreground text-center py-8">
              No hay traducciones con datos de tokens registrados
            </p>
          ) : (
            <div className="max-h-[500px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Proyecto</TableHead>
                    <TableHead>Idiomas</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Palabras</TableHead>
                    <TableHead className="text-right">Input</TableHead>
                    <TableHead className="text-right">Output</TableHead>
                    <TableHead className="text-right">Costo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {translationsWithCost
                    .sort((a, b) => calcTranslationCost(b.inputTokens || 0, b.outputTokens || 0) - calcTranslationCost(a.inputTokens || 0, a.outputTokens || 0))
                    .map((t) => (
                    <TableRow key={t.id} data-testid={`row-translation-${t.id}`}>
                      <TableCell className="font-medium max-w-[200px] truncate" title={t.projectTitle}>
                        {t.projectTitle}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs">{t.sourceLanguage} → {t.targetLanguage}</span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={t.status === "completed" ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {t.status === "completed" ? "Completada" :
                           t.status === "translating" ? "Traduciendo" : t.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatNumber(t.totalWords || 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatNumber(t.inputTokens || 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatNumber(t.outputTokens || 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">
                        {formatCurrency(calcTranslationCost(t.inputTokens || 0, t.outputTokens || 0))}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell colSpan={4}>TOTAL TRADUCCIONES</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatNumber(translationsTotalInput)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatNumber(translationsTotalOutput)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-lg">
                      {formatCurrency(translationsTotalCost)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                <strong>Costos reales:</strong> Los costos se calculan usando los precios oficiales de cada modelo 
                de Gemini y el conteo real de tokens de cada llamada a la API.
              </p>
              <p>
                El tracking de costos se activa automáticamente para nuevas generaciones. 
                Los datos anteriores sin tracking mostrarán $0.00.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
