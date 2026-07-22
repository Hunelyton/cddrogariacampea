import { useState, useEffect, useMemo, useCallback, memo } from "react";
import * as XLSX from "xlsx";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, Plus, ArrowUpDown, ArrowUp, ArrowDown, Trash2, Download, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAllCounts, Count, Product, updateCountsByProduct, getProductByEan, addCounts, deleteCountsByProduct, getAllProducts } from "@/lib/indexedDB";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/use-debounce";
import logoDrogaria from "@/assets/logo-drogaria-campea.png";

type SortField = keyof GroupedCount;
type SortDirection = "asc" | "desc" | null;

interface GroupedCount {
  groupKey: string;
  produto: string;
  ean1: string;
  descricao: string;
  codLocalizador: string;
  quantidadeEscaneada: number;
  quantidadeAjustada: number;
  lote: string;
  validade: string;
  codigoLv: string;
  descricaoLocalizador: string;
  coletor: string;
  inventariador: string;
  controlado: string;
}

interface CountTableProps {
  refreshTrigger?: number;
  onUpdate?: () => void;
}

type EnrichedCount = Count & { controlado: string };

const PAGE_SIZE = 50;

// Componente de linha memoizado
const CountRow = memo(({ 
  group, 
  editingProduct, 
  tempAdjustedQty, 
  onEdit, 
  onSave, 
  onCancel, 
  onDelete,
  onTempQtyChange 
}: { 
  group: GroupedCount;
  editingProduct: string | null;
  tempAdjustedQty: string;
  onEdit: (groupKey: string, qty: number) => void;
  onSave: (groupKey: string) => void;
  onCancel: () => void;
  onDelete: (group: GroupedCount) => void;
  onTempQtyChange: (value: string) => void;
}) => (
  <TableRow>
    <TableCell>
      <div>{group.codLocalizador || "-"}</div>
      <div className="text-xs text-muted-foreground">
        {group.descricaoLocalizador || "-"}
      </div>
    </TableCell>
    <TableCell>{group.codigoLv || "-"}</TableCell>
    <TableCell>{group.produto}</TableCell>
    <TableCell>{group.ean1}</TableCell>
    <TableCell>{group.descricao}</TableCell>
    <TableCell>{group.quantidadeEscaneada}</TableCell>
    <TableCell>
      {editingProduct === group.groupKey ? (
        <div className="flex gap-2">
          <Input
            type="number"
            value={tempAdjustedQty}
            onChange={(e) => onTempQtyChange(e.target.value)}
            className="w-20"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave(group.groupKey);
              if (e.key === "Escape") onCancel();
            }}
          />
          <Button size="sm" onClick={() => onSave(group.groupKey)}>
            ✓
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel}>
            ✕
          </Button>
        </div>
      ) : (
        <div 
          className="cursor-pointer hover:bg-muted/50 px-2 py-1 rounded"
          onClick={() => onEdit(group.groupKey, group.quantidadeAjustada)}
        >
          {group.quantidadeAjustada}
        </div>
      )}
    </TableCell>
    <TableCell>{group.lote || "-"}</TableCell>
    <TableCell>{group.validade || "-"}</TableCell>
    <TableCell>{group.coletor}</TableCell>
    <TableCell>{group.inventariador}</TableCell>
    <TableCell>
      <Button
        size="sm"
        variant="destructive"
        onClick={() => onDelete(group)}
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </TableCell>
  </TableRow>
));

CountRow.displayName = "CountRow";

export const CountTable = memo(({ refreshTrigger, onUpdate }: CountTableProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [eanSearch, setEanSearch] = useState("");
  const [qtdSearch, setQtdSearch] = useState("");
  const [codLocalizadorSearch, setCodLocalizadorSearch] = useState("");
  const [loteSearch, setLoteSearch] = useState("");
  const [validadeSearch, setValidadeSearch] = useState("");
  const [codigoLvSearch, setCodigoLvSearch] = useState("");
  const [showControlled, setShowControlled] = useState(false);
  const [showNotRegistered, setShowNotRegistered] = useState(false);
  const [counts, setCounts] = useState<EnrichedCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [tempAdjustedQty, setTempAdjustedQty] = useState<string>("");
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pendingDeletion, setPendingDeletion] = useState<GroupedCount | null>(null);
  const { toast } = useToast();

  // Debounce dos termos de busca
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const debouncedEanSearch = useDebounce(eanSearch, 300);
  const debouncedQtdSearch = useDebounce(qtdSearch, 300);

  // Reset página quando filtros mudam
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, debouncedEanSearch, debouncedQtdSearch, showControlled, showNotRegistered]);

  const loadCounts = useCallback(async () => {
    setIsLoading(true);
    const data = await getAllCounts();
    
    const products = await getAllProducts();
    const productsMap = products.reduce((acc, product) => {
      acc[product.produto] = product;
      return acc;
    }, {} as Record<string, Product>);
    
    const enrichedCounts = data.map(count => ({
      ...count,
      controlado: count.produto ? (productsMap[count.produto]?.controlado || "") : "",
      descricaoLocalizador: count.produto
        ? (productsMap[count.produto]?.descricaoLocalizador || count.descricaoLocalizador || "")
        : (count.descricaoLocalizador || ""),
    }));
    
    setCounts(enrichedCounts);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      loadCounts();
    }
  }, [refreshTrigger, loadCounts]);

  // Agrupamento memoizado
  const groupedCounts = useMemo(() => {
    const grouped = counts.reduce((acc, count) => {
      const produto = count.produto || "N/A";
      const lote = count.lote?.trim() || "";
      const groupKey = `${produto}\u0000${lote}`;
      
      if (!acc[groupKey]) {
        acc[groupKey] = {
          groupKey,
          produto,
          ean1: count.ean || "",
          descricao: count.descricao || "",
          codLocalizador: count.codLocalizador || "",
          quantidadeEscaneada: 0,
          quantidadeAjustada: 0,
          lote,
          validade: count.validade || "",
          codigoLv: count.codigoLv || "",
          descricaoLocalizador: count.descricaoLocalizador || "",
          coletor: count.coletor || "",
          inventariador: count.inventariador || "",
          controlado: count.controlado || "",
        };
      }
      
      acc[groupKey].quantidadeEscaneada += parseInt(count.quantidade) || 0;
      acc[groupKey].quantidadeAjustada += parseInt(count.quantidadeAjustada || count.quantidade) || 0;
      
      return acc;
    }, {} as Record<string, GroupedCount>);

    return Object.values(grouped);
  }, [counts]);

  // Filtro memoizado com debounce
  const filteredGroupedCounts = useMemo(() => {
    return groupedCounts.filter((group) => {
      const search = debouncedSearchTerm.toLowerCase();
      const matchesSearch =
        group.produto?.toLowerCase().includes(search) ||
        group.ean1?.toLowerCase().includes(search) ||
        group.descricao?.toLowerCase().includes(search) ||
        group.codLocalizador?.toLowerCase().includes(search) ||
        group.lote?.toLowerCase().includes(search) ||
        group.validade?.toLowerCase().includes(search) ||
        group.codigoLv?.toLowerCase().includes(search) ||
        group.descricaoLocalizador?.toLowerCase().includes(search) ||
        group.coletor?.toLowerCase().includes(search) ||
        group.inventariador?.toLowerCase().includes(search);

      const matchesEan = !debouncedEanSearch || group.ean1?.includes(debouncedEanSearch);
      const matchesQtd = !debouncedQtdSearch || 
        group.quantidadeEscaneada.toString().includes(debouncedQtdSearch) ||
        group.quantidadeAjustada.toString().includes(debouncedQtdSearch);

      const isControlled = group.controlado?.toLowerCase() === 's' || group.controlado?.toLowerCase() === 'sim';
      const matchesControlled = !showControlled || isControlled;

      const isNotRegistered = group.descricao === "Produto não cadastrado";
      const matchesNotRegistered = !showNotRegistered || isNotRegistered;

      return matchesSearch && matchesEan && matchesQtd && matchesControlled && matchesNotRegistered;
    });
  }, [groupedCounts, debouncedSearchTerm, debouncedEanSearch, debouncedQtdSearch, showControlled, showNotRegistered]);

  const handleSort = useCallback((field: SortField) => {
    setSortField(prevField => {
      if (prevField === field) {
        setSortDirection(prevDir => {
          if (prevDir === "asc") return "desc";
          if (prevDir === "desc") {
            setSortField(null);
            return null;
          }
          return "asc";
        });
        return prevField;
      }
      setSortDirection("asc");
      return field;
    });
    setCurrentPage(1);
  }, []);

  const getSortIcon = useCallback((field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="w-4 h-4" />;
    if (sortDirection === "asc") return <ArrowUp className="w-4 h-4" />;
    if (sortDirection === "desc") return <ArrowDown className="w-4 h-4" />;
    return <ArrowUpDown className="w-4 h-4" />;
  }, [sortField, sortDirection]);

  // Ordenação memoizada
  const sortedGroupedCounts = useMemo(() => {
    if (!sortField || !sortDirection) return filteredGroupedCounts;
    
    return [...filteredGroupedCounts].sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      
      if (sortField === "quantidadeEscaneada" || sortField === "quantidadeAjustada") {
        const comparison = (aValue as number) - (bValue as number);
        return sortDirection === "asc" ? comparison : -comparison;
      }
      
      const comparison = (aValue || "").toString().localeCompare((bValue || "").toString(), undefined, { numeric: true });
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [filteredGroupedCounts, sortField, sortDirection]);

  // Paginação memoizada
  const totalPages = Math.ceil(sortedGroupedCounts.length / PAGE_SIZE);
  const paginatedCounts = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sortedGroupedCounts.slice(start, start + PAGE_SIZE);
  }, [sortedGroupedCounts, currentPage]);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  }, [totalPages]);

  const handleAdjustedQtyEdit = useCallback((groupKey: string, currentQty: number) => {
    setEditingProduct(groupKey);
    setTempAdjustedQty(currentQty.toString());
  }, []);

  const handleAdjustedQtySave = useCallback(async (groupKey: string) => {
    try {
      const group = groupedCounts.find((item) => item.groupKey === groupKey);
      if (!group) return;
      await updateCountsByProduct(group.produto, tempAdjustedQty, group.lote);
      await loadCounts();
      setEditingProduct(null);
      onUpdate?.();
      toast({
        title: "Quantidade ajustada atualizada",
        description: "A quantidade foi atualizada com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar a quantidade ajustada.",
        variant: "destructive",
      });
    }
  }, [groupedCounts, tempAdjustedQty, loadCounts, onUpdate, toast]);

  const handleAdjustedQtyCancel = useCallback(() => {
    setEditingProduct(null);
    setTempAdjustedQty("");
  }, []);

  const handleAddCount = useCallback(async () => {
    if (!eanSearch || !qtdSearch) {
      toast({
        title: "Campos obrigatórios",
        description: "Por favor, preencha o EAN e a quantidade.",
        variant: "destructive",
      });
      return;
    }

    try {
      const product = await getProductByEan(eanSearch);
      
      if (!product) {
        toast({
          title: "Produto não encontrado",
          description: "Não foi possível encontrar um produto com este EAN.",
          variant: "destructive",
        });
        return;
      }

      const newCount: Count = {
        codLocalizador: codLocalizadorSearch,
        ean: product.ean1 || eanSearch,
        quantidade: qtdSearch,
        quantidadeAjustada: qtdSearch,
        lote: loteSearch,
        validade: validadeSearch,
        codigoLv: codigoLvSearch,
        descricaoLocalizador: product.descricaoLocalizador || "",
        secao: product.descricaoLocalizador || "",
        coletor: "MANUAL",
        inventariador: "MANUAL",
        produto: product.produto,
        descricao: product.descricao1,
      };

      await addCounts([newCount]);
      await loadCounts();
      onUpdate?.();
      
      setEanSearch("");
      setQtdSearch("");
      setCodLocalizadorSearch("");
      setLoteSearch("");
      setValidadeSearch("");
      setCodigoLvSearch("");
      
      toast({
        title: "Item adicionado",
        description: "A contagem foi adicionada com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Erro ao adicionar",
        description: "Não foi possível adicionar a contagem.",
        variant: "destructive",
      });
    }
  }, [codLocalizadorSearch, eanSearch, qtdSearch, loteSearch, validadeSearch, codigoLvSearch, loadCounts, onUpdate, toast]);

  const handleDeleteProduct = useCallback(async (group: GroupedCount) => {
    try {
      await deleteCountsByProduct(group.produto, group.lote);
      await loadCounts();
      onUpdate?.();
      toast({
        title: "CD DROGARIAS CAMPEÃ — Produto excluído",
        description: "As contagens deste produto e lote foram removidas.",
      });
    } catch (error) {
      toast({
        title: "Erro ao excluir",
        description: "Não foi possível excluir o produto.",
        variant: "destructive",
      });
    } finally {
      setPendingDeletion(null);
    }
  }, [loadCounts, onUpdate, toast]);

  const handleExportTxt = useCallback(() => {
    if (sortedGroupedCounts.length === 0) {
      toast({
        title: "Sem dados",
        description: "Não há contagens para exportar.",
        variant: "destructive",
      });
      return;
    }

    const txtContent = sortedGroupedCounts
      .map((group) => {
        return [
          group.codLocalizador,
          group.ean1,
          group.quantidadeAjustada,
          group.lote,
          group.validade,
          group.codigoLv,
        ].join(";");
      })
      .join("\n");

    const blob = new Blob([txtContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `contagem_${new Date().toISOString().split("T")[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Arquivo exportado",
      description: "O arquivo TXT foi baixado com sucesso.",
    });
  }, [sortedGroupedCounts, toast]);

  const handleExportTxtComma = useCallback(() => {
    if (sortedGroupedCounts.length === 0) {
      toast({
        title: "Sem dados",
        description: "Não há contagens para exportar.",
        variant: "destructive",
      });
      return;
    }

    const txtContent = sortedGroupedCounts
      .map((group) => {
        return [
          group.codLocalizador,
          group.ean1,
          group.quantidadeAjustada,
          group.lote,
          group.validade,
          group.codigoLv,
        ].join(",");
      })
      .join("\n");

    const blob = new Blob([txtContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `contagem_virgula_${new Date().toISOString().split("T")[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Arquivo exportado",
      description: "O arquivo TXT com vírgula foi baixado com sucesso.",
    });
  }, [sortedGroupedCounts, toast]);

  const handleExportExcel = useCallback(() => {
    if (sortedGroupedCounts.length === 0) {
      toast({
        title: "Sem dados",
        description: "Não há contagens para exportar.",
        variant: "destructive",
      });
      return;
    }

    const rows = sortedGroupedCounts.map((group) => ({
      LOCALIZADOR: group.codLocalizador,
      "DESCRIÇÃO LOCALIZADOR": group.descricaoLocalizador,
      "CÓDIGO LV": group.codigoLv,
      PRODUTO: group.produto,
      "EAN 1": group.ean1,
      "DESCRIÇÃO": group.descricao,
      "QUANTIDADE ESCANEADA": group.quantidadeEscaneada,
      "QUANTIDADE AJUSTADA": group.quantidadeAjustada,
      LOTE: group.lote,
      VALIDADE: group.validade,
      COLETOR: group.coletor,
      INVENTARIADOR: group.inventariador,
      CONTROLADO: group.controlado,
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet["!cols"] = [
      { wch: 18 }, { wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 18 },
      { wch: 40 }, { wch: 22 }, { wch: 21 }, { wch: 18 }, { wch: 16 },
      { wch: 12 }, { wch: 24 }, { wch: 12 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Contagem");
    XLSX.writeFile(
      workbook,
      `contagem_filtrada_${new Date().toISOString().split("T")[0]}.xlsx`
    );

    toast({
      title: "Planilha exportada",
      description: `${rows.length} registros foram exportados para Excel.`,
    });
  }, [sortedGroupedCounts, toast]);

  const handleTempQtyChange = useCallback((value: string) => {
    setTempAdjustedQty(value);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            type="text"
            placeholder="Pesquisar geral"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="show-controlled"
              checked={showControlled}
              onCheckedChange={(checked) => setShowControlled(checked as boolean)}
            />
            <label
              htmlFor="show-controlled"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Mostrar controlados
            </label>
          </div>
          
          <div className="flex items-center gap-2">
            <Checkbox
              id="show-not-registered"
              checked={showNotRegistered}
              onCheckedChange={(checked) => setShowNotRegistered(checked as boolean)}
            />
            <label
              htmlFor="show-not-registered"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              MOSTRAR SOMENTE NÃO CADASTRADOS
            </label>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-3">
        <h3 className="font-semibold">Inserção manual</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <Input
            type="text"
            placeholder="Código localizador"
            value={codLocalizadorSearch}
            onChange={(e) => setCodLocalizadorSearch(e.target.value)}
          />
          <Input
            type="text"
            placeholder="EAN *"
            value={eanSearch}
            onChange={(e) => setEanSearch(e.target.value)}
          />
          <Input
            type="number"
            placeholder="Quantidade *"
            value={qtdSearch}
            onChange={(e) => setQtdSearch(e.target.value)}
          />
          <Input
            type="text"
            placeholder="Lote"
            value={loteSearch}
            onChange={(e) => setLoteSearch(e.target.value)}
          />
          <Input
            type="text"
            placeholder="Validade"
            value={validadeSearch}
            onChange={(e) => setValidadeSearch(e.target.value)}
          />
          <Input
            type="text"
            placeholder="Código LV"
            value={codigoLvSearch}
            onChange={(e) => setCodigoLvSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:justify-between">
          <p className="text-xs text-muted-foreground">* Campos obrigatórios. O EAN é comparado com os 12 EANs do cadastro.</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={handleAddCount}
              className="bg-success-green hover:bg-success-green/90 text-success-green-foreground"
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar
            </Button>
            <Button onClick={handleExportTxt} variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Exportar TXT (;)
            </Button>
            <Button onClick={handleExportTxtComma} variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Exportar TXT (,)
            </Button>
            <Button onClick={handleExportExcel} variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Exportar Excel
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("codLocalizador")}>
                  <div className="flex items-center gap-2">
                    LOCALIZADOR {getSortIcon("codLocalizador")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("codigoLv")}>
                  <div className="flex items-center gap-2">
                    CÓDIGO LV {getSortIcon("codigoLv")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("produto")}>
                  <div className="flex items-center gap-2">
                    PRODUTO {getSortIcon("produto")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("ean1")}>
                  <div className="flex items-center gap-2">
                    EAN 1 {getSortIcon("ean1")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("descricao")}>
                  <div className="flex items-center gap-2">
                    DESCRIÇÃO {getSortIcon("descricao")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("quantidadeEscaneada")}>
                  <div className="flex items-center gap-2">
                    QUANTIDADE ESCANEADA {getSortIcon("quantidadeEscaneada")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("quantidadeAjustada")}>
                  <div className="flex items-center gap-2">
                    QUANTIDADE AJUSTADA {getSortIcon("quantidadeAjustada")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("lote")}>
                  <div className="flex items-center gap-2">
                    LOTE {getSortIcon("lote")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("validade")}>
                  <div className="flex items-center gap-2">
                    VALIDADE {getSortIcon("validade")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("coletor")}>
                  <div className="flex items-center gap-2">
                    COLETOR {getSortIcon("coletor")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("inventariador")}>
                  <div className="flex items-center gap-2">
                    INVENTARIADOR {getSortIcon("inventariador")}
                  </div>
                </TableHead>
                <TableHead>AÇÕES</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-12 text-muted-foreground">
                    Carregando contagens...
                  </TableCell>
                </TableRow>
              ) : paginatedCounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-12 text-muted-foreground">
                    Nenhuma contagem registrada. Utilize o botão "Importar contagem" para adicionar dados.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedCounts.map((group) => (
                  <CountRow
                    key={group.groupKey}
                    group={group}
                    editingProduct={editingProduct}
                    tempAdjustedQty={tempAdjustedQty}
                    onEdit={handleAdjustedQtyEdit}
                    onSave={handleAdjustedQtySave}
                    onCancel={handleAdjustedQtyCancel}
                    onDelete={setPendingDeletion}
                    onTempQtyChange={handleTempQtyChange}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
            <div className="text-sm text-muted-foreground">
              Mostrando {(currentPage - 1) * PAGE_SIZE + 1} - {Math.min(currentPage * PAGE_SIZE, sortedGroupedCounts.length)} de {sortedGroupedCounts.length} contagens
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(1)}
                disabled={currentPage === 1}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm px-2">
                Página {currentPage} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(totalPages)}
                disabled={currentPage === totalPages}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <AlertDialog
        open={pendingDeletion !== null}
        onOpenChange={(open) => !open && setPendingDeletion(null)}
      >
        <AlertDialogContent className="max-w-xl">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 border-b pb-4">
              <img
                src={logoDrogaria}
                alt="Logo CD Drogarias Campeã"
                className="h-12 w-auto"
              />
              <div>
                <p className="text-xs font-medium text-muted-foreground">CONFIRMAÇÃO DE EXCLUSÃO</p>
                <AlertDialogTitle>CD DROGARIAS CAMPEÃ</AlertDialogTitle>
              </div>
            </div>
            <AlertDialogDescription className="pt-2">
              Deseja realmente excluir as contagens deste produto e lote?
            </AlertDialogDescription>
          </AlertDialogHeader>

          {pendingDeletion && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">PRODUTO</p>
                <p className="font-medium">{pendingDeletion.produto || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">EAN</p>
                <p className="font-medium">{pendingDeletion.ean1 || "-"}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">DESCRIÇÃO</p>
                <p className="font-medium">{pendingDeletion.descricao || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">LOTE</p>
                <p className="font-medium">{pendingDeletion.lote || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">VALIDADE</p>
                <p className="font-medium">{pendingDeletion.validade || "-"}</p>
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDeletion && handleDeleteProduct(pendingDeletion)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir contagens
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});

CountTable.displayName = "CountTable";
