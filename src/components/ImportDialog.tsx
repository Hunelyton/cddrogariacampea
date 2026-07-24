import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { addProducts, Product } from "@/lib/indexedDB";
import { toast } from "sonner";
import { Download, Upload } from "lucide-react";

const TEMPLATE_HEADERS = [
  "EMPRESA",
  "PRODUTO",
  "DESCRICAO",
  "SALDO",
  "CONTROLADO",
  "CUSTO_GERENCIAL",
  "EAN1",
  "EAN2",
  "EAN3",
  "EAN4",
  "EAN5",
  "EAN6",
  "EAN7",
  "EAN8",
  "EAN9",
  "EAN10",
  "EAN11",
  "EAN12",
  "LOTE",
  "VALIDADE",
  "COD.LOCALIZADOR",
  "DESCRICAO LOCALIZADOR",
  "CODIGO LV",
];

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
}

type SpreadsheetCell = string | number | boolean | Date | null | undefined;

const getImportedValue = (value: SpreadsheetCell): string => {
  if (value == null) return "";

  const text = value.toString();
  return text.trim() === "" || text.trim().toLowerCase() === "null" ? "" : text;
};

export const ImportDialog = ({ open, onOpenChange, onImportComplete }: ImportDialogProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ current: number; total: number; phase: "reading" | "saving" } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Mapeamento fixo padrão Drogaria Campeã (linha inicial = 2)
  const defaultMapping = {
    empresa: 0,      // Coluna A
    produto: 1,      // Coluna B
    descricao1: 2,   // Coluna C
    saldo: 3,        // Coluna D
    controlado: 4,   // Coluna E
    custoGerencial: 5, // Coluna F
    ean1: 6,         // Coluna G
    ean2: 7,         // Coluna H
    ean3: 8,         // Coluna I
    ean4: 9,         // Coluna J
    ean5: 10,        // Coluna K
    ean6: 11,        // Coluna L
    ean7: 12,        // Coluna M
    ean8: 13,        // Coluna N
    ean9: 14,        // Coluna O
    ean10: 15,       // Coluna P
    ean11: 16,       // Coluna Q
    ean12: 17,       // Coluna R
    lote: 18,                 // Coluna S
    validade: 19,             // Coluna T
    codLocalizador: 20,       // Coluna U
    descricaoLocalizador: 21, // Coluna V
    codigoLv: 22,             // Coluna W
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      // Importar automaticamente após selecionar o arquivo
      await handleImport(selectedFile);
    }
  };

  const handleImport = async (fileToImport: File) => {
    if (!fileToImport) return;

    setIsImporting(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as SpreadsheetCell[][];

        const totalRows = jsonData.length - 1; // Excluindo cabeçalho
        const products: Product[] = [];
        
        // Começar na linha 2 (índice 1) com progresso de leitura
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          
          const product: Product = {
            empresa: getImportedValue(row[defaultMapping.empresa]),
            produto: getImportedValue(row[defaultMapping.produto]),
            descricao1: getImportedValue(row[defaultMapping.descricao1]),
            saldo: getImportedValue(row[defaultMapping.saldo]),
            controlado: getImportedValue(row[defaultMapping.controlado]),
            custoGerencial: getImportedValue(row[defaultMapping.custoGerencial]),
            ean1: getImportedValue(row[defaultMapping.ean1]),
            ean2: getImportedValue(row[defaultMapping.ean2]),
            ean3: getImportedValue(row[defaultMapping.ean3]),
            ean4: getImportedValue(row[defaultMapping.ean4]),
            ean5: getImportedValue(row[defaultMapping.ean5]),
            ean6: getImportedValue(row[defaultMapping.ean6]),
            ean7: getImportedValue(row[defaultMapping.ean7]),
            ean8: getImportedValue(row[defaultMapping.ean8]),
            ean9: getImportedValue(row[defaultMapping.ean9]),
            ean10: getImportedValue(row[defaultMapping.ean10]),
            ean11: getImportedValue(row[defaultMapping.ean11]),
            ean12: getImportedValue(row[defaultMapping.ean12]),
            lote: getImportedValue(row[defaultMapping.lote]),
            validade: getImportedValue(row[defaultMapping.validade]),
            codLocalizador: getImportedValue(row[defaultMapping.codLocalizador]),
            descricaoLocalizador: getImportedValue(row[defaultMapping.descricaoLocalizador]),
            codigoLv: getImportedValue(row[defaultMapping.codigoLv]),
          };

          products.push(product);
          
          // Atualizar progresso de leitura a cada 500 registros
          if (i % 500 === 0 || i === jsonData.length - 1) {
            setProgress({ current: i, total: totalRows, phase: "reading" });
            // Permitir que a UI respire
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }

        // Fase de salvamento
        await addProducts(products, (processed, total) => {
          setProgress({ current: processed, total, phase: "saving" });
        });
        toast.success(`${products.length} produtos importados com sucesso!`);
        onImportComplete();
        handleClose();
      };
      reader.readAsArrayBuffer(fileToImport);
    } catch (error) {
      toast.error("Erro ao importar produtos");
      console.error(error);
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setIsImporting(false);
    setProgress(null);
    onOpenChange(false);
  };

  const handleDownloadTemplate = () => {
    const worksheet = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS]);
    worksheet["!cols"] = TEMPLATE_HEADERS.map((header) => ({
      wch: Math.max(header.length + 2, 14),
    }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Cadastro");
    XLSX.writeFile(workbook, "MODELO_IMPORTACAO_CADASTRO.xlsx");
    toast.success("Modelo de importação baixado com sucesso!");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar Cadastro de Produtos</DialogTitle>
          <DialogDescription>
            Selecione o arquivo Excel padrão Drogaria Campeã para importar
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div 
            className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => !isImporting && fileInputRef.current?.click()}
          >
            <Upload className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground text-center">
              {isImporting 
                ? "Importando..." 
                : file 
                  ? file.name 
                  : "Clique para selecionar um arquivo Excel"}
            </p>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
              disabled={isImporting}
            />
          </div>

          {isImporting && progress && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>
                  {progress.phase === "reading" ? "Lendo arquivo Excel..." : "Salvando produtos..."}
                </span>
                <span>{progress.current.toLocaleString()} / {progress.total.toLocaleString()}</span>
              </div>
              <Progress value={(progress.current / progress.total) * 100} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                {progress.phase === "reading" ? "Etapa 1/2 - " : "Etapa 2/2 - "}
                {Math.round((progress.current / progress.total) * 100)}% concluído
              </p>
            </div>
          )}
          
          {isImporting && !progress && (
            <div className="space-y-2">
              <div className="flex justify-center text-sm text-muted-foreground">
                <span>Processando arquivo...</span>
              </div>
              <Progress value={0} className="h-2 animate-pulse" />
            </div>
          )}
          
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-semibold">Formato esperado:</p>
            <p>• Linha 1: Cabeçalho</p>
            <p>• Linha 2 em diante: Dados</p>
            <p>• Colunas: A=EMPRESA, B=PRODUTO, C=DESCRICAO, D=SALDO, E=CONTROLADO, F=CUSTO_GERENCIAL, G-R=EAN1-EAN12, S=LOTE, T=VALIDADE, U=COD.LOCALIZADOR, V=DESCRIÇÃO LOCALIZADOR, W=CÓDIGO LV</p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={handleDownloadTemplate}
            disabled={isImporting}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Baixar modelo XLSX
          </Button>
          <Button variant="outline" onClick={handleClose} disabled={isImporting}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
