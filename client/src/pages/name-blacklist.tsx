import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Plus, Trash2, Loader2, ShieldBan, User, Users } from "lucide-react";
import type { NameBlacklistEntry } from "@shared/schema";

export default function NameBlacklistPage() {
  const { toast } = useToast();
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("nombre");
  const [filter, setFilter] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<NameBlacklistEntry | null>(null);

  const { data: entries = [], isLoading } = useQuery<NameBlacklistEntry[]>({
    queryKey: ["/api/name-blacklist"],
  });

  const addMutation = useMutation({
    mutationFn: async (data: { name: string; type: string }) => {
      const res = await apiRequest("POST", "/api/name-blacklist", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/name-blacklist"] });
      toast({ title: "Nombre añadido a la lista negra" });
      setNewName("");
    },
    onError: (error: any) => {
      const msg = error?.message?.includes("409") || error?.message?.includes("duplicate")
        ? "Este nombre ya existe en la lista negra"
        : "Error al añadir";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/name-blacklist/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/name-blacklist"] });
      toast({ title: "Nombre eliminado de la lista negra" });
    },
  });

  const handleAdd = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    addMutation.mutate({ name: trimmed, type: newType });
  };

  const handleBulkAdd = () => {
    const names = newName.split(",").map((n) => n.trim()).filter((n) => n.length >= 2);
    if (names.length === 0) return;
    
    const addSequentially = async () => {
      for (const name of names) {
        try {
          await apiRequest("POST", "/api/name-blacklist", { name, type: newType });
        } catch {}
      }
      queryClient.invalidateQueries({ queryKey: ["/api/name-blacklist"] });
      toast({ title: `${names.length} nombres procesados` });
      setNewName("");
    };
    addSequentially();
  };

  const filtered = filter === "all" ? entries : entries.filter((e) => e.type === filter);

  const nombres = entries.filter((e) => e.type === "nombre").length;
  const apellidos = entries.filter((e) => e.type === "apellido").length;

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" data-testid="text-page-title">
            <ShieldBan className="h-6 w-6" />
            Lista Negra de Nombres
          </CardTitle>
          <CardDescription>
            Nombres y apellidos prohibidos para el Arquitecto. Se suman automáticamente a los nombres
            extraídos de World Bibles existentes. El Arquitecto no usará estos nombres al crear personajes nuevos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              data-testid="input-new-name"
              placeholder="Nombre o apellido (separa con comas para añadir varios)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !newName.includes(",")) handleAdd();
              }}
              className="flex-1"
            />
            <Select value={newType} onValueChange={setNewType}>
              <SelectTrigger className="w-[140px]" data-testid="select-name-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nombre">Nombre</SelectItem>
                <SelectItem value="apellido">Apellido</SelectItem>
              </SelectContent>
            </Select>
            {newName.includes(",") ? (
              <Button
                data-testid="button-bulk-add"
                onClick={handleBulkAdd}
                disabled={!newName.trim()}
              >
                <Plus className="h-4 w-4 mr-1" />
                Añadir varios
              </Button>
            ) : (
              <Button
                data-testid="button-add-name"
                onClick={handleAdd}
                disabled={!newName.trim() || addMutation.isPending}
              >
                {addMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-1" />
                )}
                Añadir
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">Filtrar:</span>
            <Button
              variant={filter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("all")}
              data-testid="button-filter-all"
            >
              <Users className="h-3.5 w-3.5 mr-1" />
              Todos ({entries.length})
            </Button>
            <Button
              variant={filter === "nombre" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("nombre")}
              data-testid="button-filter-nombres"
            >
              <User className="h-3.5 w-3.5 mr-1" />
              Nombres ({nombres})
            </Button>
            <Button
              variant={filter === "apellido" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("apellido")}
              data-testid="button-filter-apellidos"
            >
              Apellidos ({apellidos})
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ShieldBan className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">Sin nombres en la lista negra</p>
              <p className="text-sm mt-1">Añade nombres o apellidos que quieras prohibir al Arquitecto</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {filtered.map((entry) => (
                <Badge
                  key={entry.id}
                  variant={entry.type === "nombre" ? "default" : "secondary"}
                  className="text-sm py-1.5 px-3 flex items-center gap-1.5 cursor-default group"
                  data-testid={`badge-name-${entry.id}`}
                >
                  {entry.name}
                  <button
                    onClick={() => setDeleteTarget(entry)}
                    className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
                    data-testid={`button-delete-${entry.id}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Eliminar de la lista negra"
        description={`¿Eliminar "${deleteTarget?.name}" de la lista negra? El Arquitecto podrá volver a usar este nombre.`}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
      />
    </div>
  );
}
