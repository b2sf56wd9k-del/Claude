# Ascensão

App pessoal de rotina gamificada: missões diárias e semanais, XP, níveis, ranks (E a S), atributos e sequência de dias — mais um módulo de gastos do casal, mês a mês e por tipo de gasto, alimentado por extratos da conta e do cartão.

## Rodar

```bash
npm install
npm run dev      # desenvolvimento
npm test         # testes das regras do jogo e do leitor de extratos
npm run build    # gera a pasta dist/ (site estático, instalável no celular como PWA)
```

## Como funciona

- **Missões**: cada conclusão gera um evento de XP. Concluir todas as diárias dá bônus e mantém a sequência; falhar gera uma missão de penalidade no dia seguinte, que salva a sequência se cumprida.
- **Gastos**: importe OFX ou CSV (conta ou cartão, de qualquer uma das duas pessoas). Os lançamentos são classificados por regras; ao corrigir uma categoria, o app aprende o estabelecimento. Pagamento de fatura e transferências não entram no total, para não contar o cartão em dobro.
- **Finanças no jogo**: importar o extrato de um mês e fechar o mês dentro do orçamento rendem XP.
- **Dados**: ficam no navegador do aparelho (localStorage). Use Ajustes → Exportar backup.

## Estrutura

- `src/game.ts` — regras do jogo (funções puras)
- `src/finance/parse.ts` — leitura de OFX/CSV
- `src/finance/categorize.ts` — categorias, regras e resumos mensais
- `src/store.ts` — estado persistido
- `src/pages/` — telas

## Próximos passos

1. Sincronização entre aparelhos (para o casal ver os mesmos gastos)
2. Strava: corridas concluem a missão automaticamente
3. Google Agenda
4. Investimentos (aportes e metas)
