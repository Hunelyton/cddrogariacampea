import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Index from "./pages/Index";
import { StreetInventory } from "./components/StreetInventory";
import { ArrowRight, MapPin, Package } from "lucide-react";
import logo from "@/assets/logo-drogaria-campea.png";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const InventoryChoice = () => <main className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
  <div className="w-full max-w-xl text-center">
    <img src={logo} alt="CD Drogarias Campeã" className="h-20 md:h-24 w-auto mx-auto object-contain" />
    <p className="mt-5 text-xs font-semibold uppercase text-primary">CD Drogarias Campeã</p>
    <h1 className="mt-2 text-2xl md:text-3xl font-bold text-foreground">Selecione o inventário</h1>
    <div className="mt-8 grid gap-3 text-left">
      <Link to="/picking" className="group flex min-h-24 items-center gap-4 rounded-lg border border-border bg-card px-5 py-4 transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Package className="h-6 w-6" /></span>
        <span className="min-w-0 flex-1"><span className="block text-base font-semibold">Picking</span><span className="block text-sm text-muted-foreground">Inventário de separação</span></span>
        <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
      </Link>
      <Link to="/rua" className="group flex min-h-24 items-center gap-4 rounded-lg border border-border bg-card px-5 py-4 transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><MapPin className="h-6 w-6" /></span>
        <span className="min-w-0 flex-1"><span className="block text-base font-semibold">Rua</span><span className="block text-sm text-muted-foreground">Inventário de rua</span></span>
        <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
      </Link>
    </div>
  </div>
</main>;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<InventoryChoice />} />
          <Route path="/picking" element={<Index />} />
          <Route path="/rua" element={<StreetInventory />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
