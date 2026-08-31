# Plano de Implementação — Dashboard de Indicadores Tributários & Analytics

Criar uma nova aba dedicada de **Dashboard de Indicadores Tributários** no Frontend React, consumindo dados reais armazenados na tabela `notas_analisadas` do PostgreSQL através de um novo endpoint de Analytics no Backend.

---

## 🎯 Requisitos Solicitados

1. **Aba Exclusiva no Frontend:** Uma nova aba "Dashboard" no menu superior.
2. **Total Acumulado Retido por Tributo:** Exibição detalhada de IR, CSLL, PIS, COFINS, INSS e ISS.
3. **Totais por Código da Receita DARF:** Agrupamento por código DARF (ex: `6190`, `8767`, `6147`).
4. **Filtro por Natureza do Rendimento (EFD-Reinf):** Ao selecionar um código de Natureza (ex: `17006`, `17022`, `17099`), listar todas as notas fiscais retidas correspondentes com seus dados detalhados.
5. **Painel de Alertas de Divergência ou Retenção Zerada:** Identificação automática de notas fiscais com retenção nula ou potenciais inconsistências.
6. **Exclusões Específicas:** **NÃO** incluir a opção de Top 10 fornecedores com maiores retenções (conforme solicitado).
7. **Dados Reais:** Utilizar **apenas dados reais** salvos no PostgreSQL (sem valores aleatórios/fictícios).

---

## 📐 Proposta de Alterações

---

### Backend (Node.js + Express)

#### [MODIFY] [`backend/src/server.ts`](file:///c:/Desenv-sistemas/Ret-Impostos/backend/src/server.ts)
- Adicionar o endpoint GET `/api/dashboard/analytics` (com suporte a filtro opcional por `naturezaReinf`).
- Consultar a tabela `notas_analisadas` no PostgreSQL.
- Calcular os totais acumulados por tributo (IR, CSLL, PIS, COFINS, INSS, ISS).
- Agrupar totais por `codigoReceitaDarf`.
- Extrair lista de códigos e descrições de `naturezaRendimentoReinf`.
- Gerar lista de alertas para notas com retenção R$ 0,00 ou sem chave de acesso.
- Retornar a lista de notas filtradas ou completa com suporte ao filtro de Natureza do Rendimento.

---

### Frontend (React + TypeScript)

#### [NEW] [`frontend/src/components/DashboardTab.tsx`](file:///c:/Desenv-sistemas/Ret-Impostos/frontend/src/components/DashboardTab.tsx)
- Componente principal do Dashboard.
- **Cards de Métricas:** Totais retidos por tributo (IR, CSLL, PIS, COFINS, INSS, ISS) com barras visuais proporcionais e valores em R$.
- **Seção Códigos de Receita DARF:** Cards com totais por código (ex: 6190, 8767, 6147).
- **Filtro por Natureza do Rendimento (EFD-Reinf):** Dropdown para filtrar notas pela natureza selecionada (ex: 17006, 17022).
- **Tabela Detalhada de Notas Fiscais Filtradas:** Exibição do número da nota, fornecedor, CNPJ, valor bruto, total retido e o detalhamento por imposto.
- **Painel de Alertas:** Destaque para notas fiscais com retenção zerada ou alertas de divergência.

#### [MODIFY] [`frontend/src/App.tsx`](file:///c:/Desenv-sistemas/Ret-Impostos/frontend/src/App.tsx)
- Adicionar o ícone e botão "Dashboard & Analytics" na barra de navegação superior.
- Adicionar o estado de renderização para a nova aba `dashboard`.

---

## 🧪 Plano de Verificação

### Automated Tests / Queries
- Executar query via `node` no backend para validar que os dados reais da nota #84 no PostgreSQL são retornados corretamente no formato esperado.
- Testar a API GET `/api/dashboard/analytics` usando `axios` / `fetch`.

### Manual Verification
- Acessar `http://localhost:5173`, navegar até a aba **Dashboard**.
- Verificar a exibição dos valores reais acumulados da nota #84 (`R$ 109.303,22` de retenção total: IR `R$ 23.580,02`, CSLL `R$ 4.912,50`, PIS `R$ 3.193,13`, COFINS `R$ 14.737,51`, INSS `R$ 43.230,04`, ISS `R$ 19.650,02`).
- Testar o filtro por Natureza de Rendimento (`17006`).
- Verificar que o layout não contém valores randômicos e segue os padrões de design do sistema.
