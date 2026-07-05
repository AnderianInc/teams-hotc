import { Outlet, Link } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { Button } from "@/components/ui/button";
import { HelpCircle, Home } from "lucide-react";

export function AppLayout() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <header className="flex h-14 items-center gap-2 border-b px-4 lg:px-6">
            <SidebarTrigger />
            <Button asChild variant="ghost" size="sm" className="gap-2">
              <Link to="/dashboard" aria-label="Home">
                <Home className="h-4 w-4" />
                <span className="hidden sm:inline">Home</span>
              </Link>
            </Button>
            <div className="flex-1" />
            <Button asChild variant="ghost" size="icon" title="Help & docs">
              <Link to="/help" aria-label="Help & docs">
                <HelpCircle className="h-5 w-5" />
              </Link>
            </Button>
            <NotificationBell />
          </header>
          <div className="flex-1 p-4 lg:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

