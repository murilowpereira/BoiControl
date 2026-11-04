// Teste ponta a ponta do fluxo principal (seção 15 da spec): cadastro, brinco duplicado,
// pesagem online, pesagem offline, reabertura offline, reconexão e GMD na ficha.
// Rode com: npm run test:e2e  (precisa do Playwright com Chromium instalado na máquina)
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { spawn } from "node:child_process";

const shots = process.env.SAIDA ?? "/tmp";
const preview = spawn("npx", ["vite", "preview", "--port", "4173", "--strictPort", "--host", "127.0.0.1"], { cwd: new URL("../../apps/web", import.meta.url).pathname, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));
const log = (...a) => console.log("•", ...a);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("console", (m) => m.type() === "error" && console.log("CONSOLE", m.text().slice(0, 300)));
try {
  await page.goto("http://127.0.0.1:4173/");
  await page.getByLabel("E-mail").fill("admin@teste.com");
  await page.getByLabel("Senha").fill("senha123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByText("Animais ativos").waitFor({ timeout: 20000 });
  log("login ok");

  await page.locator("nav.abas").getByRole("link", { name: "Animais" }).click();
  await page.getByRole("link", { name: "+ Novo animal" }).click();
  await page.getByRole("heading", { name: "Novo animal" }).waitFor();
  await page.getByLabel("Brinco", { exact: true }).fill("a-001");
  await page.getByLabel("Categoria").selectOption({ label: "Garrote" });
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await page.getByRole("heading", { name: /A-001/ }).waitFor({ timeout: 30000 });
  log("animal criado:", await page.getByRole("heading").first().innerText());

  // brinco duplicado (CA-02)
  await page.goto("http://127.0.0.1:4173/animais/novo");
  await page.getByRole("heading", { name: "Novo animal" }).waitFor();
  await page.getByLabel("Brinco", { exact: true }).fill("A-001");
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await page.locator(".erro").waitFor({ timeout: 20000 });
  log("duplicado:", await page.locator(".erro").innerText());

  async function pesar(peso, quando) {
    await page.locator("nav.abas").getByRole("link", { name: "Pesar" }).click();
    await page.getByRole("heading", { name: "Registrar pesagem" }).waitFor();
    await page.getByLabel("Brinco", { exact: true }).fill("A-001");
    await page.getByLabel("Peso (kg)").fill(peso);
    await page.getByLabel("Data e hora da pesagem").fill(quando);
    await page.getByRole("button", { name: "Salvar pesagem" }).click();
    await page.locator(".aviso").waitFor();
    log("pesagem:", await page.locator(".aviso").innerText());
  }

  await pesar("320", "2026-09-01T08:00");
  await page.locator("nav.abas").getByRole("link", { name: "Painel" }).click();
  await page.locator(".selo-sincronizado").first().waitFor({ timeout: 30000 });
  log("online -> sincronizado");

  await ctx.setOffline(true);
  await page.waitForTimeout(500);
  await pesar("356,00", "2026-10-16T08:00");
  await page.locator("nav.abas").getByRole("link", { name: "Painel" }).click();
  await page.locator(".selo-pendente").first().waitFor({ timeout: 10000 });
  log("offline -> barra:", await page.locator(".barra-sync").innerText());
  await page.screenshot({ path: `${shots}/1-offline-pendente.png` });

  // Plano Spark: o GMD é calculado no aparelho, então aparece mesmo sem internet.
  await page.locator("nav.abas").getByRole("link", { name: "Animais" }).click();
  await page.getByLabel("Buscar brinco ou código").waitFor();
  await page.getByRole("link", { name: /A-001/ }).click();
  await page.getByText("0,800 kg/dia").first().waitFor({ timeout: 10000 });
  log("GMD calculado offline:", (await page.locator(".indicadores").innerText()).replace(/\s+/g, " "));
  await page.locator("nav.abas").getByRole("link", { name: "Painel" }).click();
  await page.locator(".selo-pendente").first().waitFor();

  await page.reload();
  await page.locator(".selo-pendente").first().waitFor({ timeout: 20000 });
  log("após reabrir offline ainda pendente (CA-10):", await page.locator(".barra-sync").innerText());

  await ctx.setOffline(false);
  await page.locator(".selo-pendente").first().waitFor({ state: "detached", timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll(".selo-sincronizado").length >= 2, null, { timeout: 60000 });
  log("reconectado -> sincronizado (CA-11):", await page.locator(".barra-sync").innerText());
  await page.screenshot({ path: `${shots}/2-painel.png` });

  await page.locator("nav.abas").getByRole("link", { name: "Animais" }).click();
  await page.getByLabel("Buscar brinco ou código").waitFor();
  await page.getByRole("link", { name: /A-001/ }).click();
  await page.getByText("0,800 kg/dia").first().waitFor({ timeout: 20000 });
  log("ficha GMD:", (await page.locator(".indicadores").innerText()).replace(/\s+/g, " "));
  await page.screenshot({ path: `${shots}/3-ficha.png`, fullPage: true });

  await page.locator("nav.abas").getByRole("link", { name: "Painel" }).click();
  await page.getByRole("link", { name: /Indicadores do rebanho/ }).click();
  await page.getByRole("heading", { name: "Indicadores do rebanho" }).waitFor();
  await page.getByText("Maiores ganhos").waitFor({ timeout: 10000 });
  log("indicadores:", (await page.locator(".ranking").innerText()).replace(/\s+/g, " "));
  log("previsão:", (await page.locator(".indicadores-pagina .lista").first().innerText()).replace(/\s+/g, " "));
  await page.screenshot({ path: `${shots}/4-indicadores.png`, fullPage: true });

  await page.locator("nav.abas").getByRole("link", { name: "Sobre" }).click();
  await page.getByRole("heading", { name: "Sobre o BoiControl" }).waitFor();
  log("sobre:", (await page.locator(".sobre-resumo").innerText()).replace(/\s+/g, " "));
  await page.screenshot({ path: `${shots}/5-sobre.png`, fullPage: false });

  // Vacinas: cadastro em Ajustes e duas vacinas marcadas na pesagem.
  await page.locator("nav.abas").getByRole("link", { name: "Ajustes" }).click();
  await page.getByRole("heading", { name: "Configurações" }).waitFor();
  for (const nome of ["Aftosa", "Raiva"]) {
    await page.getByLabel("Adicionar vacina").fill(nome);
    await page.getByLabel("Adicionar vacina").press("Enter");
    await page.getByText(`${nome} adicionado.`).waitFor({ timeout: 15000 });
  }
  // Estoque: insumo ligado à vacina Aftosa, com compra que vira despesa.
  await page.locator("nav.abas").getByRole("link", { name: "Painel" }).click();
  await page.getByRole("link", { name: /^Estoque/ }).click();
  await page.getByRole("heading", { name: "Estoque", exact: true }).waitFor();
  await page.getByLabel("Nome").fill("Aftosa 50 doses");
  await page.getByLabel("Tipo").selectOption("VACINA");
  await page.getByLabel("Unidade").selectOption("dose");
  await page.getByLabel(/Estoque mínimo/).fill("5");
  await page.getByLabel(/Baixa automática/).selectOption({ label: "Quando marcar Aftosa" });
  await page.getByLabel(/Quanto sai por animal/).fill("1");
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await page.getByText("Aftosa 50 doses cadastrado.").waitFor({ timeout: 15000 });
  await page.getByRole("combobox", { name: /^Insumo/ }).selectOption({ label: "Aftosa 50 doses (0 dose)" });
  await page.getByLabel(/Quantidade/).fill("50");
  await page.getByLabel(/Valor pago/).fill("400,00");
  await page.getByRole("button", { name: "Registrar" }).click();
  await page.getByText(/Despesa de R\$\s400,00 lançada/).waitFor({ timeout: 15000 });
  await page.locator(".insumo .direita").getByText("50 dose").waitFor({ timeout: 15000 });
  log("estoque:", (await page.locator(".estoque .lista").first().innerText()).replace(/\s+/g, " "));
  await page.screenshot({ path: `${shots}/7a-estoque.png`, fullPage: true });

  await page.locator("nav.abas").getByRole("link", { name: "Pesar" }).click();
  await page.getByRole("heading", { name: "Registrar pesagem" }).waitFor();
  await page.getByLabel("Brinco", { exact: true }).fill("A-001");
  await page.getByLabel("Peso (kg)").fill("366");
  await page.getByRole("button", { name: "Aftosa" }).click();
  await page.getByRole("button", { name: "Raiva" }).click();
  await page.screenshot({ path: `${shots}/7-pesar-vacinas.png`, fullPage: true });
  await page.getByRole("button", { name: "Salvar pesagem" }).click();
  await page.locator(".aviso.registro").getByText("Vacinas: Aftosa, Raiva").waitFor({ timeout: 10000 });
  log("pesagem com vacinas:", (await page.locator(".aviso.registro").innerText()).replace(/\s+/g, " "));
  await page.locator(".aviso.registro").getByText("Estoque de Aftosa 50 doses: restam 49 dose").waitFor({ timeout: 10000 });
  log("baixa automática no estoque: ok");
  await page.locator("nav.abas").getByRole("link", { name: "Animais" }).click();
  await page.getByRole("link", { name: /A-001/ }).click();
  await page.locator(".lista-vacinas").getByText("Vacinas: Aftosa, Raiva").waitFor({ timeout: 10000 });
  log("histórico com vacinas: ok");
  await page.screenshot({ path: `${shots}/8-ficha-vacinas.png`, fullPage: true });

  // Chuva: leituras do pluviômetro (offline) e comparação com o ganho em Indicadores.
  await page.locator("nav.abas").getByRole("link", { name: "Painel" }).click();
  await page.getByRole("link", { name: /^Chuva/ }).click();
  await page.getByRole("heading", { name: "Chuva", exact: true }).waitFor();
  for (const [data, mm] of [["2026-09-10", "35"], ["2026-10-05", "42,5"], ["2026-10-20", "60"]]) {
    await page.getByLabel("Data").fill(data);
    await page.getByLabel("Chuva (mm)").fill(mm);
    await page.getByRole("button", { name: "Salvar" }).click();
    await page.locator(".aviso").getByText("anotados").waitFor({ timeout: 10000 });
  }
  await page.getByText("102,5 mm").waitFor({ timeout: 10000 });
  log("chuva por mês:", (await page.locator(".chuva-pagina .lista").first().innerText()).replace(/\s+/g, " "));
  await page.screenshot({ path: `${shots}/9-chuva.png`, fullPage: true });
  await page.locator("nav.abas").getByRole("link", { name: "Painel" }).click();
  await page.getByRole("link", { name: /^Indicadores/ }).click();
  await page.getByRole("heading", { name: "Chuva e ganho de peso" }).waitFor();
  await page.locator("svg[aria-label='Chuva por mês e ganho médio diário do rebanho'] rect").first().waitFor({ timeout: 10000 });
  log("chuva × GMD:", (await page.locator(".lista.meses").last().innerText()).replace(/\s+/g, " "));
  await page.getByRole("heading", { name: "Chuva e ganho de peso" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/10-chuva-gmd.png`, fullPage: false });
  // Agenda sanitária: carência na vacina, aviso do animal e aplicação no lote.
  await page.locator("nav.abas").getByRole("link", { name: "Ajustes" }).click();
  const protocolo = page.locator("form.protocolo").filter({ hasText: "Aftosa" });
  await protocolo.getByLabel("Tipo").selectOption("VACINA");
  await protocolo.getByLabel("Carência (dias)").fill("30");
  await protocolo.getByLabel("Repetir a cada (dias)").fill("180");
  await protocolo.getByRole("button", { name: "Salvar" }).click();
  await page.getByText("Aftosa atualizado.").waitFor({ timeout: 15000 });
  await page.locator("nav.abas").getByRole("link", { name: "Painel" }).click();
  await page.getByRole("link", { name: /^Agenda sanitária/ }).click();
  await page.getByRole("heading", { name: "Agenda sanitária" }).waitFor();
  await page.locator(".alerta-carencia").getByText("A-001").waitFor({ timeout: 10000 });
  log("carência:", (await page.locator(".alerta-carencia").innerText()).replace(/\s+/g, " "));
  await page.getByRole("button", { name: "Registrar aplicação", exact: true }).click();
  await page.getByLabel("Vacina ou vermífugo").selectOption({ label: "Raiva" });
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page.getByText(/Raiva registrado em \d+ animal/).waitFor({ timeout: 10000 });
  await page.locator(".linha-grupo").getByText(/Raiva · \d+ animal/).waitFor({ timeout: 10000 });
  log("aplicação no lote: ok");
  await page.screenshot({ path: `${shots}/9-agenda-sanitaria.png`, fullPage: true });
  await page.locator("nav.abas").getByRole("link", { name: "Animais" }).click();
  await page.getByRole("link", { name: /A-001/ }).click();
  await page.locator(".alerta-carencia").getByText(/Em carência de Aftosa/).waitFor({ timeout: 10000 });
  log("ficha com carência: ok");

  // Pastos: lote criado em Ajustes, animal no lote, pasto com área e lote no pasto.
  await page.locator("nav.abas").getByRole("link", { name: "Ajustes" }).click();
  await page.getByLabel("Adicionar lote").fill("Engorda");
  await page.getByLabel("Adicionar lote").press("Enter");
  await page.getByText("Engorda adicionado.").waitFor({ timeout: 15000 });
  await page.locator("nav.abas").getByRole("link", { name: "Animais" }).click();
  await page.getByRole("link", { name: /A-001/ }).click();
  await page.getByLabel("Lote deste animal").selectOption({ label: "Engorda" });
  await page.locator("nav.abas").getByRole("link", { name: "Painel" }).click();
  await page.getByRole("link", { name: /^Pastos e piquetes/ }).click();
  await page.getByRole("heading", { name: "Pastos e piquetes" }).waitFor();
  for (const [nome, area] of [["Piquete 1", "0,5"], ["Piquete 2", "2,5"]]) {
    await page.getByLabel("Nome do pasto").fill(nome);
    await page.getByLabel("Área em hectares").fill(area);
    await page.getByRole("button", { name: "Adicionar" }).click();
    await page.getByText(`${nome} adicionado.`).waitFor({ timeout: 15000 });
  }
  const escolherLote = page.locator("form").filter({ hasText: "Vai para" }).locator("select").first();
  log("lotes na mudança:", (await escolherLote.innerText()).replace(/\s+/g, " "));
  await escolherLote.selectOption("engorda");
  await page.getByLabel("Vai para").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Registrar mudança" }).click();
  await page.getByText(/Engorda foi para/).waitFor({ timeout: 15000 });
  await page.locator(".pasto").filter({ hasText: "UA/ha" }).first().waitFor({ timeout: 15000 });
  log("pastos:", (await page.locator(".pasto").first().innerText()).replace(/\s+/g, " "));
  await page.getByRole("button", { name: /Histórico de rotação/ }).click();
  await page.screenshot({ path: `${shots}/10-pastos.png`, fullPage: true });

  // Financeiro: despesa lançada e venda do animal com valor.
  await page.locator("nav.abas").getByRole("link", { name: "Painel" }).click();
  await page.getByRole("link", { name: /^Financeiro/ }).click();
  await page.getByRole("heading", { name: "Financeiro" }).waitFor();
  await page.getByLabel("Tipo").selectOption("RACAO");
  await page.getByLabel("Valor", { exact: true }).fill("950,00");
  await page.getByLabel("Descrição (opcional)").fill("10 sacos de ração");
  await page.getByRole("button", { name: "Lançar" }).click();
  await page.getByText("10 sacos de ração").first().waitFor({ timeout: 15000 });
  log("despesa:", (await page.locator(".financeiro .indicadores").innerText()).replace(/\s+/g, " "));

  await page.locator("nav.abas").getByRole("link", { name: "Animais" }).click();
  await page.getByRole("link", { name: /A-001/ }).click();
  await page.getByRole("button", { name: "Alterar valores" }).click();
  await page.getByLabel("Valor pago").fill("2.850,00");
  await page.getByRole("button", { name: "Salvar valores" }).click();
  await page.getByText("Valores atualizados.").waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Marcar como vendido" }).click();
  await page.getByLabel("Valor de venda").fill("4.500,00");
  await page.getByRole("button", { name: "Confirmar" }).click();
  await page.getByText("Venda registrada").waitFor({ timeout: 15000 });
  log("valores do animal:", (await page.locator(".valores-animal").innerText()).replace(/\s+/g, " "));

  await page.locator("nav.abas").getByRole("link", { name: "Painel" }).click();
  await page.getByRole("link", { name: /^Financeiro/ }).click();
  await page.getByText("Animais vendidos no período").waitFor({ timeout: 15000 });
  log("financeiro:", (await page.locator(".financeiro .indicadores").innerText()).replace(/\s+/g, " "));
  await page.screenshot({ path: `${shots}/6-financeiro.png`, fullPage: true });
} catch (e) {
  console.log("FALHOU:", e.message);
  await page.screenshot({ path: `${shots}/erro.png`, fullPage: true });
  process.exitCode = 1;
} finally {
  await browser.close();
  preview.kill();
}
