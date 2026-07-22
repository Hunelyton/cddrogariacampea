import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, X } from "lucide-react";
import { toast } from "sonner";
import { addCounts, getAllProducts, Count } from "@/lib/indexedDB";

interface ImportCountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
}

interface FileData {
  file: File;
  coletor: string;
  inventariador: string;
}

export const ImportCountDialog = ({
  open,
  onOpenChange,
  onImportComplete,
}: ImportCountDialogProps) => {
  const [files, setFiles] = useState<FileData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map((file) => ({
        file,
        coletor: "C1",
        inventariador: "",
      }));
      setFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const updateFileData = (index: number, field: "coletor" | "inventariador", value: string) => {
    setFiles((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const parseCountFile = async (fileData: FileData): Promise<Count[]> => {
    const text = await fileData.file.text();
    const lines = text.split("\n").filter((line) => line.trim());
    const counts: Count[] = [];
    const products = await getAllProducts();

    for (const line of lines) {
      const separator = line.includes(";") ? ";" : ",";
      const parts = line.split(separator).map((p) => p.trim());

      if (parts.length >= 3) {
        const codLocalizador = parts[0] || "";
        const eanLido = parts[1] || "";
        const quantidade = parts[2] || "";
        const lote = parts[3] || "";
        const validade = parts[4] || "";
        const codigoLv = parts[5] || "";

        // O EAN lido pode corresponder a qualquer um dos 12 EANs do cadastro.
        const product = products.find((p) =>
          [p.ean1, p.ean2, p.ean3, p.ean4, p.ean5, p.ean6, p.ean7, p.ean8, p.ean9, p.ean10, p.ean11, p.ean12]
            .some((productEan) => productEan && productEan === eanLido)
        );

        const codigoNaoCadastrado = eanLido || codLocalizador || codigoLv;

        counts.push({
          codLocalizador,
          ean: product?.ean1 || eanLido,
          quantidade,
          quantidadeAjustada: quantidade,
          lote,
          validade,
          codigoLv,
          descricaoLocalizador: product?.descricaoLocalizador || "",
          secao: product?.descricaoLocalizador || "",
          coletor: fileData.coletor,
          inventariador: fileData.inventariador,
          produto: product?.produto || codigoNaoCadastrado,
          descricao: product?.descricao1 || "Produto não cadastrado",
        });
      }
    }

    return counts;
  };

  const handleImport = async () => {
    if (files.length === 0) {
      toast.error("Nenhum arquivo selecionado");
      return;
    }

    const invalidFiles = files.filter((f) => !f.inventariador.trim());
    if (invalidFiles.length > 0) {
      toast.error("Preencha o nome do inventariador para todos os arquivos");
      return;
    }

    setIsProcessing(true);
    setProgress(null);

    try {
      const allCounts: Count[] = [];

      for (const fileData of files) {
        const counts = await parseCountFile(fileData);
        allCounts.push(...counts);
      }

      await addCounts(allCounts, (processed, total) => {
        setProgress({ current: processed, total });
      });

      toast.success(`${allCounts.length} itens importados com sucesso!`);
      setFiles([]);
      setProgress(null);
      onImportComplete?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao processar arquivos:", error);
      toast.error("Erro ao processar arquivos");
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Contagem</DialogTitle>
          <DialogDescription>
            Formato: CÓDIGO LOCALIZADOR, EAN, QTDE, LOTE, VALIDADE, CÓDIGO LV (separado por vírgula ou ponto e vírgula)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="count-files" className="cursor-pointer">
              <div className="border-2 border-dashed border-border rounded-lg p-6 hover:border-primary transition-colors">
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Clique para selecionar arquivos TXT ou arraste aqui
                  </p>
                </div>
              </div>
              <Input
                id="count-files"
                type="file"
                accept=".txt"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
            </Label>
          </div>

          {files.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold">Arquivos Selecionados:</h3>
              {files.map((fileData, index) => (
                <div
                  key={index}
                  className="border border-border rounded-lg p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{fileData.file.name}</p>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFile(index)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Coletor</Label>
                      <Select
                        value={fileData.coletor}
                        onValueChange={(value) =>
                          updateFileData(index, "coletor", value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 30 }, (_, i) => (
                            <SelectItem key={i} value={`C${i + 1}`}>
                              C{i + 1}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Inventariador</Label>
                      <Input
                        placeholder="Nome do inventariador"
                        value={fileData.inventariador}
                        onChange={(e) =>
                          updateFileData(index, "inventariador", e.target.value)
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {isProcessing && progress && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Salvando contagens...</span>
                <span>{progress.current.toLocaleString()} / {progress.total.toLocaleString()}</span>
              </div>
              <Progress value={(progress.current / progress.total) * 100} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                {Math.round((progress.current / progress.total) * 100)}% concluído
              </p>
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isProcessing}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleImport}
              disabled={files.length === 0 || isProcessing}
            >
              {isProcessing ? "Importando..." : "Importar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
