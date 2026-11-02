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
