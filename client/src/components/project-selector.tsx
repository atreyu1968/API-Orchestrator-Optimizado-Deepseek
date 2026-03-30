import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { Project, Pseudonym } from "@shared/schema";

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
};

const statusColors: Record<string, string> = {
  idle: "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400",
  generating: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
  completed: "bg-green-500/20 text-green-600 dark:text-green-400",
  archived: "bg-gray-500/20 text-gray-600 dark:text-gray-400",
};

export function ProjectSelector({ 
  projects, 
  selectedProjectId, 
  onSelectProject 
}: ProjectSelectorProps) {
  const { data: pseudonyms = [] } = useQuery<Pseudonym[]>({
    queryKey: ["/api/pseudonyms"],
  });

  const getPseudonymName = (id: number | null) => {
    if (!id) return null;
    return pseudonyms.find(p => p.id === id)?.name || null;
  };

  const activeProjects = projects.filter(p => p.status !== "archived");
  const archivedProjects = projects.filter(p => p.status === "archived");

  if (projects.length === 0) {
    return null;
  }

  return (
    <Select
      value={selectedProjectId?.toString() || ""}
      onValueChange={(value) => onSelectProject(parseInt(value))}
    >
      <SelectTrigger className="w-[280px]" data-testid="select-project">
        <SelectValue placeholder="Seleccionar proyecto" />
      </SelectTrigger>
      <SelectContent>
        {activeProjects.length > 0 && (
          <SelectGroup>
            <SelectLabel>Proyectos Activos</SelectLabel>
            {activeProjects.map((project) => (
              <SelectItem 
                key={project.id} 
                value={project.id.toString()}
                data-testid={`select-project-${project.id}`}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate max-w-[180px]">{project.title}</span>
                  {getPseudonymName(project.pseudonymId) && (
                    <span className="text-xs text-muted-foreground">({getPseudonymName(project.pseudonymId)})</span>
                  )}
                  <Badge 
                    variant="secondary" 
                    className={`text-xs ${statusColors[project.status] || ""}`}
                  >
                    {statusLabels[project.status] || project.status}
                  </Badge>
                </div>
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {archivedProjects.length > 0 && (
          <>
            {activeProjects.length > 0 && <SelectSeparator />}
            <SelectGroup>
              <SelectLabel>Archivados</SelectLabel>
              {archivedProjects.map((project) => (
                <SelectItem 
                  key={project.id} 
                  value={project.id.toString()}
                  data-testid={`select-project-archived-${project.id}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate max-w-[180px] opacity-70">{project.title}</span>
                    {getPseudonymName(project.pseudonymId) && (
                      <span className="text-xs text-muted-foreground">({getPseudonymName(project.pseudonymId)})</span>
                    )}
                    <Badge 
                      variant="secondary" 
                      className={`text-xs ${statusColors[project.status] || ""}`}
                    >
                      {statusLabels[project.status] || project.status}
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          </>
        )}
      </SelectContent>
    </Select>
  );
}
