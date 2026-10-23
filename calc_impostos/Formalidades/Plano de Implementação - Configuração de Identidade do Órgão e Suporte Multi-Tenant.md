# Plano de Implementação: Configuração de Identidade do Órgão e Suporte Multi-Tenant

**Data:** 23/10/2026  
**Status:** Em Execução  
**Sistemas Impactados:** `calc_impostos` e `Rauf_App` (RAUF SaaS)  
**Objetivo Estratégico:** Adequar o `calc_impostos` à arquitetura multi-tenant do `Rauf_App`, permitindo que cada cálculo tributário e dossiê pré-pagamento seja gravado com o respectivo `instituicao_id` e `uasg`, assegurando isolamento rigoroso entre órgãos e unidades gestoras no SaaS.

---

## 1. Diagnóstico e Necessidade

O **`Rauf_App`** é uma plataforma multi-tenant em nuvem hospedada no Supabase/Render, onde:
1. Cada cliente do sistema representa uma **`Instituicao`** (órgão público, fundação ou hospital universitário), com chave primária `id`, código `uasg` (6 dígitos), `cnpj`, `nome` e `sigla`.
2. Os usuários pertencem a uma instituição específica (`current_user.instituicao_id`).
3. Todas as consultas e rotinas de conciliação fiscal e bancária do Rauf filtram os registros pelo tenant (`instituicao_id == tenant_id`), resguardando o isolamento entre órgãos distintos.

No **`calc_impostos`**, a identificação do órgão tomador/comprador estava simplificada em variáveis de LocalStorage (`cnpjMeuEstabelecimento` e `municipioMeuOrgao`) e textos fixos nos relatórios em PDF. Sem o vínculo de `instituicao_id` e `uasg`:
* As transações gravadas em `retencoes_calc_impostos` ficariam sem vínculo institucional explícito.
* O `Rauf_App` não conseguiria exibir com precisão as retenções filtradas para os operadores da respectiva Unidade Gestora (UG).

---

## 2. Arquitetura da Solução Multi-Tenant

```
+---------------------------------------------------------------------------------+
|                                 calc_impostos                                   |
|  [Seletor de Identidade do Órgão] -> (UASG: 155007 | Inst ID: 1 | EBSERH-HUCAM) |
|         |                                                                       |
|         v                                                                       |
|  [Análise de NF / Processo SEI] -> Gera retenções (IR, CSLL, PIS, COFINS...)    |
|         |                                                                       |
|         v                                                                       |
|  [Relatório PDF & Dossiê] -> Exibe Nome Oficial do Órgão, UASG, CNPJ no Header  |
|         |                                                                       |
|         v                                                                       |
|  [RaufIntegrationService] -> Dispara UPSERT com (instituicao_id, uasg, processo)|
+---------------------------------------------------------------------------------+
                                      |
                                      v Conexão Direta (Supabase)
+---------------------------------------------------------------------------------+
|                                    Rauf_App                                     |
|  Tabela: retencoes_calc_impostos                                                |
|  - instituicao_id = 1                                                           |
|  - uasg = "155007"                                                              |
|  - numero_processo = "23525.025209/2026-18"                                     |
|  - documento_habil = "2026NS000123"                                             |
|                                                                                 |
|  API Rauf: GET /retencoes/ -> Filtra automatico: instituicao_id == tenant_id    |
|  Painel de Pagamentos: Cruza retenções da sua UG com as OBs emitidas            |
+---------------------------------------------------------------------------------+
```

---

## 3. Especificação das Mudanças

### 3.1. Banco de Dados (`schema.sql` e Supabase)
Adição de colunas na tabela `retencoes_calc_impostos`:
* `instituicao_id`: `INTEGER NULL REFERENCES instituicoes(id) ON DELETE SET NULL`
* `uasg`: `VARCHAR(6) NULL`
* Índice adicional: `idx_retencoes_instituicao ON retencoes_calc_impostos (instituicao_id, uasg)`
* Unicidade atualizada para respeitar a segregação por instituição: `uq_retencoes_inst_proc_dh_nota UNIQUE (instituicao_id, numero_processo, documento_habil, numero_nota)`

### 3.2. Backend do `calc_impostos`
1. **`raufIntegrationService.ts`:**
   * Adicionar método `listarInstituicoesRauf()` que realiza query direta no banco de dados do Supabase (`SELECT id, nome, cnpj, uasg, sigla FROM instituicoes WHERE ativo = true ORDER BY nome ASC`).
   * Atualizar o payload de `inserirOuAtualizarRetencao()` para receber `instituicaoId` e `uasg`.
2. **`server.ts`:**
   * Novo endpoint `GET /api/integracao/rauf/instituicoes`: disponibiliza para o frontend a lista de órgãos/instituições ativas no Rauf SaaS.
   * Atualização dos endpoints de análise e relatórios para receber a identidade do órgão ativo.
3. **`pdfReportGenerator.ts`:**
   * Cabeçalho dinâmico do relatório: imprimir o nome oficial do órgão, sigla, UASG e CNPJ configurados, eliminando valores estáticos.

### 3.3. Frontend do `calc_impostos`
1. **Modal / Gaveta "Identidade do Órgão (Unidade Gestora)":**
   * Exibição no cabeçalho do sistema com badge informativo do órgão ativo.
   * Permite selecionar uma das instituições sincronizadas do Rauf SaaS ou configurar manualmente os dados (Nome, CNPJ, UASG, Sigla, Município).
   * Armazenamento persistente no `localStorage` sob a chave `orgao_ativo_configurado`.
2. **Integração nas Telas:**
   * O órgão ativo selecionado preenche automaticamente o `destinatarioCnpj`, `destinatarioNome`, `uasg` e `instituicaoId` nas requisições.

### 3.4. Backend do `Rauf_App`
1. **`backend/app/models/retencao_imposto.py`:**
   * Adição dos atributos `instituicao_id = Column(Integer, ForeignKey("instituicoes.id"), nullable=True, index=True)` e `uasg = Column(String(6), nullable=True, index=True)`.
2. **`backend/app/routers/retencoes.py`:**
   * Injeção de dependência `tenant_id: int | None = Depends(get_tenant_id)`.
   * Filtragem de todas as rotas de listagem e consulta por processo/documento hábil pelo `tenant_id` do usuário logado (a menos que seja `superadmin`).

---

## 4. Cronograma de Execução

- [x] **Fase 1:** Elaboração e publicação do Plano de Implementação no repositório.
- [ ] **Fase 2:** Atualização do Schema SQL e Modelos ORM (`schema.sql` no `calc_impostos` e `retencao_imposto.py` no `Rauf_App`).
- [ ] **Fase 3:** Implementação no backend do `calc_impostos` (sincronização de instituições, suporte a tenant no UPSERT e PDF dinâmico).
- [ ] **Fase 4:** Implementação no frontend do `calc_impostos` (Seletor de Órgão/UASG, Badge de Identidade).
- [ ] **Fase 5:** Atualização do router `retencoes.py` no `Rauf_App` para aplicação da regra multi-tenant com `get_tenant_id`.
- [ ] **Fase 6:** Testes de build, compilação e commit/push em ambos os repositórios com relatório atualizado.
