import { lazy, Suspense, memo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Lazy loading dos componentes de tabela
const ProductsTable = lazy(() => import("./ProductsTable").then(m => ({ default: m.ProductsTable })));
const CountTable = lazy(() => import("./CountTable").then(m => ({ default: m.CountTable })));
const DiscrepanciesTable = lazy(() => import("./DiscrepanciesTable").then(m => ({ default: m.DiscrepanciesTable })));

interface DashboardTabsProps {
  refreshTrigger?: number;
  onUpdate?: () => void;
}

// Loading fallback para tabelas
const TableLoading = () => (
  <div className="flex items-center justify-center py-12">
    <div className="flex flex-col items-center gap-3">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      <span className="text-sm text-muted-foreground">Carregando tabela...</span>
    </div>
  </div>
);

export const DashboardTabs = memo(({ refreshTrigger, onUpdate }: DashboardTabsProps) => {
  return (
    <Tabs defaultValue="cadastro" className="w-full">
      <TabsList className="grid w-full grid-cols-1 md:grid-cols-3 h-auto gap-1 bg-card border border-border p-1">
        <TabsTrigger 
          value="cadastro"
          className="data-[state=active]:bg-background data-[state=active]:shadow-sm py-3"
        >
          Cadastro de Produtos
        </TabsTrigger>
        <TabsTrigger 
          value="contagem"
          className="data-[state=active]:bg-background data-[state=active]:shadow-sm py-3"
        >
          Contagem
        </TabsTrigger>
        <TabsTrigger 
          value="divergencias"
          className="data-[state=active]:bg-background data-[state=active]:shadow-sm py-3"
        >
          Divergências
        </TabsTrigger>
      </TabsList>
      
      <TabsContent value="cadastro" className="mt-6">
        <Suspense fallback={<TableLoading />}>
          <ProductsTable refreshTrigger={refreshTrigger} />
        </Suspense>
      </TabsContent>
      
      <TabsContent value="contagem" className="mt-6">
        <Suspense fallback={<TableLoading />}>
          <CountTable refreshTrigger={refreshTrigger} onUpdate={onUpdate} />
        </Suspense>
      </TabsContent>
      
      <TabsContent value="divergencias" className="mt-6">
        <Suspense fallback={<TableLoading />}>
          <DiscrepanciesTable key={refreshTrigger} />
        </Suspense>
      </TabsContent>
    </Tabs>
  );
});

DashboardTabs.displayName = "DashboardTabs";
