import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Barcode, Download, Edit3, FileDown, FileSpreadsheet, FileText, PackageX, Plus, Search, Trash2, TrendingDown, TrendingUp, Upload, Users } from "lucide-react";
import * as XLSX from "xlsx";
import pdfMake from "pdfmake/build/pdfmake";
// @ts-expect-error O pacote de fontes do pdfMake não publica uma tipagem compatível.
import pdfFonts from "pdfmake/build/vfs_fonts";
import type { TDocumentDefinitions } from "pdfmake/interfaces";
import { Link } from "react-router-dom";
import { StatCard } from "@/components/StatCard";
import logo from "@/assets/logo-drogaria-campea.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { getStreetData, parseStreetCounts, parseStreetProducts, readStreetFile, replaceStreetData, saveStreetCount, StreetCount, StreetRow } from "@/lib/streetInventory";

const emptyCount: StreetCount = { cracha: "", inventarioEscopo: "", numeroContagem: "", tipoColeta: "", codigoLocalizador: "", codigo: "", quantidade: 1 };
const countHeaders = ["CRACHA", "INVENTARIO_ESCOPO", "NUMERO_CONTAGEM", "TIPO_COLETA", "CODIGO_LOCALIZADOR", "CODIGO", "QUANTIDADE", "QUANTIDADE_AJUSTADA"];
const countValues = (row: StreetCount) => [row.cracha, row.inventarioEscopo, row.numeroContagem, row.tipoColeta, row.codigoLocalizador, row.codigo, row.quantidade, row.quantidadeAjustada ?? row.quantidade];
const adjusted = (row: StreetCount) => row.quantidadeAjustada ?? row.quantidade;
const normalizeSearch = (value: unknown) => String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase("pt-BR");
const matches = (values: unknown[], search: string) => values.some(value => normalizeSearch(value).includes(search));
const inventoryKey = (codigo: string, codigoLocalizador: string) =>
  `${codigo.trim().toUpperCase()}\u0000${codigoLocalizador.trim().toUpperCase()}`;

export function StreetInventory() {
  const [products, setProducts] = useState<StreetRow[]>([]);
  const [counts, setCounts] = useState<StreetCount[]>([]);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState({ divergencias: "", cadastro: "", contagem: "" });
  const [manual, setManual] = useState<StreetCount>(emptyCount);
  const [showManual, setShowManual] = useState(false);

  useEffect(() => { getStreetData().then(data => { setProducts(data.products); setCounts(data.counts); }).catch(() => toast.error("Erro ao carregar inventário de rua")); }, []);

  const comparison = useMemo(() => {
    const scanned = new Map<string, number>();
    counts.forEach(row => {
      const key = inventoryKey(row.codigo, row.codigoLocalizador);
      scanned.set(key, (scanned.get(key) || 0) + adjusted(row));
    });
    const expected = new Map<string, number>();
    products.forEach(row => {
      const key = inventoryKey(row.codigo, row.codigoLocalizador);
      expected.set(key, (expected.get(key) || 0) + row.quantidade);
    });
    const rowByKey = new Map([...products, ...counts].map(row => [inventoryKey(row.codigo, row.codigoLocalizador), row]));
    return [...new Set([...expected.keys(), ...scanned.keys()])].sort().map(key => {
      const source = rowByKey.get(key)!;
      return {
        key,
        codigo: source.codigo,
        codigoLocalizador: source.codigoLocalizador,
        cadastro: expected.get(key),
        contado: scanned.get(key) || 0,
        diferenca: (scanned.get(key) || 0) - (expected.get(key) || 0),
      };
    });
  }, [products, counts]);
  const metrics = useMemo(() => {
    const divergent = comparison.filter(row => row.diferenca !== 0);
    const errorsByOperator = new Map<string, { codes: Set<string>; units: number }>();
    const divergentKeys = new Set(divergent.map(row => row.key));
    counts.filter(row => divergentKeys.has(inventoryKey(row.codigo, row.codigoLocalizador))).forEach(row => {
      const current = errorsByOperator.get(row.cracha) || { codes: new Set<string>(), units: 0 };
      current.codes.add(row.codigo);
      current.units += adjusted(row);
      errorsByOperator.set(row.cracha, current);
    });
    return {
      countedCodes: new Set(counts.map(row => row.codigo)).size,
      totalUnits: counts.reduce((sum, row) => sum + adjusted(row), 0),
      locators: new Set(counts.map(row => row.codigoLocalizador).filter(Boolean)).size,
      positiveUnits: divergent.reduce((sum, row) => sum + Math.max(row.diferenca, 0), 0),
      negativeUnits: divergent.reduce((sum, row) => sum + Math.abs(Math.min(row.diferenca, 0)), 0),
      operatorCodes: [...errorsByOperator.values()].reduce((sum, row) => sum + row.codes.size, 0),
      operatorUnits: [...errorsByOperator.values()].reduce((sum, row) => sum + row.units, 0),
      unregistered: comparison.filter(row => row.cadastro === undefined).length,
      manual: counts.filter(row => row.manual).length,
      adjustedRows: counts.filter(row => adjusted(row) !== row.quantidade).length,
      adjustedUnits: counts.reduce((sum, row) => sum + Math.abs(adjusted(row) - row.quantidade), 0),
      divergent: divergent.length,
    };
  }, [comparison, counts]);

  const importFile = async (file: File, kind: "products" | "counts") => {
    setBusy(true);
    try {
      const rows = await readStreetFile(file);
      if (kind === "products") {
        const parsed = parseStreetProducts(rows);
        await replaceStreetData(kind, parsed);
        setProducts(parsed);
      } else {
        const parsed = parseStreetCounts(rows);
        await replaceStreetData(kind, parsed);
        setCounts(parsed);
      }
      toast.success(`${rows.length - 1} registros importados`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha na importação");
    } finally { setBusy(false); }
  };

  const addManual = async () => {
    if (!manual.codigo.trim() || !Number.isFinite(manual.quantidade) || manual.quantidade < 0) {
      toast.error("Informe código e quantidade válida.");
      return;
    }
    setBusy(true);
    try {
      const row: StreetCount = { ...manual, codigo: manual.codigo.trim(), manual: true };
      row.id = await saveStreetCount(row);
      setCounts(current => [...current, row]);
      setManual(emptyCount);
      setShowManual(false);
      toast.success("Contagem adicionada.");
    } catch { toast.error("Erro ao adicionar contagem."); }
    finally { setBusy(false); }
  };

  const clearStreetData = async () => {
    setBusy(true);
    try {
      await Promise.all([replaceStreetData("products", []), replaceStreetData("counts", [])]);
      setProducts([]);
      setCounts([]);
      setManual(emptyCount);
      toast.success("Dados do inventário de rua limpos com sucesso.");
    } catch {
      toast.error("Erro ao limpar os dados do inventário de rua.");
    } finally {
      setBusy(false);
    }
  };

  const updateAdjusted = async (row: StreetCount, value: string) => {
    const amount = Number(value.replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0) { toast.error("Quantidade ajustada inválida."); return; }
    try {
      const updated = { ...row, quantidadeAjustada: amount };
      await saveStreetCount(updated);
      setCounts(current => current.map(item => item.id === row.id ? updated : item));
    } catch { toast.error("Erro ao salvar ajuste."); }
  };

  const exportCounts = (format: "txt" | "xlsx") => {
    if (!counts.length) { toast.error("Não há contagens para exportar."); return; }
    const rows = [countHeaders, ...counts.map(countValues)];
    if (format === "xlsx") {
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "Contagem");
      XLSX.writeFile(book, "contagem-rua.xlsx");
    } else {
      const content = "\uFEFF" + rows.map(row => row.join("\t")).join("\r\n");
      const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "contagem-rua.txt";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  const exportReport = async () => {
    if (!products.length && !counts.length) {
      toast.error("Importe o cadastro ou a contagem antes de gerar o relatório.");
      return;
    }
    try {
      // @ts-expect-error A tipagem do build não expõe a propriedade vfs usada no navegador.
      pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfFonts.vfs;
      const discrepancies = comparison.filter(row => row.diferenca !== 0);
      const notRegistered = discrepancies.filter(row => row.cadastro === undefined);
      const shortages = discrepancies.filter(row => row.diferenca < 0).sort((a, b) => a.diferenca - b.diferenca).slice(0, 50);
      const surpluses = discrepancies.filter(row => row.diferenca > 0).sort((a, b) => b.diferenca - a.diferenca).slice(0, 50);
      const operators = new Map<string, { readings: number; codes: Set<string>; locators: Set<string>; original: number; adjusted: number; adjustedRows: number; adjustedUnits: number; manual: number }>();
      counts.forEach(row => {
        const name = row.cracha.trim() || "NÃO INFORMADO";
        const current = operators.get(name) || { readings: 0, codes: new Set<string>(), locators: new Set<string>(), original: 0, adjusted: 0, adjustedRows: 0, adjustedUnits: 0, manual: 0 };
        current.readings += 1;
        current.codes.add(row.codigo);
        if (row.codigoLocalizador) current.locators.add(row.codigoLocalizador);
        current.original += row.quantidade;
        current.adjusted += adjusted(row);
        if (adjusted(row) !== row.quantidade) {
          current.adjustedRows += 1;
          current.adjustedUnits += Math.abs(adjusted(row) - row.quantidade);
        }
        if (row.manual) current.manual += 1;
        operators.set(name, current);
      });
      let logoBase64 = "";
      try {
        const blob = await (await fetch(logo)).blob();
        logoBase64 = await new Promise<string>(resolve => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(String(reader.result || ""));
          reader.readAsDataURL(blob);
        });
      } catch { /* O relatório continua disponível sem a imagem. */ }
      const document: TDocumentDefinitions = {
        pageOrientation: "landscape",
        pageMargins: [28, 32, 28, 32],
        header: logoBase64 ? { image: logoBase64, width: 70, alignment: "center", margin: [0, 8, 0, 0] } : undefined,
        content: [
          { text: "CD DROGARIAS CAMPEÃ", style: "company" },
          { text: "Relatório do inventário de rua", style: "title" },
          { text: `Gerado em ${new Date().toLocaleString("pt-BR")}`, style: "muted" },
          { text: "Resumo", style: "section" },
          {
            table: {
              widths: ["*", "*", "*", "*"],
              body: [
                ["Códigos cadastrados", "Códigos contados", "Unidades contadas", "Divergências"],
                [new Set(products.map(row => row.codigo)).size, metrics.countedCodes, metrics.totalUnits, metrics.divergent],
                ["Sobra (un)", "Falta (un)", "Não cadastrados", "Itens ajustados"],
                [metrics.positiveUnits, metrics.negativeUnits, metrics.unregistered, metrics.adjustedRows],
              ],
            },
            layout: "lightHorizontalLines",
          },
          { text: "Resumo operacional", style: "section", pageBreak: "before" },
          {
            table: {
              headerRows: 1,
              widths: ["*", "*", "*", "*", "*", "*", "*", "*"],
              body: [
                ["Leituras", "Códigos", "Qtd. original", "Qtd. ajustada", "Operadores", "Não cadastrados", "Manuais", "Localizadores"],
                [counts.length, metrics.countedCodes, counts.reduce((sum, row) => sum + row.quantidade, 0), metrics.totalUnits, operators.size, metrics.unregistered, metrics.manual, metrics.locators],
              ],
            },
            layout: "lightHorizontalLines",
          },
          { text: "Análise por operador", style: "section" },
          {
            table: {
              headerRows: 1,
              widths: ["*", "auto", "auto", "auto", "auto", "auto", "auto", "auto", "auto"],
              body: [
                ["Crachá", "Leituras", "Códigos", "Locais", "Qtd. original", "Qtd. ajustada", "Itens ajustados", "Unid. ajustadas", "Manuais"],
                ...[...operators.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, row]) => [name, row.readings, row.codes.size, row.locators.size, row.original, row.adjusted, row.adjustedRows, row.adjustedUnits, row.manual]),
              ],
            },
            layout: "lightHorizontalLines",
          },
          { text: "Produtos não cadastrados", style: "section", pageBreak: "before" },
          notRegistered.length ? {
            table: {
              headerRows: 1,
              widths: ["*", "auto", "auto", "auto", "auto"],
              body: [["Código", "Localizador", "Cadastro", "Contado", "Diferença"], ...notRegistered.map(row => [row.codigo, row.codigoLocalizador || "-", "-", row.contado, row.diferenca])],
            },
            layout: "lightHorizontalLines",
          } : { text: "Nenhum produto não cadastrado encontrado.", style: "muted" },
          { text: "Top 50 maiores faltas", style: "section", pageBreak: "before" },
          {
            table: { headerRows: 1, widths: ["*", "auto", "auto", "auto", "auto"], body: [["Código", "Localizador", "Cadastro", "Contado", "Diferença"], ...shortages.map(row => [row.codigo, row.codigoLocalizador || "-", row.cadastro ?? "-", row.contado, row.diferenca])] },
            layout: "lightHorizontalLines",
          },
          { text: "Top 50 maiores sobras", style: "section", pageBreak: "before" },
          {
            table: { headerRows: 1, widths: ["*", "auto", "auto", "auto", "auto"], body: [["Código", "Localizador", "Cadastro", "Contado", "Diferença"], ...surpluses.map(row => [row.codigo, row.codigoLocalizador || "-", row.cadastro ?? "-", row.contado, row.diferenca])] },
            layout: "lightHorizontalLines",
          },
          { text: "Divergências", style: "section", pageBreak: "before" },
          {
            table: {
              headerRows: 1,
              widths: ["*", "auto", "auto", "auto", "auto", "auto"],
              body: [
                ["Código", "Localizador", "Cadastro", "Contado", "Diferença", "Status"],
                ...discrepancies.map(row => [row.codigo, row.codigoLocalizador || "-", row.cadastro ?? "-", row.contado, row.diferenca,
                  row.cadastro === undefined ? "Não cadastrado" : row.contado === 0 ? "Não contado" : "Divergente"]),
              ],
            },
            layout: "lightHorizontalLines",
          },
          { text: "Contagem", style: "section", pageBreak: "before" },
          {
            table: {
              headerRows: 1,
              widths: ["auto", "auto", "auto", "auto", "auto", "*", "auto", "auto", "auto"],
              body: [
                ["Crachá", "Escopo", "Contagem", "Tipo", "Localizador", "Código", "Qtd.", "Qtd. ajustada", "Origem"],
                ...counts.map(row => [...countValues(row), row.manual ? "Manual" : "Importado"]),
              ],
            },
            layout: "lightHorizontalLines",
          },
          { text: "Cadastro completo", style: "section", pageBreak: "before" },
          {
            table: {
              headerRows: 1,
              widths: ["auto", "auto", "auto", "auto", "auto", "*", "auto"],
              body: [
                ["Crachá", "Escopo", "Contagem", "Tipo", "Localizador", "Código", "Quantidade"],
                ...products.map(row => countValues(row).slice(0, 7)),
              ],
            },
            layout: "lightHorizontalLines",
          },
        ],
        styles: {
          company: { fontSize: 10, bold: true, color: "#1f6b45" },
          title: { fontSize: 20, bold: true, margin: [0, 4, 0, 2] },
          section: { fontSize: 14, bold: true, margin: [0, 14, 0, 7] },
          muted: { fontSize: 8, color: "#666666" },
        },
        defaultStyle: { fontSize: 8 },
        footer: (currentPage, pageCount) => ({
          text: `CD DROGARIAS CAMPEÃ | CNPJ 46.756.296/0001-76 | Inventário de rua | Página ${currentPage} de ${pageCount}`,
          alignment: "center",
          fontSize: 7,
          color: "#666666",
          margin: [0, 8, 0, 0],
        }),
      };
      pdfMake.createPdf(document).download("relatorio-inventario-rua.pdf");
      toast.success("Relatório gerado com sucesso.");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao gerar relatório.");
    }
  };

  const searchBox = (tab: keyof typeof search) => <div className="relative mb-3 max-w-sm">
    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    <Input aria-label={`Pesquisar ${tab}`} placeholder="Pesquisar em todos os campos" className="pl-9" value={search[tab]} onChange={event => setSearch(current => ({ ...current, [tab]: event.target.value }))} />
  </div>;

  const comparisonQuery = normalizeSearch(search.divergencias);
  const relatedMatches = new Set((comparisonQuery ? [...products, ...counts] : [])
    .filter(item => matches(countValues(item), comparisonQuery))
    .map(item => inventoryKey(item.codigo, item.codigoLocalizador)));
  const filteredComparison = comparison.filter(row => {
    const query = comparisonQuery;
    const status = row.cadastro === undefined ? "Não cadastrado" : row.contado === 0 ? "Não contado" : row.diferenca === 0 ? "Conferido" : "Divergente";
    if (!query) return row.diferenca !== 0;
    return matches([row.codigo, row.codigoLocalizador, row.cadastro, row.contado, row.diferenca, status], query) ||
      relatedMatches.has(row.key);
  });
  const filteredProducts = products.filter(row => matches(countValues(row), normalizeSearch(search.cadastro)));
  const filteredCounts = counts.filter(row => matches([...countValues(row), row.manual ? "manual" : "importado"], normalizeSearch(search.contagem)));

  return <main className="min-h-screen bg-background p-4 md:p-6 space-y-5">
    <Link to="/" className="text-sm text-primary hover:underline">Voltar aos inventários</Link>
    <header className="mb-8">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-4">
          <img src={logo} alt="CD Drogarias Campeã" className="h-16 w-auto" />
          <div><h1 className="text-3xl font-bold text-foreground">CD DROGARIAS CAMPEÃ</h1><p className="text-sm text-muted-foreground mt-1">CNPJ: 46.756.296/0001-76</p><p className="text-xs text-muted-foreground">Rua Santa Mônica, 480 - Parque Industrial San José - Cotia/SP - CEP: 06715-865</p></div>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="cursor-pointer"><Input type="file" className="hidden" disabled={busy} accept=".xlsx,.xls,.txt" onChange={event => { const file = event.target.files?.[0]; if (file) void importFile(file, "products"); event.target.value = ""; }} /><Button asChild variant="outline" className="bg-mint hover:bg-mint/80 text-mint-foreground border-mint/20"><span><FileSpreadsheet className="w-4 h-4 mr-2" />Importar cadastro</span></Button></label>
          <label className="cursor-pointer"><Input type="file" className="hidden" disabled={busy} accept=".txt" onChange={event => { const file = event.target.files?.[0]; if (file) void importFile(file, "counts"); event.target.value = ""; }} /><Button asChild variant="outline" className="bg-info-blue hover:bg-info-blue/80 text-info-blue-foreground border-info-blue/20"><span><Upload className="w-4 h-4 mr-2" />Importar contagem</span></Button></label>
          <Button variant="outline" className="bg-success-green hover:bg-success-green/80 text-success-green-foreground border-success-green/20" onClick={exportReport}><FileDown className="w-4 h-4 mr-2" />Exportar relatório</Button>
          <Button disabled={busy} variant="outline" className="bg-danger-pink hover:bg-danger-pink/80 text-danger-pink-foreground border-danger-pink/20" onClick={clearStreetData}><Trash2 className="w-4 h-4 mr-2" />Limpar dados</Button>
        </div>
      </div>
    </header>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <StatCard icon={<FileText className="w-6 h-6" />} label="PRODUTOS CADASTRADOS" value={`${new Set(products.map(row => row.codigo)).size} códigos`} subtitle={`${products.length} registros no cadastro`} variant="blue" />
      <StatCard icon={<Barcode className="w-6 h-6" />} label="ITENS CONTADOS" value={`${metrics.countedCodes} códigos`} subtitle={`${metrics.totalUnits} un contadas + ${metrics.locators} localizadores`} variant="blue" />
      <StatCard icon={<AlertTriangle className="w-6 h-6" />} label="DIVERGÊNCIAS ATIVAS" value={metrics.divergent} subtitle="Confronto por código e quantidade" variant="warning" />
      <StatCard icon={<TrendingUp className="w-6 h-6" />} label="DIVERGÊNCIA POSITIVA" value={`${metrics.positiveUnits} un`} subtitle="Custo não informado" variant="success" />
      <StatCard icon={<TrendingDown className="w-6 h-6" />} label="DIVERGÊNCIA NEGATIVA" value={`${metrics.negativeUnits} un`} subtitle="Custo não informado" variant="destructive" />
      <StatCard icon={<Users className="w-6 h-6" />} label="ERRO POR OPERADOR" value={`${metrics.operatorCodes} códigos + ${metrics.operatorUnits} itens`} subtitle="Leituras de códigos divergentes por crachá" variant="warning" />
      <StatCard icon={<PackageX className="w-6 h-6" />} label="NÃO CADASTRADOS / MANUAIS" value={`${metrics.unregistered} não cadastrados`} subtitle={`${metrics.manual} inseridos manualmente`} variant="destructive" />
      <StatCard icon={<Edit3 className="w-6 h-6" />} label="MARGEM TOTAL DE AJUSTES" value={`${metrics.adjustedRows} itens ajustados`} subtitle={`${metrics.adjustedUnits} unidades ajustadas`} variant="blue" />
    </div>
    <Tabs defaultValue="divergencias">
      <TabsList className="grid w-full grid-cols-1 md:grid-cols-3 h-auto gap-1 bg-card border border-border p-1"><TabsTrigger className="py-3" value="cadastro">Cadastro de Produtos</TabsTrigger><TabsTrigger className="py-3" value="contagem">Contagem</TabsTrigger><TabsTrigger className="py-3" value="divergencias">Divergências</TabsTrigger></TabsList>
      <TabsContent value="divergencias">{searchBox("divergencias")}<div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Código</th><th className="p-2">Localizador</th><th className="p-2">Cadastro</th><th className="p-2">Contado</th><th className="p-2">Diferença</th><th className="p-2">Status</th></tr></thead><tbody>{filteredComparison.map(row => <tr key={row.key} className="border-b"><td className="p-2">{row.codigo}</td><td className="p-2">{row.codigoLocalizador || "-"}</td><td className="p-2">{row.cadastro ?? "-"}</td><td className="p-2">{row.contado}</td><td className="p-2">{row.diferenca}</td><td className="p-2">{row.cadastro === undefined ? "Não cadastrado" : row.contado === 0 ? "Não contado" : row.diferenca === 0 ? "Conferido" : "Divergente"}</td></tr>)}</tbody></table></div></TabsContent>
      <TabsContent value="cadastro">{searchBox("cadastro")}<div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left">{["Crachá", "Escopo", "Contagem", "Tipo", "Localizador", "Código", "Quantidade"].map(header => <th key={header} className="p-2">{header}</th>)}</tr></thead><tbody>{filteredProducts.map((row, index) => <tr key={index} className="border-b">{countValues(row).slice(0, 7).map((cell, column) => <td key={column} className="p-2">{cell}</td>)}</tr>)}</tbody></table></div></TabsContent>
      <TabsContent value="contagem">
        <div className="flex flex-wrap gap-2 mb-3">
          <Button variant="outline" onClick={() => setShowManual(current => !current)}><Plus className="w-4 h-4 mr-2" />Inserção manual</Button>
          <Button variant="outline" onClick={() => exportCounts("txt")}><Download className="w-4 h-4 mr-2" />Exportar TXT</Button>
          <Button variant="outline" onClick={() => exportCounts("xlsx")}><Download className="w-4 h-4 mr-2" />Exportar XLSX</Button>
        </div>
        {showManual && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4 p-4 border rounded-lg">
          {([ ["Crachá", "cracha"], ["Escopo", "inventarioEscopo"], ["Número da contagem", "numeroContagem"], ["Tipo de coleta", "tipoColeta"], ["Localizador", "codigoLocalizador"], ["Código", "codigo"] ] as const).map(([label, key]) => <label key={key} className="text-sm">{label}<Input value={manual[key]} onChange={event => setManual(current => ({ ...current, [key]: event.target.value }))} /></label>)}
          <label className="text-sm">Quantidade<Input type="number" min="0" value={manual.quantidade} onChange={event => setManual(current => ({ ...current, quantidade: Number(event.target.value) }))} /></label>
          <div className="flex items-end"><Button disabled={busy} onClick={addManual}>Adicionar contagem</Button></div>
        </div>}
        {searchBox("contagem")}
        <div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left">{["Crachá", "Escopo", "Contagem", "Tipo", "Localizador", "Código", "Quantidade", "Quantidade ajustada", "Origem"].map(header => <th key={header} className="p-2">{header}</th>)}</tr></thead><tbody>{filteredCounts.map((row, index) => <tr key={row.id ?? index} className="border-b">{countValues(row).slice(0, 7).map((cell, column) => <td key={column} className="p-2">{cell}</td>)}<td className="p-2"><Input className="w-24 h-8" aria-label={`Quantidade ajustada de ${row.codigo}`} type="number" min="0" defaultValue={adjusted(row)} key={`${row.id}-${adjusted(row)}`} onBlur={event => { if (Number(event.target.value) !== adjusted(row)) void updateAdjusted(row, event.target.value); }} /></td><td className="p-2">{row.manual ? "Manual" : "Importado"}</td></tr>)}</tbody></table></div>
      </TabsContent>
    </Tabs>
  </main>;
}
