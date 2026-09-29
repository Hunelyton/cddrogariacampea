import * as XLSX from "xlsx";

export interface StreetRow {
  id?: number;
  cracha: string;
  inventarioEscopo: string;
  numeroContagem: string;
  tipoColeta: string;
  codigoLocalizador: string;
  codigo: string;
  quantidade: number;
  quantidadeAjustada?: number;
  manual?: boolean;
}

export type StreetCount = StreetRow;

const DB_NAME = "StreetInventoryDB";
const DB_VERSION = 2;
const PRODUCTS = "products_v2";
const COUNTS = "counts";

const openDB = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(COUNTS)) db.createObjectStore(COUNTS, { keyPath: "id", autoIncrement: true });
    if (!db.objectStoreNames.contains(PRODUCTS)) {
      const nextStore = db.createObjectStore(PRODUCTS, { keyPath: "id", autoIncrement: true });
      if (db.objectStoreNames.contains("products")) {
        const oldRows = request.transaction!.objectStore("products").getAll();
        oldRows.onsuccess = () => oldRows.result.forEach(row => nextStore.add({
          ...row, cracha: "", inventarioEscopo: "", numeroContagem: "", tipoColeta: "", codigoLocalizador: "",
        }));
      }
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export async function getStreetData(): Promise<{ products: StreetRow[]; counts: StreetCount[] }> {
  const db = await openDB();
  try {
    const read = <T>(storeName: string) => new Promise<T[]>((resolve, reject) => {
      const request = db.transaction(storeName).objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const [products, counts] = await Promise.all([read<StreetRow>(PRODUCTS), read<StreetCount>(COUNTS)]);
    return { products, counts };
  } finally {
    db.close();
  }
}

export async function replaceStreetData(storeName: "products" | "counts", rows: StreetRow[] | StreetCount[]): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName === "products" ? PRODUCTS : COUNTS, "readwrite");
      const store = transaction.objectStore(storeName === "products" ? PRODUCTS : COUNTS);
      store.clear();
      rows.forEach(row => {
        const { id: _id, ...data } = row as StreetRow & { id?: number };
        store.add(data);
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export async function saveStreetCount(row: StreetCount): Promise<number> {
  const db = await openDB();
  try {
    return await new Promise<number>((resolve, reject) => {
      const transaction = db.transaction(COUNTS, "readwrite");
      const request = transaction.objectStore(COUNTS).put(row);
      request.onsuccess = () => resolve(Number(request.result));
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

const value = (cell: unknown) => String(cell ?? "").trim();
const quantity = (cell: unknown) => {
  const number = Number(value(cell).replace(",", "."));
  if (!Number.isFinite(number) || number < 0) throw new Error("Quantidade invalida no arquivo.");
  return number;
};

export async function readStreetFile(file: File): Promise<string[][]> {
  const buffer = await file.arrayBuffer();
  if (/\.txt$/i.test(file.name)) {
    const text = new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, "");
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    const delimiter = ["\t", ";", "|", ","].find(separator => lines[0]?.includes(separator));
    if (!delimiter) throw new Error("Separador do TXT nao reconhecido.");
    return lines.map(line => line.split(delimiter).map(value));
  }
  const workbook = XLSX.read(buffer, { type: "array" });
  return XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: false })
    .map(row => row.map(value));
}

const STREET_HEADERS = ["CRACHA", "INVENTARIO_ESCOPO", "NUMERO_CONTAGEM", "TIPO_COLETA", "CODIGO_LOCALIZADOR", "CODIGO", "QUANTIDADE"];

const hasStreetHeaders = (rows: string[][]) => rows.length > 0 &&
  STREET_HEADERS.every((header, index) => value(rows[0][index]).toUpperCase() === header);

export function parseStreetProducts(rows: string[][]): StreetRow[] {
  if (!hasStreetHeaders(rows)) {
    throw new Error("Layout do cadastro diferente das sete colunas do modelo.");
  }
  return parseStreetRows(rows);
}

export function parseStreetCounts(rows: string[][]): StreetCount[] {
  if (!hasStreetHeaders(rows)) {
    throw new Error("Layout da contagem diferente das sete colunas do modelo.");
  }
  return parseStreetRows(rows);
}

function parseStreetRows(rows: string[][]): StreetRow[] {
  return rows.slice(1).map((row, index) => {
    const codigo = value(row[5]);
    if (!codigo) throw new Error(`Codigo ausente na linha ${index + 2}.`);
    return {
      cracha: value(row[0]), inventarioEscopo: value(row[1]), numeroContagem: value(row[2]),
      tipoColeta: value(row[3]), codigoLocalizador: value(row[4]), codigo,
      quantidade: quantity(row[6]),
    };
  });
}
