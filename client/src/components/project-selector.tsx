import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, Search, X, Filter } from "lucide-react";
import type { Project, Pseudonym, Series } from "@shared/schema";

interface ProjectSelectorProps {
  projects: Project[];
  selectedProjectId: number | null;
  onSelectProject: (projectId: number) => void;
}

const statusLabels: Record<string, string> = {
  idle: "Pendiente",
  generating: "Generando",
  completed: "Completado",
  archived: "Archivado",
  paused: "Pausado",
  error: "Error",
  awaiting_instructions: "Esperando",
  planning: "Planificando",
  reviewing: "Revisando",
  exporting: "Exportando",
};

const statusColors: Record<string, string> = {
  idle: "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400",
  generating: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
  completed: "bg-green-500/20 text-green-600 dark:text-green-400",
  archived: "bg-gray-500/20 text-gray-600 dark:text-gray-400",
  paused: "bg-orange-500/20 text-orange-600 dark:text-orange-400",
  error: "bg-red-500/20 text-red-600 dark:text-red-400",
  awaiting_instructions: "bg-purple-500/20 text-purple-600 dark:text-purple-400",
  planning: "bg-indigo-500/20 text-indigo-600 dark:text-indigo-400",
  reviewing: "bg-cyan-500/20 text-cyan-600 dark:text-cyan-400",
  exporting: "bg-teal-500/20 text-teal-600 dark:text-teal-400",
};

export function ProjectSelector({ 
  projects, 
  selectedProjectId, 
  onSelectProject 
}: ProjectSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterAuthor, setFilterAuthor] = useState<string>("all");
  const [filterSeries, setFilterSeries] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  const { data: pseudonyms = [] } = useQuery<Pseudonym[]>({
    queryKey: ["/api/pseudonyms"],
  });

  const { data: allSeries = [] } = useQuery<Series[]>({
    queryKey: ["/api/series"],
  });

  const getPseudonymName = (id: number | null) => {
    if (!id) return null;
    return pseudonyms.find(p => p.id === id)?.name || null;
  };

  const getSeriesName = (id: number | null) => {
    if (!id) return null;
    return allSeries.find(s => s.id === id)?.title || null;
  };

  const usedStatuses = useMemo(() => {
    const statuses = new Set(projects.map(p => p.status));
    return Array.from(statuses).sort();
  }, [projects]);

  const usedPseudonyms = useMemo(() => {
    const ids = new Set(projects.map(p => p.pseudonymId).filter(Boolean) as number[]);
    return pseudonyms.filter(p => ids.has(p.id));
  }, [projects, pseudonyms]);

  const usedSeries = useMemo(() => {
    const ids = new Set(projects.map(p => p.seriesId).filter(Boolean) as number[]);
    return allSeries.filter(s => ids.has(s.id));
  }, [projects, allSeries]);

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      if (search) {
        const term = search.toLowerCase();
        const title = p.title.toLowerCase();
        const author = getPseudonymName(p.pseudonymId)?.toLowerCase() || "";
        const series = getSeriesName(p.seriesId)?.toLowerCase() || "";
        if (!title.includes(term) && !author.includes(term) && !series.includes(term)) return false;
      }
      if (filterAuthor !== "all") {
        if (filterAuthor === "none") {
          if (p.pseudonymId) return false;
        } else if (p.pseudonymId?.toString() !== filterAuthor) return false;
      }
      if (filterSeries !== "all") {
        if (filterSeries === "none") {
          if (p.seriesId) return false;
        } else if (p.seriesId?.toString() !== filterSeries) return false;
      }
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      return true;
    });
  }, [projects, search, filterAuthor, filterSeries, filterStatus, pseudonyms, allSeries]);

  const hasActiveFilters = filterAuthor !== "all" || filterSeries !== "all" || filterStatus !== "all" || search.length > 0;

  const clearFilters = () => {
    setFilterAuthor("all");
    setFilterSeries("all");
    setFilterStatus("all");
    setSearch("");
  };

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  if (projects.length === 0) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) setSearch("");
      }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[300px] justify-between"
          data-testid="select-project"
        >
          {selectedProject ? (
            <div className="flex items-center gap-2 truncate">
              <span className="truncate">{selectedProject.title}</span>
              <Badge variant="secondary" className={`text-xs shrink-0 ${statusColors[selectedProject.status] || ""}`}>
                {statusLabels[selectedProject.status] || selectedProject.status}
              </Badge>
            </div>
          ) : (
            <span className="text-muted-foreground">Seleccionar proyecto</span>
          )}
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        <div className="p-2 border-b space-y-2">
          <div className="flex items-center gap-1">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar proyecto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
                data-testid="input-search-project"
              />
            </div>
            <Button
              variant={showFilters || hasActiveFilters ? "default" : "ghost"}
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => setShowFilters(!showFilters)}
              data-testid="button-toggle-filters"
            >
              <Filter className="h-4 w-4" />
            </Button>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={clearFilters}
                data-testid="button-clear-filters"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {showFilters && (
            <div className="space-y-1.5">
              {usedPseudonyms.length > 0 && (
                <Select value={filterAuthor} onValueChange={setFilterAuthor}>
                  <SelectTrigger className="h-8 text-xs" data-testid="filter-author">
                    <SelectValue placeholder="Autor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los autores</SelectItem>
                    <SelectItem value="none">Sin autor</SelectItem>
                    {usedPseudonyms.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {usedSeries.length > 0 && (
                <Select value={filterSeries} onValueChange={setFilterSeries}>
                  <SelectTrigger className="h-8 text-xs" data-testid="filter-series">
                    <SelectValue placeholder="Serie" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las series</SelectItem>
                    <SelectItem value="none">Sin serie</SelectItem>
                    {usedSeries.map((s) => (
                      <SelectItem key={s.id} value={s.id.toString()}>{s.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {usedStatuses.length > 1 && (
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-8 text-xs" data-testid="filter-status">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los estados</SelectItem>
                    {usedStatuses.map((s) => (
                      <SelectItem key={s} value={s}>{statusLabels[s] || s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
          {hasActiveFilters && (
            <p className="text-xs text-muted-foreground">
              {filteredProjects.length} de {projects.length} proyectos
            </p>
          )}
        </div>
        <ScrollArea className="max-h-[300px]">
          <div className="p-1">
            {filteredProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No se encontraron proyectos
              </p>
            ) : (
              filteredProjects.map((project) => {
                const authorName = getPseudonymName(project.pseudonymId);
                const seriesName = getSeriesName(project.seriesId);
                const isSelected = project.id === selectedProjectId;
                return (
                  <button
                    key={project.id}
                    onClick={() => {
                      onSelectProject(project.id);
                      setOpen(false);
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded-sm text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors ${
                      isSelected ? "bg-accent" : ""
                    }`}
                    data-testid={`select-project-${project.id}`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate font-medium">{project.title}</span>
                      <Badge variant="secondary" className={`text-xs shrink-0 ${statusColors[project.status] || ""}`}>
                        {statusLabels[project.status] || project.status}
                      </Badge>
                    </div>
                    {(authorName || seriesName) && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {authorName && (
                          <span className="text-xs text-muted-foreground">{authorName}</span>
                        )}
                        {authorName && seriesName && (
                          <span className="text-xs text-muted-foreground">·</span>
                        )}
                        {seriesName && (
                          <span className="text-xs text-muted-foreground italic">
                            {seriesName}{project.seriesOrder ? ` #${project.seriesOrder}` : ""}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
