import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import {
  assignEventValues,
  calculateTransfersInfo,
} from "../../../src/controllers/events.js";
import {
  IPurchaseReceiptWithUsers,
  IUserBalance,
} from "../../../src/models/interfaces.js";

// Estas dos funciones son el núcleo del negocio (quién le debe cuánto a quién).
// Los casos fijan el resultado EXACTO actual, incluido el orden y el redondeo.

interface Person {
  _id: mongoose.Types.ObjectId;
  name: string;
  lastName: string;
  cbu: string | null;
  alias: string | null;
}

function person(name: string): Person {
  return {
    _id: new mongoose.Types.ObjectId(),
    name,
    lastName: `${name}son`,
    cbu: `cbu-${name}`,
    alias: `alias.${name.toLowerCase()}`,
  };
}

function receipt(amount: number, designee: Person, participants: Person[]): IPurchaseReceiptWithUsers {
  return { amount, shoppingDesignee: designee, participants } as unknown as IPurchaseReceiptWithUsers;
}

function balance(p: Person, totalCost: number): IUserBalance {
  return {
    userId: p._id,
    userName: p.name,
    userLastName: p.lastName,
    userCbu: p.cbu as string,
    userAlias: p.alias as string,
    totalCost,
  };
}

function receiverOf(p: Person) {
  return {
    receiverId: p._id,
    receiverName: p.name,
    receiverLastName: p.lastName,
    receiverCbu: p.cbu,
    receiverAlias: p.alias,
  };
}

const ana = person("Ana");
const beto = person("Beto");
const caro = person("Caro");
const dani = person("Dani");

describe("assignEventValues", () => {
  it("devuelve [] si no hay comprobantes", () => {
    expect(assignEventValues([])).toEqual([]);
  });

  it("el comprador que también participa queda con saldo a favor = total - su parte", () => {
    const result = assignEventValues([receipt(300, ana, [ana, beto, caro])]);
    expect(result).toEqual([balance(ana, 200), balance(beto, -100), balance(caro, -100)]);
  });

  it("el comprador que no participa queda con saldo a favor = total, y se agrega al final", () => {
    const result = assignEventValues([receipt(100, ana, [beto, caro])]);
    expect(result).toEqual([balance(beto, -50), balance(caro, -50), balance(ana, 100)]);
  });

  it("si el comprador es el único participante su saldo es 0", () => {
    expect(assignEventValues([receipt(50, ana, [ana])])).toEqual([balance(ana, 0)]);
  });

  it("redondea la parte de cada uno a 2 decimales y acredita solo el total redondeado", () => {
    // 100 / 3 = 33.333.. -> 33.33 ; el comprador recibe 33.33 * 3 = 99.99 (no 100)
    const result = assignEventValues([receipt(100, ana, [ana, beto, caro])]);
    expect(result).toEqual([balance(ana, 66.66), balance(beto, -33.33), balance(caro, -33.33)]);
    const sum = result.reduce((acc, b) => acc + b.totalCost, 0);
    expect(Number(sum.toFixed(2))).toBe(0);
  });

  it("redondea hacia arriba cuando corresponde (2/3 = 0.67)", () => {
    const result = assignEventValues([receipt(2, ana, [beto, caro, dani])]);
    expect(result).toEqual([
      balance(beto, -0.67),
      balance(caro, -0.67),
      balance(dani, -0.67),
      balance(ana, 2.01),
    ]);
  });

  it("acumula saldos a través de varios comprobantes y varios compradores", () => {
    const result = assignEventValues([
      receipt(120, ana, [ana, beto, caro, dani]), // 30 c/u
      receipt(60, beto, [beto, caro, dani]), // 20 c/u
    ]);
    expect(result).toEqual([
      balance(ana, 90),
      balance(beto, 10),
      balance(caro, -50),
      balance(dani, -50),
    ]);
  });

  it("compara usuarios por _id (no por referencia de objeto)", () => {
    const anaCopy: Person = { ...ana, _id: new mongoose.Types.ObjectId(ana._id.toString()) };
    const result = assignEventValues([receipt(100, ana, [anaCopy, beto])]);
    expect(result).toHaveLength(2);
    expect(result[0].totalCost).toBe(50);
  });

  it("copia nombre, apellido, cbu y alias del usuario la primera vez que aparece", () => {
    const sinDatos: Person = { ...person("Eze"), lastName: undefined as unknown as string, cbu: null, alias: null };
    const [entry] = assignEventValues([receipt(10, ana, [sinDatos])]);
    expect(entry).toEqual({
      userId: sinDatos._id,
      userName: "Eze",
      userLastName: undefined,
      userCbu: null,
      userAlias: null,
      totalCost: -10,
    });
  });

  it("un comprobante sin participantes deja el saldo del comprador en NaN (división por cero)", () => {
    const result = assignEventValues([receipt(100, ana, [])]);
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe(ana._id);
    expect(result[0].totalCost).toBeNaN();
  });

  it("tolera montos 0", () => {
    expect(assignEventValues([receipt(0, ana, [ana, beto])])).toEqual([balance(ana, 0), balance(beto, -0)]);
  });
});

describe("calculateTransfersInfo", () => {
  it("devuelve [] para una lista vacía", () => {
    expect(calculateTransfersInfo([])).toEqual([]);
  });

  it("caso simple: cada deudor le transfiere al acreedor, y el acreedor queda con receiver null y amount 0", () => {
    const result = calculateTransfersInfo([balance(ana, 200), balance(beto, -100), balance(caro, -100)]);
    expect(result).toEqual([
      { userId: beto._id, userName: "Beto", amount: 100, receiver: receiverOf(ana) },
      { userId: caro._id, userName: "Caro", amount: 100, receiver: receiverOf(ana) },
      { userId: ana._id, userName: "Ana", amount: 0, receiver: null },
    ]);
  });

  it("los usuarios con saldo 0 aparecen con receiver null", () => {
    expect(calculateTransfersInfo([balance(ana, 0)])).toEqual([
      { userId: ana._id, userName: "Ana", amount: 0, receiver: null },
    ]);
  });

  it("siempre empieza por el mayor deudor y le paga TODA su deuda al mayor acreedor (algoritmo greedy)", () => {
    // ana +90, beto +10, caro -50, dani -50
    const result = calculateTransfersInfo([
      balance(ana, 90),
      balance(beto, 10),
      balance(caro, -50),
      balance(dani, -50),
    ]);
    // Caro y Dani le pagan 50 a Ana (100 en total), Ana queda debiendo 10 y se los paga a Beto.
    expect(result).toEqual([
      { userId: caro._id, userName: "Caro", amount: 50, receiver: receiverOf(ana) },
      { userId: dani._id, userName: "Dani", amount: 50, receiver: receiverOf(ana) },
      { userId: ana._id, userName: "Ana", amount: 10, receiver: receiverOf(beto) },
      { userId: beto._id, userName: "Beto", amount: 0, receiver: null },
    ]);
  });

  it("con acreedores empatados el receptor es el último en el orden original (sort estable)", () => {
    const result = calculateTransfersInfo([balance(ana, 10), balance(beto, 10), balance(caro, -20)]);
    expect(result).toEqual([
      { userId: caro._id, userName: "Caro", amount: 20, receiver: receiverOf(beto) },
      { userId: beto._id, userName: "Beto", amount: 10, receiver: receiverOf(ana) },
      { userId: ana._id, userName: "Ana", amount: 0, receiver: null },
    ]);
  });

  it("mantiene 2 decimales al actualizar el saldo del receptor", () => {
    const result = calculateTransfersInfo([balance(ana, 66.66), balance(beto, -33.33), balance(caro, -33.33)]);
    expect(result.map((t) => t.amount)).toEqual([33.33, 33.33, 0]);
    expect(result[2].receiver).toBeNull();
  });

  it("con saldos que no suman 0, el último acreedor 'se paga a sí mismo' con monto negativo", () => {
    const result = calculateTransfersInfo([balance(ana, 5)]);
    expect(result).toEqual([{ userId: ana._id, userName: "Ana", amount: -5, receiver: receiverOf(ana) }]);
  });

  it("vacía (muta) el array recibido", () => {
    const input = [balance(ana, 100), balance(beto, -100)];
    calculateTransfersInfo(input);
    expect(input).toHaveLength(0);
  });

  it("combinado con assignEventValues: resultado completo de un asado típico", () => {
    // Ana compró carne por 3000 para los 4; Beto compró bebidas por 1000 para todos menos Dani.
    const balances = assignEventValues([
      receipt(3000, ana, [ana, beto, caro, dani]),
      receipt(1000, beto, [ana, beto, caro]),
    ]);
    // 3000 / 4 = 750 ; 1000 / 3 = 333.33 (Beto recibe 999.99)
    // ana:  -750 + 3000 - 333.33        = 1916.67
    // beto: -750 - 333.33 + 999.99      =  -83.34
    // caro: -750 - 333.33               = -1083.33
    // dani: -750
    expect(balances).toEqual([
      balance(ana, 1916.67),
      balance(beto, -83.34),
      balance(caro, -1083.33),
      balance(dani, -750),
    ]);
    const transfers = calculateTransfersInfo(balances);
    expect(transfers).toEqual([
      { userId: caro._id, userName: "Caro", amount: 1083.33, receiver: receiverOf(ana) },
      { userId: dani._id, userName: "Dani", amount: 750, receiver: receiverOf(ana) },
      { userId: beto._id, userName: "Beto", amount: 83.34, receiver: receiverOf(ana) },
      { userId: ana._id, userName: "Ana", amount: 0, receiver: null },
    ]);
  });
});
