import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { Input } from "@/components/ui/input";
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { getAllProducts, Product } from "@/lib/indexedDB";
import { useDebounce } from "@/hooks/use-debounce";

type SortField = keyof Product;
type SortDirection = "asc" | "desc" | null;

interface ProductsTableProps {
  refreshTrigger?: number;
}

const PAGE_SIZE = 50;

// Componente de linha memoizado
const ProductRow = memo(({ product }: { product: Product }) => (
  <TableRow>
    <TableCell>{product.empresa}</TableCell>
    <TableCell>{product.produto}</TableCell>
    <TableCell>{product.descricao1}</TableCell>
    <TableCell>{product.saldo}</TableCell>
    <TableCell>{product.controlado}</TableCell>
    <TableCell>{product.custoGerencial}</TableCell>
    <TableCell>{product.ean1}</TableCell>
    <TableCell>{product.ean2}</TableCell>
    <TableCell>{product.ean3}</TableCell>
    <TableCell>{product.ean4}</TableCell>
    <TableCell>{product.ean5}</TableCell>
    <TableCell>{product.ean6}</TableCell>
    <TableCell>{product.ean7}</TableCell>
    <TableCell>{product.ean8}</TableCell>
    <TableCell>{product.ean9}</TableCell>
    <TableCell>{product.ean10}</TableCell>
    <TableCell>{product.ean11}</TableCell>
    <TableCell>{product.ean12}</TableCell>
    <TableCell>{product.lote}</TableCell>
    <TableCell>{product.validade}</TableCell>
    <TableCell>{product.codLocalizador}</TableCell>
    <TableCell>{product.descricaoLocalizador}</TableCell>
    <TableCell>{product.codigoLv}</TableCell>
  </TableRow>
));

ProductRow.displayName = "ProductRow";

export const ProductsTable = memo(({ refreshTrigger }: ProductsTableProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Debounce do termo de busca
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Reset página quando buscar
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm]);

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      loadProducts();
    }
  }, [refreshTrigger]);

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    const data = await getAllProducts();
    setProducts(data);
    setIsLoading(false);
  }, []);

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
    setCurrentPage(1); // Reset ao ordenar
  }, []);

  const getSortIcon = useCallback((field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="w-4 h-4" />;
    if (sortDirection === "asc") return <ArrowUp className="w-4 h-4" />;
    if (sortDirection === "desc") return <ArrowDown className="w-4 h-4" />;
    return <ArrowUpDown className="w-4 h-4" />;
  }, [sortField, sortDirection]);

  // Filtro memoizado com debounce
  const filteredProducts = useMemo(() => {
    const search = debouncedSearchTerm.toLowerCase();
    if (!search) return products;
    
    return products.filter((product) => (
      product.produto?.toLowerCase().includes(search) ||
      product.descricao1?.toLowerCase().includes(search) ||
      product.ean1?.toLowerCase().includes(search) ||
      product.ean2?.toLowerCase().includes(search) ||
      product.ean3?.toLowerCase().includes(search) ||
      product.ean4?.toLowerCase().includes(search) ||
      product.ean5?.toLowerCase().includes(search) ||
      product.ean6?.toLowerCase().includes(search) ||
      product.ean7?.toLowerCase().includes(search) ||
      product.ean8?.toLowerCase().includes(search) ||
      product.ean9?.toLowerCase().includes(search) ||
      product.ean10?.toLowerCase().includes(search) ||
      product.ean11?.toLowerCase().includes(search) ||
      product.ean12?.toLowerCase().includes(search)
    ));
  }, [products, debouncedSearchTerm]);

  // Ordenação memoizada
  const sortedProducts = useMemo(() => {
    if (!sortField || !sortDirection) return filteredProducts;
    
    return [...filteredProducts].sort((a, b) => {
      const aValue = a[sortField] || "";
      const bValue = b[sortField] || "";
      
      const comparison = aValue.toString().localeCompare(bValue.toString(), undefined, { numeric: true });
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [filteredProducts, sortField, sortDirection]);

  // Paginação memoizada
  const totalPages = Math.ceil(sortedProducts.length / PAGE_SIZE);
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sortedProducts.slice(start, start + PAGE_SIZE);
  }, [sortedProducts, currentPage]);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  }, [totalPages]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input
          type="text"
          placeholder="Buscar por produto, descrição ou EAN..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="rounded-md border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("empresa")}>
                  <div className="flex items-center gap-2">
                    EMPRESA {getSortIcon("empresa")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("produto")}>
                  <div className="flex items-center gap-2">
                    PRODUTO {getSortIcon("produto")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("descricao1")}>
                  <div className="flex items-center gap-2">
                    DESCRIÇÃO 1 {getSortIcon("descricao1")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("saldo")}>
                  <div className="flex items-center gap-2">
                    SALDO {getSortIcon("saldo")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("controlado")}>
                  <div className="flex items-center gap-2">
                    CONTROLADO {getSortIcon("controlado")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("custoGerencial")}>
                  <div className="flex items-center gap-2">
                    CUSTO GERENCIAL {getSortIcon("custoGerencial")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("ean1")}>
                  <div className="flex items-center gap-2">
                    EAN 1 {getSortIcon("ean1")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("ean2")}>
                  <div className="flex items-center gap-2">
                    EAN 2 {getSortIcon("ean2")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("ean3")}>
                  <div className="flex items-center gap-2">
                    EAN 3 {getSortIcon("ean3")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("ean4")}>
                  <div className="flex items-center gap-2">
                    EAN 4 {getSortIcon("ean4")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("ean5")}>
                  <div className="flex items-center gap-2">
                    EAN 5 {getSortIcon("ean5")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("ean6")}>
                  <div className="flex items-center gap-2">
                    EAN 6 {getSortIcon("ean6")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("ean7")}>
                  <div className="flex items-center gap-2">
                    EAN 7 {getSortIcon("ean7")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("ean8")}>
                  <div className="flex items-center gap-2">
                    EAN 8 {getSortIcon("ean8")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("ean9")}>
                  <div className="flex items-center gap-2">
                    EAN 9 {getSortIcon("ean9")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("ean10")}>
                  <div className="flex items-center gap-2">
                    EAN 10 {getSortIcon("ean10")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("ean11")}>
                  <div className="flex items-center gap-2">
                    EAN 11 {getSortIcon("ean11")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("ean12")}>
                  <div className="flex items-center gap-2">
                    EAN 12 {getSortIcon("ean12")}
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
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("codLocalizador")}>
                  <div className="flex items-center gap-2">
                    COD. LOCALIZADOR {getSortIcon("codLocalizador")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("descricaoLocalizador")}>
                  <div className="flex items-center gap-2">
                    DESCRIÇÃO LOCALIZADOR {getSortIcon("descricaoLocalizador")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("codigoLv")}>
                  <div className="flex items-center gap-2">
                    CÓDIGO LV {getSortIcon("codigoLv")}
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={23} className="text-center py-12 text-muted-foreground">
                    Carregando produtos...
                  </TableCell>
                </TableRow>
              ) : paginatedProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={23} className="text-center py-12 text-muted-foreground">
                    Nenhum produto cadastrado. Utilize o botão "Importar cadastro" para começar.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedProducts.map((product) => (
                  <ProductRow key={product.id} product={product} />
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
            <div className="text-sm text-muted-foreground">
              Mostrando {(currentPage - 1) * PAGE_SIZE + 1} - {Math.min(currentPage * PAGE_SIZE, sortedProducts.length)} de {sortedProducts.length} produtos
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

ProductsTable.displayName = "ProductsTable";
