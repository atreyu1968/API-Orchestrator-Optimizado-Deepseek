import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ProjectProvider, useProject } from "@/lib/project-context";
import { ProjectSelector } from "@/components/project-selector";
import { LoginForm } from "@/components/login-form";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LogOut, Loader2 } from "lucide-react";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import ManuscriptPage from "@/pages/manuscript";
import WorldBiblePage from "@/pages/world-bible";
import ThoughtLogsPage from "@/pages/thought-logs";
import ConfigPage from "@/pages/config";
import PseudonymsPage from "@/pages/pseudonyms";
import ImportPage from "@/pages/import";
import ExportPage from "@/pages/export";
import SeriesPage from "@/pages/series";
import QueuePage from "@/pages/queue";
import CostsPage from "@/pages/costs";
import ReeditPage from "@/pages/reedit";
import ReeditSeriesPage from "@/pages/reedit-series";
import GuidesPage from "@/pages/guides";
import AudiobooksPage from "@/pages/audiobooks";
import KdpMetadataPage from "@/pages/kdp-metadata";
import BookCatalogPage from "@/pages/book-catalog";
import NameBlacklistPage from "@/pages/name-blacklist";
import ProofreadingPage from "@/pages/proofreading";
import asdLogo from "@assets/ASD_1766442257801.png";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/manuscript" component={ManuscriptPage} />
      <Route path="/translations" component={ImportPage} />
      <Route path="/export" component={ExportPage} />
      <Route path="/world-bible" component={WorldBiblePage} />
      <Route path="/thought-logs" component={ThoughtLogsPage} />
      <Route path="/pseudonyms" component={PseudonymsPage} />
      <Route path="/series" component={SeriesPage} />
      <Route path="/queue" component={QueuePage} />
      <Route path="/costs" component={CostsPage} />
      <Route path="/reedit" component={ReeditPage} />
      <Route path="/reedit-series" component={ReeditSeriesPage} />
      <Route path="/guides" component={GuidesPage} />
      <Route path="/audiobooks" component={AudiobooksPage} />
      <Route path="/kdp-metadata" component={KdpMetadataPage} />
      <Route path="/book-catalog" component={BookCatalogPage} />
      <Route path="/name-blacklist" component={NameBlacklistPage} />
      <Route path="/proofreading" component={ProofreadingPage} />
      <Route path="/config" component={ConfigPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function GlobalProjectSelector() {
  const { projects, currentProject, setSelectedProjectId } = useProject();
  
  if (projects.length === 0) return null;
  
  return (
    <ProjectSelector
      projects={projects}
      selectedProjectId={currentProject?.id || null}
      onSelectProject={setSelectedProjectId}
    />
  );
}

function LogoutButton() {
  const { authEnabled, logout } = useAuth();
  
  if (!authEnabled) return null;
  
  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      console.error("Error al cerrar sesion:", err);
    }
  };
  
  return (
    <Button
      data-testid="button-logout"
      variant="ghost"
      size="icon"
      onClick={handleLogout}
      title="Cerrar sesion"
    >
      <LogOut className="h-4 w-4" />
    </Button>
  );
}

function AuthenticatedApp() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <ProjectProvider>
      <SidebarProvider style={style as React.CSSProperties}>
        <div className="flex h-screen w-full">
          <AppSidebar />
          <div className="flex flex-col flex-1 min-w-0">
            <header className="flex items-center justify-between gap-4 p-3 border-b shrink-0 sticky top-0 z-50 bg-background">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <div className="flex items-center gap-3">
                <GlobalProjectSelector />
                <ThemeToggle />
                <LogoutButton />
              </div>
            </header>
            <main className="flex-1 overflow-auto">
              <Router />
            </main>
            <footer className="flex items-center justify-center gap-2 px-3 py-1.5 border-t text-xs text-muted-foreground shrink-0">
              <img src={asdLogo} alt="ASD" className="h-4 w-auto" />
              <span>&copy; {new Date().getFullYear()} Atreyu Servicios Digitales</span>
              <span className="text-muted-foreground/50">|</span>
              <span className="text-muted-foreground/50">v7.7</span>
            </footer>
          </div>
        </div>
      </SidebarProvider>
      <Toaster />
    </ProjectProvider>
  );
}

function AppContent() {
  const { isLoading, authEnabled, authenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (authEnabled && !authenticated) {
    return <LoginForm />;
  }

  return <AuthenticatedApp />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AppContent />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
