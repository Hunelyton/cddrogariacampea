import fs from "node:fs";
import path from "node:path";
import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, ImageRun,
  LevelFormat, PageNumber, Packer, Paragraph, ShadingType, Table, TableCell,
  TableRow, TextRun, VerticalAlign, WidthType,
} from "./runtime/node_modules/docx/dist/index.mjs";

const root = path.resolve(".");
const out = path.join(root, "outputs", "proposta_comercial_inventario_rua_drogarias_campea.docx");
const logo = path.join(root, "src", "assets", "logo-drogaria-campea.png");
const green = "176B45";
const paleGreen = "EAF4EF";
const gray = "F4F5F6";
const border = { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" };
const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };

const text = (value, options = {}) => new TextRun({ text: value, font: "Aptos", size: 21, color: "1F2937", ...options });
const para = (value, options = {}) => new Paragraph({ children: [text(value)], spacing: { after: 110, line: 265 }, ...options });
const heading = (value, level = HeadingLevel.HEADING_1) => new Paragraph({ text: value, heading: level, keepNext: true, spacing: { before: level === HeadingLevel.HEADING_1 ? 220 : 145, after: 80 } });
const cell = (value, options = {}) => new TableCell({
  children: [new Paragraph({ children: [text(value, options.run || {})], alignment: options.align || AlignmentType.LEFT })],
  shading: options.fill ? { type: ShadingType.CLEAR, fill: options.fill } : undefined,
  verticalAlign: VerticalAlign.CENTER,
  margins: { top: 120, bottom: 120, left: 140, right: 140 },
  width: options.width ? { size: options.width, type: WidthType.DXA } : undefined,
});

const numbered = (value) => new Paragraph({ text: value, numbering: { reference: "workflow", level: 0 }, spacing: { after: 100, line: 270 } });
const bullet = (value) => new Paragraph({ text: value, bullet: { level: 0 }, spacing: { after: 75, line: 260 } });

const scope = [
  ["2.1 Seleção do tipo de inventário", "Criação de uma tela inicial para escolha entre os módulos Picking e Rua. Cada opção direcionará o usuário para seu respectivo painel e utilizará armazenamento separado, evitando mistura entre cadastros e contagens."],
  ["2.2 Cadastro do inventário de rua", "Importação do arquivo de cadastro nos formatos XLSX, XLS ou TXT, respeitando a ordem definida para as colunas Crachá, Inventário Escopo, Número da Contagem, Tipo de Coleta, Código Localizador, Código e Quantidade. Todos os campos serão preservados e exibidos no sistema."],
  ["2.3 Importação da contagem", "Importação do arquivo TXT gerado pelo coletor, utilizando o mesmo mapeamento de sete colunas. As informações importadas ficarão disponíveis para consulta, pesquisa e confronto com o cadastro do inventário de rua."],
  ["2.4 Confronto e identificação de divergências", "Comparação dos dados pelo Código e pela Quantidade. Quando um código aparecer em mais de uma linha, as quantidades serão consolidadas para o confronto. O sistema identificará itens conferidos, divergentes, não contados e não cadastrados, além de indicar faltas e sobras em unidades."],
  ["2.5 Contagem manual e ajustes", "Inclusão manual de registros na aba Contagem e disponibilização do campo Quantidade Ajustada. A quantidade original será preservada, e o confronto, os indicadores e os relatórios considerarão a quantidade ajustada quando houver alteração."],
  ["2.6 Pesquisa e consulta", "Disponibilização de pesquisa em todos os campos das abas Cadastro, Contagem e Divergências. A consulta poderá localizar também códigos já conferidos, permitindo verificar registros mesmo quando não houver diferença."],
  ["2.7 Indicadores do inventário de rua", "Apresentação de métricas de produtos cadastrados, itens e unidades contadas, localizadores, divergências ativas, faltas, sobras, erros por operador, produtos não cadastrados, inclusões manuais e ajustes realizados."],
  ["2.8 Exportações e relatório", "Exportação da contagem nos formatos TXT e XLSX. Inclusão de relatório completo em PDF com resumo geral, resumo operacional, análise por operador, produtos não cadastrados, maiores faltas e sobras, divergências, cadastro completo e contagem detalhada com quantidade original, quantidade ajustada e origem do registro."],
  ["2.9 Limpeza independente dos dados", "Inclusão de uma opção para limpar os dados do inventário de rua sem remover ou modificar as informações armazenadas no módulo de picking."],
  ["2.10 Testes e homologação", "Disponibilização da atualização para testes com a equipe da Drogarias Campeã. Serão realizados ajustes pontuais diretamente relacionados às funções descritas nesta proposta, antes da liberação final."],
];

const children = [];
if (fs.existsSync(logo)) {
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: fs.readFileSync(logo), transformation: { width: 165, height: 78 }, type: "png", altText: { title: "Drogarias Campeã", description: "Logo da Drogarias Campeã", name: "Logo" } })], spacing: { after: 160 } }));
}
children.push(
  new Paragraph({ text: "Proposta comercial para melhorias no sistema de inventário de rua", heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { after: 100 } }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [text("Drogarias Campeã", { bold: true, size: 27 })], spacing: { after: 300 } }),
  new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders, rows: [
    ["Proponente", "Hunelyton Mendes Lima | CPF 372.044.388-41"],
    ["Contratante", "Drogarias Campeã | CNPJ 46.756.296/0001-76"],
    ["Objeto", "Inclusão do módulo de inventário de rua e melhorias relacionadas"],
    ["Investimento", "R$ 750,00 (setecentos e cinquenta reais)"],
  ].map((row, index) => new TableRow({ children: [
    cell(row[0], { fill: green, width: 3000, run: { bold: true, color: "FFFFFF" } }),
    cell(row[1], { fill: index === 3 ? paleGreen : undefined, width: 7600, run: { bold: index === 3 } }),
  ] })) }),
  heading("1 Objetivo da proposta"),
  para("Esta proposta apresenta as condições para desenvolver, implantar e validar uma nova opção de inventário de rua no sistema utilizado pela Drogarias Campeã. A melhoria manterá o inventário de picking existente e acrescentará um módulo independente, permitindo que a equipe selecione o tipo de inventário antes de iniciar o trabalho."),
  para("O novo módulo organizará o cadastro, a importação das contagens, o confronto dos dados, os ajustes operacionais e a emissão de relatórios específicos para o inventário de rua. O objetivo é oferecer uma operação clara, rastreável e separada do picking, sem alterar os dados já utilizados no processo atual."),
  heading("2 Escopo dos serviços"),
);
for (const [name, body] of scope) children.push(heading(name, HeadingLevel.HEADING_2), para(body));

children.push(
  heading("3 Fluxo de funcionamento"),
  ...[
    "O usuário acessa o sistema e escolhe entre Inventário Picking e Inventário Rua.",
    "No módulo Rua, importa o cadastro no layout acordado.",
    "Em seguida, importa a contagem TXT do coletor ou inclui registros manualmente.",
    "O sistema consolida os códigos e confronta as quantidades cadastradas e contadas.",
    "A equipe consulta as divergências, pesquisa qualquer campo e realiza ajustes quando necessário.",
    "Após a conferência, a contagem pode ser exportada em TXT ou XLSX e o relatório completo pode ser emitido em PDF.",
  ].map(numbered),
  heading("4 Entregáveis"),
  ...[
    "Tela inicial de seleção entre Picking e Rua.", "Módulo de inventário de rua com dados independentes.",
    "Importação do cadastro e da contagem conforme o layout definido.", "Confronto por código e quantidade, com indicadores operacionais.",
    "Inclusão manual e ajuste das quantidades contadas.", "Pesquisa completa nas abas do módulo.",
    "Exportação da contagem em TXT e XLSX.", "Relatório completo do inventário de rua em PDF.",
    "Versão para testes e ajustes de homologação dentro do escopo.",
  ].map(bullet),
  heading("5 Prazo de entrega"),
  para("O prazo para disponibilização da atualização será de até 10 dias úteis, contados a partir da confirmação do pagamento e do recebimento de todos os arquivos e informações necessários para validação do layout. A entrega será realizada inicialmente em ambiente de testes para homologação da equipe responsável pelo inventário."),
  para("O prazo poderá ser revisto caso sejam solicitadas alterações fora do escopo, haja mudança no layout dos arquivos, indisponibilidade de acesso ao sistema ou dependência de validação por parte da contratante."),
  heading("6 Valor da proposta"),
  new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders, rows: [
    new TableRow({ tableHeader: true, children: [cell("Serviço", { fill: green, width: 7600, run: { bold: true, color: "FFFFFF" } }), cell("Valor", { fill: green, width: 3000, align: AlignmentType.CENTER, run: { bold: true, color: "FFFFFF" } })] }),
    new TableRow({ children: [cell("Desenvolvimento e implantação do módulo de inventário de rua"), cell("R$ 750,00", { fill: paleGreen, align: AlignmentType.CENTER, run: { bold: true, size: 25 } })] }),
  ] }),
  para("Valor total: R$ 750,00 (setecentos e cinquenta reais). O valor contempla o desenvolvimento, a implantação, os testes e os ajustes diretamente relacionados ao escopo descrito nesta proposta.", { spacing: { before: 140, after: 140, line: 280 } }),
  heading("7 Forma de pagamento"),
  para("O pagamento deverá ser realizado via PIX, conforme os dados abaixo:"),
  new Table({ width: { size: 75, type: WidthType.PERCENTAGE }, borders, rows: [
    new TableRow({ children: [cell("Chave PIX", { fill: gray, width: 3000, run: { bold: true } }), cell("372.044.388-41", { width: 5000 })] }),
    new TableRow({ children: [cell("Favorecido", { fill: gray, width: 3000, run: { bold: true } }), cell("Hunelyton Mendes Lima", { width: 5000 })] }),
  ] }),
  para("A confirmação do pagamento será considerada o aceite formal desta proposta e autorizará o início dos serviços.", { spacing: { before: 140, after: 140, line: 280 } }),
  heading("8 Condições de aceite e homologação"),
  para("A entrega será considerada realizada quando a versão com o módulo de inventário de rua for disponibilizada para testes. A contratante deverá validar o fluxo, os arquivos importados, os resultados do confronto e os relatórios. Ajustes identificados nessa etapa serão atendidos quando estiverem diretamente relacionados ao escopo contratado."),
  heading("9 Limites do escopo"),
  para("Esta proposta não contempla alterações no layout do picking, integrações com sistemas de terceiros, hospedagem, aquisição de licenças, mudanças posteriores nos arquivos de origem ou novas funcionalidades não descritas neste documento. Solicitações adicionais serão analisadas e, quando necessário, apresentadas em novo orçamento."),
  heading("10 Validade da proposta"),
  para("Esta proposta possui validade de 10 dias corridos a partir da data de emissão."),
  new Paragraph({ alignment: AlignmentType.RIGHT, children: [text("Peruíbe SP, 23 de setembro de 2026")], spacing: { before: 260, after: 500 } }),
  new Paragraph({ children: [text("____________________________________________")], keepNext: true, spacing: { after: 40 } }),
  new Paragraph({ children: [text("Hunelyton Mendes Lima", { bold: true })], keepNext: true, spacing: { after: 20 } }),
  new Paragraph({ children: [text("CPF 372.044.388-41   |   E-mail hunelyton.mendes@gmail.com   |   Telefone (13) 98119-6498", { size: 18 })], keepLines: true, spacing: { after: 20 } }),
);

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Aptos", size: 21, color: "1F2937" }, paragraph: { spacing: { after: 110, line: 265 } } } },
    paragraphStyles: [
      { id: "Title", name: "Title", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Aptos Display", size: 46, bold: true, color: "000000" }, paragraph: { spacing: { after: 120 } } },
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Aptos Display", size: 30, bold: true, color: "000000" }, paragraph: { spacing: { before: 220, after: 80 }, keepNext: true } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Aptos Display", size: 23, bold: true, color: "000000" }, paragraph: { spacing: { before: 145, after: 70 }, keepNext: true } },
    ],
  },
  numbering: { config: [{ reference: "workflow", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START, style: { paragraph: { indent: { left: 540, hanging: 280 } } } }] }] },
  sections: [{
    properties: { page: { margin: { top: 1050, right: 1250, bottom: 1000, left: 1250 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [text("PROPOSTA COMERCIAL   |   INVENTÁRIO DE RUA", { bold: true, size: 16, color: "555555" })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [text("Hunelyton Mendes Lima   |   Proposta para Drogarias Campeã   |   Página ", { size: 16, color: "666666" }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "666666" }), text(" de ", { size: 16, color: "666666" }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "666666" })] })] }) },
    children,
  }],
});

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, await Packer.toBuffer(doc));
process.stdout.write(out + "\n");
