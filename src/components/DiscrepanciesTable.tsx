import { useState, useEffect, useMemo, useCallback, memo } from "react";
import * as XLSX from "xlsx";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, FileDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import pdfMake from "pdfmake/build/pdfmake";
import type { TDocumentDefinitions } from "pdfmake/interfaces";
// @ts-expect-error O módulo de fontes não expõe tipos compatíveis com o build do pdfMake.
import pdfFonts from "pdfmake/build/vfs_fonts";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAllProducts, getAllCounts } from "@/lib/indexedDB";
import { parseBRNumber } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";

type SortField = "codLocalizador" | "descricaoLocalizador" | "codigoLv" | "produto" | "ean1" | "descricao" | "lote" | "validade" | "coletor" | "inventariador" | "custo" | "qtdeLoja" | "qtdeEscaneada" | "qtdeDivergente" | "valorDiferenca";
type SortDirection = "asc" | "desc" | null;

interface Discrepancy {
  codLocalizador: string;
  descricaoLocalizador: string;
  codigoLv: string;
  produto: string;
  ean1: string;
  descricao: string;
  lote: string;
  validade: string;
  coletor: string;
  inventariador: string;
  custo: number;
  qtdeLoja: number;
  qtdeEscaneada: number;
  qtdeDivergente: number;
  valorDiferenca: number;
  controlado: string;
}

interface CountLotGroup {
  produto: string;
  quantidadeAjustada: number;
  codLocalizador: string;
  codigoLv: string;
  lote: string;
  validade: string;
  coletor: string;
  inventariador: string;
  descricao: string;
  ean: string;
}

const normalizeLot = (lot?: string) => lot?.trim().toUpperCase() || "";
const countLotKey = (produto: string, lote?: string) => `${produto}\u0000${normalizeLot(lote)}`;

const PAGE_SIZE = 50;

// Componente de linha memoizado
const DiscrepancyRow = memo(({ disc }: { disc: Discrepancy }) => (
  <TableRow>
    <TableCell>
      <div>{disc.codLocalizador || "-"}</div>
      <div className="text-xs text-muted-foreground">
        {disc.descricaoLocalizador || "-"}
      </div>
    </TableCell>
    <TableCell>{disc.codigoLv || "-"}</TableCell>
    <TableCell>{disc.produto}</TableCell>
    <TableCell>{disc.ean1}</TableCell>
    <TableCell>{disc.descricao}</TableCell>
    <TableCell>{disc.lote || "-"}</TableCell>
    <TableCell>{disc.validade || "-"}</TableCell>
    <TableCell>{disc.coletor}</TableCell>
    <TableCell>{disc.inventariador}</TableCell>
    <TableCell>R$ {disc.custo.toFixed(2)}</TableCell>
    <TableCell>{disc.qtdeLoja}</TableCell>
    <TableCell>{disc.qtdeEscaneada}</TableCell>
    <TableCell className={disc.qtdeDivergente > 0 ? "text-green-600" : "text-red-600"}>
      {disc.qtdeDivergente}
    </TableCell>
    <TableCell className={disc.valorDiferenca > 0 ? "text-green-600" : "text-red-600"}>
      R$ {disc.valorDiferenca.toFixed(2)}
    </TableCell>
  </TableRow>
));

DiscrepancyRow.displayName = "DiscrepancyRow";

export const DiscrepanciesTable = memo(() => {
  const [searchTerm, setSearchTerm] = useState("");
  const [showControlled, setShowControlled] = useState(false);
  const [showNotRegistered, setShowNotRegistered] = useState(false);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  // Debounce do termo de busca
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Reset página quando filtros mudam
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, showControlled, showNotRegistered]);

  const loadDiscrepancies = useCallback(async () => {
    setIsLoading(true);
    const products = await getAllProducts();
    const counts = await getAllCounts();

    // Cada lote do mesmo produto é uma contagem independente.
    const countsByLot = counts.reduce((acc, count) => {
      const produto = count.produto || "N/A";
      const lote = count.lote?.trim() || "";
      const key = countLotKey(produto, lote);
      if (!acc[key]) {
        acc[key] = {
          produto,
          quantidadeAjustada: 0,
          codLocalizador: count.codLocalizador || "",
          codigoLv: count.codigoLv || "",
          lote,
          validade: count.validade || "",
          coletor: count.coletor || "",
          inventariador: count.inventariador || "",
          descricao: count.descricao || "",
          ean: count.ean || "",
        };
      }
      acc[key].quantidadeAjustada += parseInt(count.quantidadeAjustada || count.quantidade) || 0;
      return acc;
    }, {} as Record<string, CountLotGroup>);

    const discrepanciesList: Discrepancy[] = [];
    const handledCountKeys = new Set<string>();
    const handledProductsWithoutLot = new Set<string>();

    const addDiscrepancy = (
      product: (typeof products)[number],
      countData: CountLotGroup | undefined,
      qtdeLoja: number,
      qtdeEscaneada: number,
      lote: string
    ) => {
      const qtdeDivergente = qtdeEscaneada - qtdeLoja;
      if (qtdeDivergente === 0) return;
      const custo = parseBRNumber(product.custoGerencial);
      discrepanciesList.push({
        codLocalizador: countData?.codLocalizador || product.codLocalizador || "",
        descricaoLocalizador: product.descricaoLocalizador || "",
        codigoLv: countData?.codigoLv || product.codigoLv || "",
        produto: product.produto,
        ean1: product.ean1 || countData?.ean || "",
        descricao: product.descricao1 || countData?.descricao || "",
        lote,
        validade: countData?.validade || product.validade || "",
        coletor: countData?.coletor || "",
        inventariador: countData?.inventariador || "",
        custo,
        qtdeLoja,
        qtdeEscaneada,
        qtdeDivergente,
        valorDiferenca: custo * qtdeDivergente,
        controlado: product.controlado || "",
      });
    };

    for (const product of products) {
      const productLot = product.lote?.trim() || "";
      const qtdeLoja = parseBRNumber(product.saldo);

      if (productLot) {
        const key = countLotKey(product.produto, productLot);
        const countData = countsByLot[key];
        if (countData) handledCountKeys.add(key);
        addDiscrepancy(product, countData, qtdeLoja, countData?.quantidadeAjustada || 0, productLot);
      } else {
        if (handledProductsWithoutLot.has(product.produto)) continue;
        handledProductsWithoutLot.add(product.produto);
        const productCounts = Object.entries(countsByLot)
          .filter(([, group]) => group.produto === product.produto);
        productCounts.forEach(([key]) => handledCountKeys.add(key));
        const total = productCounts.reduce((sum, [, group]) => sum + group.quantidadeAjustada, 0);
        const firstCount = productCounts[0]?.[1];
        const lots = [...new Set(productCounts.map(([, group]) => group.lote).filter(Boolean))].join(" / ");
        addDiscrepancy(product, firstCount, qtdeLoja, total, lots);
      }
    }

    // Um lote contado que não existe no cadastro é uma sobra daquele lote.
    for (const [key, countData] of Object.entries(countsByLot)) {
      if (handledCountKeys.has(key)) continue;
      const product = products.find((item) => item.produto === countData.produto);
      if (product) {
        addDiscrepancy(product, countData, 0, countData.quantidadeAjustada, countData.lote);
      } else {
        discrepanciesList.push({
          codLocalizador: countData.codLocalizador,
          descricaoLocalizador: "",
          codigoLv: countData.codigoLv,
          produto: countData.produto,
          ean1: countData.ean,
          descricao: "Produto não cadastrado",
          lote: countData.lote,
          validade: countData.validade,
          coletor: countData.coletor,
          inventariador: countData.inventariador,
          custo: 0,
          qtdeLoja: 0,
          qtdeEscaneada: countData.quantidadeAjustada,
          qtdeDivergente: countData.quantidadeAjustada,
          valorDiferenca: 0,
          controlado: "",
        });
      }
    }

    setDiscrepancies(discrepanciesList);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadDiscrepancies();
  }, [loadDiscrepancies]);

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

  // Filtro memoizado com debounce
  const filteredDiscrepancies = useMemo(() => {
    return discrepancies.filter((disc) => {
      const search = debouncedSearchTerm.toLowerCase();
      const matchesSearch = (
        disc.produto?.toLowerCase().includes(search) ||
        disc.ean1?.toLowerCase().includes(search) ||
        disc.descricao?.toLowerCase().includes(search) ||
        disc.codLocalizador?.toLowerCase().includes(search) ||
        disc.descricaoLocalizador?.toLowerCase().includes(search) ||
        disc.codigoLv?.toLowerCase().includes(search) ||
        disc.lote?.toLowerCase().includes(search) ||
        disc.validade?.toLowerCase().includes(search) ||
        disc.coletor?.toLowerCase().includes(search) ||
        disc.inventariador?.toLowerCase().includes(search)
      );

      const isControlled = disc.controlado?.toLowerCase() === 's' || disc.controlado?.toLowerCase() === 'sim';
      const matchesControlled = !showControlled || isControlled;

      const isNotRegistered = disc.descricao === "Produto não cadastrado";
      const matchesNotRegistered = showNotRegistered ? isNotRegistered : !isNotRegistered;

      return matchesSearch && matchesControlled && matchesNotRegistered;
    });
  }, [discrepancies, debouncedSearchTerm, showControlled, showNotRegistered]);

  // Ordenação memoizada
  const sortedDiscrepancies = useMemo(() => {
    if (!sortField || !sortDirection) return filteredDiscrepancies;
    
    return [...filteredDiscrepancies].sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      
      if (typeof aValue === "number" && typeof bValue === "number") {
        const comparison = aValue - bValue;
        return sortDirection === "asc" ? comparison : -comparison;
      }
      
      const comparison = (aValue || "").toString().localeCompare((bValue || "").toString(), undefined, { numeric: true });
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [filteredDiscrepancies, sortField, sortDirection]);

  // Paginação memoizada
  const totalPages = Math.ceil(sortedDiscrepancies.length / PAGE_SIZE);
  const paginatedDiscrepancies = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sortedDiscrepancies.slice(start, start + PAGE_SIZE);
  }, [sortedDiscrepancies, currentPage]);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  }, [totalPages]);

  const exportToPDF = useCallback(async () => {
    try {
      // @ts-expect-error Compatibilidade entre as estruturas de fontes das versões do pdfMake.
      pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfFonts.vfs;

      let logoBase64 = '';
      try {
        const response = await fetch('/logo-drogaria.png');
        const blob = await response.blob();
        logoBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      } catch (error) {
        console.warn('Failed to load logo:', error);
      }

      const totalDiscrepancies = sortedDiscrepancies.length;
      const positiveDiscrepancy = sortedDiscrepancies
        .filter(d => d.valorDiferenca > 0)
        .reduce((sum, d) => sum + d.valorDiferenca, 0);
      const negativeDiscrepancy = sortedDiscrepancies
        .filter(d => d.valorDiferenca < 0)
        .reduce((sum, d) => sum + d.valorDiferenca, 0);
      const financialDifference = positiveDiscrepancy + negativeDiscrepancy;

      const docDefinition: TDocumentDefinitions = {
        pageSize: 'A3',
        pageOrientation: 'landscape',
        pageMargins: [40, logoBase64 ? 130 : 80, 40, 60],
        header: logoBase64 ? {
          stack: [
            {
              image: logoBase64,
              width: 100,
              alignment: 'center',
              margin: [0, 20, 0, 5]
            },
            {
              text: 'RELATÓRIO DE DIVERGÊNCIAS',
              fontSize: 16,
              bold: true,
              alignment: 'center',
              margin: [0, 5, 0, 10]
            }
          ]
        } : {
          text: 'RELATÓRIO DE DIVERGÊNCIAS',
          fontSize: 16,
          bold: true,
          alignment: 'center',
          margin: [0, 30, 0, 10]
        },
        content: [
          {
            style: 'tableStyle',
            table: {
              headerRows: 1,
              widths: ['auto', 'auto', 'auto', 'auto', '*', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
              body: [
                [
                  { text: 'LOCALIZADOR', style: 'tableHeader' },
                  { text: 'CÓDIGO LV', style: 'tableHeader' },
                  { text: 'PRODUTO', style: 'tableHeader' },
                  { text: 'EAN 1', style: 'tableHeader' },
                  { text: 'DESCRIÇÃO', style: 'tableHeader' },
                  { text: 'LOTE', style: 'tableHeader' },
                  { text: 'VALIDADE', style: 'tableHeader' },
                  { text: 'COLETOR', style: 'tableHeader' },
                  { text: 'INVENTARIADOR', style: 'tableHeader' },
                  { text: 'CUSTO', style: 'tableHeader' },
                  { text: 'QTDE LOJA', style: 'tableHeader' },
                  { text: 'QTDE ESCANEADA', style: 'tableHeader' },
                  { text: 'QTDE DIVERGENTE', style: 'tableHeader' },
                  { text: 'VALOR DIFERENÇA', style: 'tableHeader' },
                ],
                ...sortedDiscrepancies.map(disc => [
                  { text: [disc.codLocalizador || '-', disc.descricaoLocalizador ? `\n${disc.descricaoLocalizador}` : ''], fontSize: 7 },
                  { text: disc.codigoLv || '-', fontSize: 7 },
                  { text: disc.produto, fontSize: 8 },
                  { text: disc.ean1, fontSize: 8 },
                  { text: disc.descricao, fontSize: 8 },
                  { text: disc.lote || '-', fontSize: 8 },
                  { text: disc.validade || '-', fontSize: 8 },
                  { text: disc.coletor, fontSize: 8 },
                  { text: disc.inventariador, fontSize: 8 },
                  { text: `R$ ${disc.custo.toFixed(2)}`, fontSize: 8 },
                  { text: disc.qtdeLoja.toString(), fontSize: 8 },
                  { text: disc.qtdeEscaneada.toString(), fontSize: 8 },
                  { 
                    text: disc.qtdeDivergente.toString(), 
                    fontSize: 8,
                    color: disc.qtdeDivergente > 0 ? 'green' : 'red'
                  },
                  { 
                    text: `R$ ${disc.valorDiferenca.toFixed(2)}`, 
                    fontSize: 8,
                    color: disc.valorDiferenca > 0 ? 'green' : 'red'
                  },
                ])
              ]
            },
            layout: {
              fillColor: function (rowIndex: number) {
                return rowIndex === 0 ? '#CCCCCC' : (rowIndex % 2 === 0 ? '#F5F5F5' : null);
              }
            }
          },
          { text: '\n\n' },
          {
            text: 'RESUMO',
            style: 'summaryTitle',
            margin: [0, 10, 0, 10]
          },
          {
            columns: [
              {
                width: '*',
                stack: [
                  { text: 'DIVERGÊNCIAS ATIVAS', style: 'cardLabel' },
                  { text: totalDiscrepancies.toString(), style: 'cardValue' },
                ]
              },
              {
                width: '*',
                stack: [
                  { text: 'DIVERGÊNCIA POSITIVA', style: 'cardLabel' },
                  { text: `R$ ${positiveDiscrepancy.toFixed(2)}`, style: 'cardValue', color: 'green' },
                ]
              },
              {
                width: '*',
                stack: [
                  { text: 'DIVERGÊNCIA NEGATIVA', style: 'cardLabel' },
                  { text: `R$ ${Math.abs(negativeDiscrepancy).toFixed(2)}`, style: 'cardValue', color: 'red' },
                ]
              },
              {
                width: '*',
                stack: [
                  { text: 'DIFERENÇA FINANCEIRA', style: 'cardLabel' },
                  { text: `R$ ${financialDifference.toFixed(2)}`, style: 'cardValue' },
                ]
              }
            ]
          }
        ],
        footer: function(currentPage: number, pageCount: number) {
          return [
            {
              text: [
                { text: 'Razão Social: ', bold: true },
                'CD DROGARIAS CAMPEÃ  ',
                { text: 'CNPJ: ', bold: true },
                '46.756.296/0001-76  ',
                { text: 'Endereço: ', bold: true },
                'Rua Santa Mônica, 480 - Parque Industrial San José - Cotia/SP - CEP: 06715-865'
              ],
              fontSize: 8,
              alignment: 'center',
              margin: [40, 10, 40, 0]
            },
            {
              text: `Página ${currentPage} de ${pageCount}`,
              alignment: 'center',
              fontSize: 8,
              margin: [0, 5, 0, 0]
            }
          ];
        },
        styles: {
          header: {
            fontSize: 18,
            bold: true,
            margin: [0, 0, 0, 10]
          },
          tableStyle: {
            margin: [0, 5, 0, 5]
          },
          tableHeader: {
            bold: true,
            fontSize: 9,
            color: 'black'
          },
          summaryTitle: {
            fontSize: 14,
            bold: true,
          },
          cardLabel: {
            fontSize: 9,
            bold: true,
            margin: [0, 0, 0, 5]
          },
          cardValue: {
            fontSize: 16,
            bold: true
          }
        }
      };

      pdfMake.createPdf(docDefinition).download('relatorio-divergencia.pdf');
      toast.success("Relatório exportado com sucesso!");
    } catch (error) {
      console.error("Erro ao exportar PDF:", error);
      toast.error("Erro ao exportar relatório");
    }
  }, [sortedDiscrepancies]);

  const exportToExcel = useCallback(() => {
    if (sortedDiscrepancies.length === 0) {
      toast.error("Não há divergências para exportar");
      return;
    }

    const rows = sortedDiscrepancies.map((disc) => ({
      LOCALIZADOR: disc.codLocalizador,
      "DESCRIÇÃO LOCALIZADOR": disc.descricaoLocalizador,
      "CÓDIGO LV": disc.codigoLv,
      PRODUTO: disc.produto,
      "EAN 1": disc.ean1,
      "DESCRIÇÃO": disc.descricao,
      LOTE: disc.lote,
      VALIDADE: disc.validade,
      COLETOR: disc.coletor,
      INVENTARIADOR: disc.inventariador,
      CUSTO: disc.custo,
      "QTDE LOJA": disc.qtdeLoja,
      "QTDE ESCANEADA": disc.qtdeEscaneada,
      "QTDE DIVERGENTE": disc.qtdeDivergente,
      "VALOR DIFERENÇA": disc.valorDiferenca,
      CONTROLADO: disc.controlado,
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet["!cols"] = [
      { wch: 18 }, { wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 18 },
      { wch: 40 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 24 },
      { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 20 }, { wch: 20 },
      { wch: 12 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Divergências");
    XLSX.writeFile(
      workbook,
      `divergencias_filtradas_${new Date().toISOString().split("T")[0]}.xlsx`
    );

    toast.success(`${rows.length} divergências exportadas para Excel!`);
  }, [sortedDiscrepancies]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-end justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            type="text"
            placeholder="Pesquisar geral"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
          <Button 
            onClick={exportToPDF}
            className="gap-2"
            disabled={sortedDiscrepancies.length === 0}
          >
            <FileDown className="w-4 h-4" />
            Exportar PDF
          </Button>
          <Button
            onClick={exportToExcel}
            variant="outline"
            className="gap-2"
            disabled={sortedDiscrepancies.length === 0}
          >
            <FileDown className="w-4 h-4" />
            Exportar Excel
          </Button>
          
          <div className="flex flex-col md:flex-row gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="show-controlled-disc"
              checked={showControlled}
              onCheckedChange={(checked) => setShowControlled(checked as boolean)}
            />
            <label
              htmlFor="show-controlled-disc"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Mostrar controlados
            </label>
          </div>
          
          <div className="flex items-center gap-2">
            <Checkbox
              id="show-not-registered-disc"
              checked={showNotRegistered}
              onCheckedChange={(checked) => setShowNotRegistered(checked as boolean)}
            />
            <label
              htmlFor="show-not-registered-disc"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Mostrar não cadastrados
            </label>
          </div>
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
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("custo")}>
                  <div className="flex items-center gap-2">
                    CUSTO {getSortIcon("custo")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("qtdeLoja")}>
                  <div className="flex items-center gap-2">
                    QTDE LOJA {getSortIcon("qtdeLoja")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("qtdeEscaneada")}>
                  <div className="flex items-center gap-2">
                    QTDE ESCANEADA {getSortIcon("qtdeEscaneada")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("qtdeDivergente")}>
                  <div className="flex items-center gap-2">
                    QTDE DIVERGENTE {getSortIcon("qtdeDivergente")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("valorDiferenca")}>
                  <div className="flex items-center gap-2">
                    VALOR DIFERENÇA {getSortIcon("valorDiferenca")}
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={14} className="text-center py-12 text-muted-foreground">
                    Carregando divergências...
                  </TableCell>
                </TableRow>
              ) : paginatedDiscrepancies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={14} className="text-center py-12 text-muted-foreground">
                    Nenhuma divergência identificada.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedDiscrepancies.map((disc, index) => (
                  <DiscrepancyRow key={`${disc.produto}-${index}`} disc={disc} />
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
            <div className="text-sm text-muted-foreground">
              Mostrando {(currentPage - 1) * PAGE_SIZE + 1} - {Math.min(currentPage * PAGE_SIZE, sortedDiscrepancies.length)} de {sortedDiscrepancies.length} divergências
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

DiscrepanciesTable.displayName = "DiscrepanciesTable";
