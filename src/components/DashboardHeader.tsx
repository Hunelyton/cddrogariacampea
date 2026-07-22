import { useState } from "react";
import { FileSpreadsheet, Upload, Trash2, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImportDialog } from "./ImportDialog";
import { ImportCountDialog } from "./ImportCountDialog";
import { clearProducts, clearCounts } from "@/lib/indexedDB";
import { toast } from "sonner";
import logoDrogaria from "@/assets/logo-drogaria-campea.png";

interface DashboardHeaderProps {
  companyName?: string;
  onProductsUpdate?: () => void;
  onExportDashboard?: () => void;
}

export const DashboardHeader = ({ 
  companyName = "CD DROGARIAS CAMPEÃ",
  onProductsUpdate,
  onExportDashboard
}: DashboardHeaderProps) => {
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importCountDialogOpen, setImportCountDialogOpen] = useState(false);

  const handleClearData = async () => {
    try {
      // Limpar IndexedDB
      await clearProducts();
      await clearCounts();
      
      // Limpar localStorage
      localStorage.clear();
      
      // Limpar sessionStorage
      sessionStorage.clear();
      
      // Limpar cache do service worker
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
      }
      
      toast.success("Dados limpos com sucesso! Recarregando...");
      
      // Recarregar a página após 1 segundo
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      toast.error("Erro ao limpar dados");
    }
  };

  return (
    <header className="mb-8">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-4">
          <img src={logoDrogaria} alt="Logo CD Drogarias Campeã" className="h-16 w-auto" />
          <div>
            <h1 className="text-3xl font-bold text-foreground">{companyName}</h1>
            <p className="text-sm text-muted-foreground mt-1">CNPJ: 46.756.296/0001-76</p>
            <p className="text-xs text-muted-foreground">Rua Santa Mônica, 480 - Parque Industrial San José - Cotia/SP - CEP: 06715-865</p>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-3">
          <Button 
            variant="outline" 
            className="bg-mint hover:bg-mint/80 text-mint-foreground border-mint/20 flex items-center gap-2"
            onClick={() => setImportDialogOpen(true)}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <div className="text-left">
              <div className="font-medium text-sm">Importar cadastro</div>
              <div className="text-xs opacity-80">Planilha XLS/XLSX</div>
            </div>
          </Button>
          
          <Button 
            variant="outline" 
            className="bg-info-blue hover:bg-info-blue/80 text-info-blue-foreground border-info-blue/20 flex items-center gap-2"
            onClick={() => setImportCountDialogOpen(true)}
          >
            <Upload className="w-4 h-4" />
            <div className="text-left">
              <div className="font-medium text-sm">Importar contagem</div>
              <div className="text-xs opacity-80">Arquivos TXT do coletor</div>
            </div>
          </Button>
          
          <Button 
            variant="outline" 
            className="bg-success-green hover:bg-success-green/80 text-success-green-foreground border-success-green/20 flex items-center gap-2"
            onClick={onExportDashboard}
          >
            <FileDown className="w-4 h-4" />
            <div className="text-left">
              <div className="font-medium text-sm">Exportar relatório</div>
              <div className="text-xs opacity-80">PDF completo</div>
            </div>
          </Button>
          
          <Button 
            variant="outline" 
            className="bg-danger-pink hover:bg-danger-pink/80 text-danger-pink-foreground border-danger-pink/20 flex items-center gap-2"
            onClick={handleClearData}
          >
            <Trash2 className="w-4 h-4" />
            <div className="text-left">
              <div className="font-medium text-sm">Limpar dados</div>
              <div className="text-xs opacity-80">Reiniciar armazenamento</div>
            </div>
          </Button>
        </div>
      </div>

      <ImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImportComplete={() => onProductsUpdate?.()}
      />

      <ImportCountDialog
        open={importCountDialogOpen}
        onOpenChange={setImportCountDialogOpen}
        onImportComplete={() => onProductsUpdate?.()}
      />
    </header>
  );
};
