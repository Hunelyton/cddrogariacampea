import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Plus, ArrowUpDown, ArrowUp, ArrowDown, Trash2, Download, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAllCounts, Count, updateCountsByProduct, getProductByEan, addCounts, deleteCountsByProduct, getAllProducts } from "@/lib/indexedDB";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/use-debounce";

type SortField = keyof GroupedCount;
type SortDirection = "asc" | "desc" | null;

interface GroupedCount {
  produto: string;
  eans: string[];
  descricao: string;
  quantidadeEscaneada: number;
  quantidadeAjustada: number;
  secao: string;
  coletor: string;
  inventariador: string;
  controlado: string;
}

interface CountTableProps {
  refreshTrigger?: number;
  onUpdate?: () => void;
}

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
  onEdit: (produto: string, qty: number) => void;
  onSave: (produto: string) => void;
  onCancel: () => void;
  onDelete: (produto: string) => void;
  onTempQtyChange: (value: string) => void;
}) => (
  <TableRow>
    <TableCell>{group.produto}</TableCell>
    <TableCell>{group.eans[0] || ""}</TableCell>
    <TableCell>{group.eans[1] || ""}</TableCell>
    <TableCell>{group.eans[2] || ""}</TableCell>
    <TableCell>{group.descricao}</TableCell>
    <TableCell>{group.quantidadeEscaneada}</TableCell>
    <TableCell>
      {editingProduct === group.produto ? (
        <div className="flex gap-2">
          <Input
            type="number"
            value={tempAdjustedQty}
            onChange={(e) => onTempQtyChange(e.target.value)}
            className="w-20"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave(group.produto);
              if (e.key === "Escape") onCancel();
            }}
          />
          <Button size="sm" onClick={() => onSave(group.produto)}>
            ✓
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel}>
            ✕
          </Button>
        </div>
      ) : (
        <div 
          className="cursor-pointer hover:bg-muted/50 px-2 py-1 rounded"
          onClick={() => onEdit(group.produto, group.quantidadeAjustada)}
        >
          {group.quantidadeAjustada}
        </div>
      )}
    </TableCell>
    <TableCell>{group.secao}</TableCell>
    <TableCell>{group.coletor}</TableCell>
    <TableCell>{group.inventariador}</TableCell>
    <TableCell>
      <Button
        size="sm"
        variant="destructive"
        onClick={() => onDelete(group.produto)}
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
  const [showControlled, setShowControlled] = useState(false);
  const [showNotRegistered, setShowNotRegistered] = useState(false);
  const [counts, setCounts] = useState<Count[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [tempAdjustedQty, setTempAdjustedQty] = useState<string>("");
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const { toast } = useToast();

  // Debounce dos termos de busca
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const debouncedEanSearch = useDebounce(eanSearch, 300);
  const debouncedQtdSearch = useDebounce(qtdSearch, 300);

  // Reset página quando filtros mudam
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, debouncedEanSearch, debouncedQtdSearch, showControlled, showNotRegistered]);

  useEffect(() => {
    loadCounts();
  }, []);

  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      loadCounts();
    }
  }, [refreshTrigger]);

  const loadCounts = useCallback(async () => {
    setIsLoading(true);
    const data = await getAllCounts();
    
    const products = await getAllProducts();
    const productsMap = products.reduce((acc, product) => {
      acc[product.produto] = product;
      return acc;
    }, {} as Record<string, any>);
    
    const enrichedCounts = data.map(count => ({
      ...count,
      controlado: count.produto ? (productsMap[count.produto]?.controlado || "") : "",
    }));
    
    setCounts(enrichedCounts as Count[]);
    setIsLoading(false);
  }, []);

  // Agrupamento memoizado
  const groupedCounts = useMemo(() => {
    const grouped = counts.reduce((acc, count) => {
      const produto = count.produto || "N/A";
      
      if (!acc[produto]) {
        acc[produto] = {
          produto,
          eans: [],
          descricao: count.descricao || "",
          quantidadeEscaneada: 0,
          quantidadeAjustada: 0,
          secao: count.secao || "",
          coletor: count.coletor || "",
          inventariador: count.inventariador || "",
          controlado: (count as any).controlado || "",
        };
      }
      
      if (count.ean && !acc[produto].eans.includes(count.ean)) {
        acc[produto].eans.push(count.ean);
      }
      
      acc[produto].quantidadeEscaneada += parseInt(count.quantidade) || 0;
      acc[produto].quantidadeAjustada += parseInt(count.quantidadeAjustada || count.quantidade) || 0;
      
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
        group.eans.some(ean => ean?.toLowerCase().includes(search)) ||
        group.descricao?.toLowerCase().includes(search) ||
        group.coletor?.toLowerCase().includes(search) ||
        group.inventariador?.toLowerCase().includes(search);

      const matchesEan = !debouncedEanSearch || group.eans.some(ean => ean?.includes(debouncedEanSearch));
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
      
      if (sortField === "eans") {
        const aStr = (aValue as string[]).join(",");
        const bStr = (bValue as string[]).join(",");
        const comparison = aStr.localeCompare(bStr);
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

  const handleAdjustedQtyEdit = useCallback((produto: string, currentQty: number) => {
    setEditingProduct(produto);
    setTempAdjustedQty(currentQty.toString());
  }, []);

  const handleAdjustedQtySave = useCallback(async (produto: string) => {
    try {
      await updateCountsByProduct(produto, tempAdjustedQty);
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
  }, [tempAdjustedQty, loadCounts, onUpdate, toast]);

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
        ean: eanSearch,
        quantidade: qtdSearch,
        quantidadeAjustada: qtdSearch,
        secao: "MAN01",
        coletor: "MANUAL",
        inventariador: "MANUAL",
        produto: product.produto,
        descricao: product.descricao1,
      };

      await addCounts([newCount]);
      await loadCounts();
      
      setEanSearch("");
      setQtdSearch("");
      
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
  }, [eanSearch, qtdSearch, loadCounts, toast]);

  const handleDeleteProduct = useCallback(async (produto: string) => {
    if (!confirm(`Deseja realmente excluir todas as contagens do produto ${produto}?`)) {
      return;
    }

    try {
      await deleteCountsByProduct(produto);
      await loadCounts();
      toast({
        title: "Produto excluído",
        description: "Todas as contagens do produto foram removidas.",
      });
    } catch (error) {
      toast({
        title: "Erro ao excluir",
        description: "Não foi possível excluir o produto.",
        variant: "destructive",
      });
    }
  }, [loadCounts, toast]);

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
        const ean = group.eans[0] || "";
        const secao = group.secao || "";
        return `${ean};${group.quantidadeAjustada};${secao}`;
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
        const ean = group.eans[0] || "";
        const secao = group.secao || "";
        return `${ean},${group.quantidadeAjustada},${secao}`;
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

  const handleTempQtyChange = useCallback((value: string) => {
    setTempAdjustedQty(value);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
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
        
        <Input
          type="text"
          placeholder="EAN"
          value={eanSearch}
          onChange={(e) => setEanSearch(e.target.value)}
          className="w-full md:w-40"
        />
        
        <Input
          type="text"
          placeholder="Qtd"
          value={qtdSearch}
          onChange={(e) => setQtdSearch(e.target.value)}
          className="w-full md:w-24"
        />
        
        <Button 
          onClick={handleAddCount}
          className="bg-success-green hover:bg-success-green/90 text-success-green-foreground w-full md:w-auto"
        >
          <Plus className="w-4 h-4 mr-2" />
          Adicionar
        </Button>

        <Button 
          onClick={handleExportTxt}
          variant="outline"
          className="w-full md:w-auto"
        >
          <Download className="w-4 h-4 mr-2" />
          Exportar TXT (;)
        </Button>

        <Button 
          onClick={handleExportTxtComma}
          variant="outline"
          className="w-full md:w-auto"
        >
          <Download className="w-4 h-4 mr-2" />
          Exportar TXT (,)
        </Button>
        
        <div className="flex flex-col gap-2">
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
              Mostrar não cadastrados
            </label>
          </div>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("produto")}>
                  <div className="flex items-center gap-2">
                    PRODUTO {getSortIcon("produto")}
                  </div>
                </TableHead>
                <TableHead>EAN 1</TableHead>
                <TableHead>EAN 2</TableHead>
                <TableHead>EAN 3</TableHead>
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
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("secao")}>
                  <div className="flex items-center gap-2">
                    SEÇÃO {getSortIcon("secao")}
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
                  <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">
                    Carregando contagens...
                  </TableCell>
                </TableRow>
              ) : paginatedCounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">
                    Nenhuma contagem registrada. Utilize o botão "Importar contagem" para adicionar dados.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedCounts.map((group) => (
                  <CountRow
                    key={group.produto}
                    group={group}
                    editingProduct={editingProduct}
                    tempAdjustedQty={tempAdjustedQty}
                    onEdit={handleAdjustedQtyEdit}
                    onSave={handleAdjustedQtySave}
                    onCancel={handleAdjustedQtyCancel}
                    onDelete={handleDeleteProduct}
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
    </div>
  );
});

CountTable.displayName = "CountTable";
