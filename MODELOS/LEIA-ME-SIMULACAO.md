# Simulação da importação de contagem

Use os arquivos nesta ordem:

1. Importe `CADASTRO_SIMULACAO_DIVERGENCIAS.xlsx` em **Importar cadastro**.
2. Importe `MODELO_IMPORTACAO_CONTAGEM.txt` em **Importar contagem**.

O TXT não possui cabeçalho porque o sistema interpreta todas as linhas como dados. O separador utilizado é ponto e vírgula e a ordem dos campos é:

```text
CÓDIGO LOCALIZADOR;EAN;QTDE;LOTE;VALIDADE;CÓDIGO LV
```

## Resultado esperado

| Produto | Saldo | Contagem | Resultado |
| --- | ---: | ---: | --- |
| PRODUTO TESTE 1 | 2 | 1 | Falta de 1 unidade; divergência de `-R$ 10,00` |
| PRODUTO TESTE 1 — lote ABC999 | 0 | 1 | Lote diferente do cadastro; sobra de 1 unidade e divergência de `R$ 10,00` |
| PRODUTO TESTE 2 | 10 | 10 | Contagem correta; sem divergência |
| PRODUTO TESTE 3 | 5 | 8 | Sobra de 3 unidades; divergência de `R$ 24,00` |
| EAN 7899999999999 | — | 4 | Produto não cadastrado |

Diferença financeira esperada entre os produtos cadastrados: `R$ 24,00` (`R$ 24,00 + R$ 10,00 - R$ 10,00`).
