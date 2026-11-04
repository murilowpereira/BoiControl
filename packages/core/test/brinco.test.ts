import { describe, expect, it } from "vitest";
import { acharPorLeitura } from "../src/index.js";

const animais = [
  { id: "doc-a", brinco: "A-12", codigoNumero: 1 },
  { id: "doc-b", brinco: "0457", codigoNumero: 2 },
  { id: "doc-c", brinco: "982000123456789", codigoNumero: 3 },
];

describe("acharPorLeitura", () => {
  it("acha pelo brinco, sem diferenciar maiúsculas e ignorando espaços", () => {
    expect(acharPorLeitura("  a-12\n", animais)?.id).toBe("doc-a");
    expect(acharPorLeitura("982000123456789", animais)?.id).toBe("doc-c");
  });
  it("acha pelo código BC", () => {
    expect(acharPorLeitura("bc-0002", animais)?.id).toBe("doc-b");
  });
  it("ignora zeros à esquerda de códigos numéricos", () => {
    expect(acharPorLeitura("457", animais)?.id).toBe("doc-b");
    expect(acharPorLeitura("0000457", animais)?.id).toBe("doc-b");
  });
  it("não escolhe quando o número sem zeros é ambíguo", () => {
    const dois = [...animais, { id: "doc-d", brinco: "457", codigoNumero: 4 }];
    expect(acharPorLeitura("457", dois)?.id).toBe("doc-d");
    expect(acharPorLeitura("00457", dois)).toBeNull();
  });
  it("entende um link do app numa etiqueta", () => {
    expect(acharPorLeitura("https://boi-controle.web.app/animais/doc-c", animais)?.id).toBe("doc-c");
    expect(acharPorLeitura("https://boi-controle.web.app/pesar?animal=doc-a", animais)?.id).toBe("doc-a");
  });
  it("devolve null quando nada corresponde", () => {
    expect(acharPorLeitura("", animais)).toBeNull();
    expect(acharPorLeitura("ZZZ", animais)).toBeNull();
  });
});
