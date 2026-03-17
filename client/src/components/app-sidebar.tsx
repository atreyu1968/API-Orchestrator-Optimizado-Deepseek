import { Link, useLocation } from "wouter";
import { 
  Sidebar, 
  SidebarContent, 
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { 
  LayoutDashboard, 
  BookOpen, 
  Brain, 
  Globe, 
  Settings,
  User,
  Upload,
  Download,
  Library,
  ListOrdered,
  DollarSign,
  Edit3
} from "lucide-react";

const mainNavItems = [
  { title: "Panel Principal", url: "/", icon: LayoutDashboard },
  { title: "Manuscrito", url: "/manuscript", icon: BookOpen },
  { title: "Biblia del Mundo", url: "/world-bible", icon: Globe },
  { title: "Logs de Pensamiento", url: "/thought-logs", icon: Brain },
];

const translationsNavItems = [
  { title: "Importar Libros", url: "/translations", icon: Upload },
  { title: "Exportar y Traducir", url: "/export", icon: Download },
  { title: "Reeditar Manuscrito", url: "/reedit", icon: Edit3 },
];

const settingsNavItems = [
  { title: "Pseudónimos", url: "/pseudonyms", icon: User },
  { title: "Series", url: "/series", icon: Library },
  { title: "Cola de Proyectos", url: "/queue", icon: ListOrdered },
  { title: "Control de Costos", url: "/costs", icon: DollarSign },
  { title: "Configuración", url: "/config", icon: Settings },
];

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="rounded-md overflow-hidden">
            <img src="/favicon.jpg" alt="LitAgents" className="h-9 w-9 object-cover" />
          </div>
          <div>
            <h1 className="font-semibold text-lg">LitAgents</h1>
            <p className="text-xs text-muted-foreground">Orquestador Literario</p>
          </div>
        </Link>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegación</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild
                    isActive={location === item.url}
                    data-testid={`nav-${item.url.replace("/", "") || "dashboard"}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Manuscritos</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {translationsNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild
                    isActive={location === item.url}
                    data-testid={`nav-${item.url.replace("/", "")}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Sistema</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild
                    isActive={location === item.url}
                    data-testid={`nav-${item.url.replace("/", "")}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <p className="text-xs text-muted-foreground text-center">
          Powered by Gemini 3 Pro
        </p>
        <p className="text-xs text-muted-foreground/60 text-center">
          Deep Thinking Engine
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
