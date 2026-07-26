import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThoughtLogViewer } from "@/components/thought-log-viewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Brain, Pencil, Eye, FileText, Filter } from "lucide-react";
import { useProject } from "@/lib/project-context";
import type { ThoughtLog } from "@shared/schema";

const filterOptions = [
  { value: "", label: "Todos", icon: Filter },
  { value: "architect", label: "Arquitecto", icon: Brain },
  { value: "ghostwriter", label: "Narrador", icon: Pencil },
  { value: "editor", label: "Editor", icon: Eye },
  { value: "copyeditor", label: "Estilista", icon: FileText },
];

export default function ThoughtLogsPage() {
  const [filter, setFilter] = useState("");
  const { currentProject, isLoading: projectsLoading } = useProject();

  const { data: thoughtLogs = [], isLoading: logsLoading } = useQuery<ThoughtLog[]>({
    queryKey: ["/api/projects", currentProject?.id, "thought-logs"],
    enabled: !!currentProject?.id,
  });

  if (projectsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Brain className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4 animate-pulse" />
          <p className="text-muted-foreground">Cargando proyectos...</p>
        </div>
      </div>
    );
  }

  if (!currentProject) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <Brain className="h-16 w-16 text-muted-foreground/20 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Sin logs de pensamiento</h2>
        <p className="text-muted-foreground max-w-md">
          Los logs de pensamiento se generarán cuando los agentes procesen tu manuscrito
        </p>
      </div>
    );
  }

  const logCounts = {
    architect: thoughtLogs.filter(l => l.agentRole.toLowerCase() === "architect").length,
    ghostwriter: thoughtLogs.filter(l => l.agentRole.toLowerCase() === "ghostwriter").length,
    editor: thoughtLogs.filter(l => l.agentRole.toLowerCase() === "editor").length,
    copyeditor: thoughtLogs.filter(l => l.agentRole.toLowerCase() === "copyeditor").length,
  };

  return (
    <div className="p-3 sm:p-6 space-y-6" data-testid="thought-logs-page">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Logs de Pensamiento</h1>
          <p className="text-muted-foreground mt-1">
            Firmas de razonamiento de los agentes
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Badge variant="secondary">{thoughtLogs.length} registros</Badge>
        <Badge variant="outline">{currentProject.genre}</Badge>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex flex-wrap gap-2">
          {filterOptions.map((option) => {
            const Icon = option.icon;
            const count = option.value ? logCounts[option.value as keyof typeof logCounts] : thoughtLogs.length;
            const isActive = filter === option.value;
            
            return (
              <Button
                key={option.value}
                variant={isActive ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(option.value)}
                className="gap-2"
                data-testid={`button-filter-${option.value || 'all'}`}
              >
                <Icon className="h-4 w-4" />
                {option.label}
                <Badge 
                  variant={isActive ? "secondary" : "outline"} 
                  className="ml-1 text-xs"
                >
                  {count}
                </Badge>
              </Button>
            );
          })}
        </div>
      </div>

      {logsLoading ? (
        <div className="flex items-center justify-center py-12">
          <Brain className="h-8 w-8 text-muted-foreground/30 animate-pulse" />
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Sesiones de Razonamiento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ThoughtLogViewer logs={thoughtLogs} filter={filter} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
