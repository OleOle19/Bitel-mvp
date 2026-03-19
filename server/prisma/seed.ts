import { PrismaClient, Role } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = "admin@bitel.local";
  const localsData = [
    { code: "LALDA67", name: "Pueblo Nuevo", address: "Pueblo Nuevo" },
    { code: "JEQ01", name: "San Pedro", address: "San Pedro" },
    { code: "JEQ02", name: "San Juan", address: "San Juan" },
    { code: "JEQ03", name: "Guadalupe", address: "Guadalupe" },
    { code: "JEQ04", name: "Pacasmayo", address: "Pacasmayo" },
    { code: "JEQ05", name: "Chocope", address: "Chocope" },
    { code: "JEQ06", name: "Chepen", address: "Chepen" },
    { code: "JEQ07", name: "Tembladera", address: "Tembladera" }
  ];

  const locals = await Promise.all(
    localsData.map((data) =>
      prisma.local.upsert({
        where: { code: data.code },
        update: {},
        create: data
      })
    )
  );

  const allowedCodes = localsData.map((loc) => loc.code);
  await prisma.local.updateMany({
    where: { code: { notIn: allowedCodes } },
    data: { active: false }
  });

  const passwordHash = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      fullName: "Administrador",
      passwordHash,
      role: Role.ADMIN
    }
  });

  const demoPasswordHash = await bcrypt.hash("demo123", 10);
  const demoUsers = [
    { email: "vendedor.pn@bitel.local", fullName: "Vendedor Pueblo Nuevo", role: Role.VENDEDOR, localCode: "LALDA67" },
    { email: "vendedor.sp@bitel.local", fullName: "Vendedor San Pedro", role: Role.VENDEDOR, localCode: "JEQ01" },
    { email: "vendedor.sj@bitel.local", fullName: "Vendedor San Juan", role: Role.VENDEDOR, localCode: "JEQ02" },
    { email: "vendedor.gu@bitel.local", fullName: "Vendedor Guadalupe", role: Role.VENDEDOR, localCode: "JEQ03" },
    { email: "vendedor.pa@bitel.local", fullName: "Vendedor Pacasmayo", role: Role.VENDEDOR, localCode: "JEQ04" },
    { email: "vendedor.ch@bitel.local", fullName: "Vendedor Chocope", role: Role.VENDEDOR, localCode: "JEQ05" },
    { email: "vendedor.ce@bitel.local", fullName: "Vendedor Chepen", role: Role.VENDEDOR, localCode: "JEQ06" },
    { email: "vendedor.te@bitel.local", fullName: "Vendedor Tembladera", role: Role.VENDEDOR, localCode: "JEQ07" },
    { email: "vendedora.pn@bitel.local", fullName: "Vendedora Pueblo Nuevo", role: Role.VENDEDOR, localCode: "LALDA67" },
    { email: "almacen.pn@bitel.local", fullName: "Almacen Pueblo Nuevo", role: Role.ALMACEN, localCode: "LALDA67" },
    { email: "auditor@bitel.local", fullName: "Auditor General", role: Role.AUDITOR }
  ];

  for (const user of demoUsers) {
    const localId = user.localCode
      ? locals.find((loc) => loc.code === user.localCode)?.id
      : undefined;
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: {
        email: user.email,
        fullName: user.fullName,
        passwordHash: demoPasswordHash,
        role: user.role,
        localId
      }
    });
  }

  const demoClients = [
    { fullName: "Ana Ruiz", documentId: "45123456", phone: "999111222", localCode: "LALDA67", line: "989111222" },
    { fullName: "Carlos Mena", documentId: "47890123", phone: "999333444", localCode: "LALDA67", line: "989333444" },
    { fullName: "Lucia Chavez", documentId: "70234567", phone: "988222333", localCode: "JEQ01", line: "988222333" },
    { fullName: "Diego Soto", documentId: "71234589", phone: "988444555", localCode: "JEQ01", line: "988444555" },
    { fullName: "Paola Rios", documentId: "73234561", phone: "987222111", localCode: "JEQ02", line: "987222111" },
    { fullName: "Jorge Salas", documentId: "74512367", phone: "987333666", localCode: "JEQ02", line: "987333666" },
    { fullName: "Sofia Diaz", documentId: "76890123", phone: "986111777", localCode: "JEQ03", line: "986111777" },
    { fullName: "Bruno Paredes", documentId: "77654321", phone: "986222888", localCode: "JEQ03", line: "986222888" },
    { fullName: "Mariana Vela", documentId: "78543219", phone: "985111999", localCode: "JEQ04", line: "985111999" },
    { fullName: "Luis Vega", documentId: "70894321", phone: "988445566", localCode: "JEQ05", line: "988445566" },
    { fullName: "Maria Torres", documentId: "45781236", phone: "999222111", localCode: "JEQ06", line: "999222111" },
    { fullName: "Kevin Ramos", documentId: "79432109", phone: "984333222", localCode: "JEQ07", line: "984333222" }
  ];

  for (const client of demoClients) {
    const localId = client.localCode
      ? locals.find((loc) => loc.code === client.localCode)?.id
      : undefined;
    const orFilters = [];
    if (client.documentId) orFilters.push({ documentId: client.documentId });
    if (client.phone) orFilters.push({ phone: client.phone });
    const existingClient =
      orFilters.length > 0
        ? await prisma.client.findFirst({ where: { OR: orFilters } })
        : null;
    const ensuredClient =
      existingClient ??
      (await prisma.client.create({
        data: {
          fullName: client.fullName,
          documentId: client.documentId,
          phone: client.phone,
          localId
        }
      }));

    if (client.line) {
      await prisma.clientLine.upsert({
        where: { number: client.line },
        update: { clientId: ensuredClient.id },
        create: { number: client.line, clientId: ensuredClient.id }
      });
    }
  }

  const demoItems = [
    { sku: "SIM-PREP", name: "SIM Prepago", category: "SIM", cost: 1, price: 5, minStock: 20 },
    { sku: "SIM-POST", name: "SIM Postpago", category: "SIM", cost: 1, price: 5, minStock: 20 },
    { sku: "SIM-5G", name: "SIM 5G", category: "SIM", cost: 2, price: 8, minStock: 15 },
    { sku: "SIM-DAT", name: "SIM Datos", category: "SIM", cost: 2, price: 10, minStock: 15 },
    { sku: "REC-5", name: "Recarga S/ 5", category: "Recargas", cost: 3, price: 5, minStock: 30 },
    { sku: "REC-10", name: "Recarga S/ 10", category: "Recargas", cost: 7, price: 10, minStock: 25 },
    { sku: "REC-20", name: "Recarga S/ 20", category: "Recargas", cost: 15, price: 20, minStock: 20 },
    { sku: "REC-50", name: "Recarga S/ 50", category: "Recargas", cost: 38, price: 50, minStock: 15 },
    { sku: "PHONE-A1", name: "Telefono A1", category: "Equipos", cost: 250, price: 320, minStock: 3 },
    { sku: "PHONE-A2", name: "Telefono A2", category: "Equipos", cost: 320, price: 420, minStock: 3 },
    { sku: "PHONE-A3", name: "Telefono A3", category: "Equipos", cost: 390, price: 520, minStock: 3 },
    { sku: "PHONE-PRO", name: "Telefono Pro", category: "Equipos", cost: 620, price: 820, minStock: 2 },
    { sku: "TABLET-T1", name: "Tablet T1", category: "Equipos", cost: 380, price: 520, minStock: 2 },
    { sku: "TABLET-T2", name: "Tablet T2", category: "Equipos", cost: 460, price: 620, minStock: 2 },
    { sku: "ROUT-4G", name: "Router 4G", category: "Equipos", cost: 120, price: 180, minStock: 4 },
    { sku: "ROUT-5G", name: "Router 5G", category: "Equipos", cost: 220, price: 320, minStock: 3 },
    { sku: "MODEM-USB", name: "Modem USB", category: "Equipos", cost: 45, price: 85, minStock: 6 },
    { sku: "AURIC-01", name: "Auricular Basico", category: "Accesorios", cost: 8, price: 20, minStock: 10 },
    { sku: "AURIC-02", name: "Auricular Bluetooth", category: "Accesorios", cost: 35, price: 65, minStock: 8 },
    { sku: "CARG-USB", name: "Cargador USB", category: "Accesorios", cost: 6, price: 15, minStock: 10 },
    { sku: "CARG-USBC", name: "Cargador USB-C", category: "Accesorios", cost: 12, price: 25, minStock: 10 },
    { sku: "CARG-FAST", name: "Cargador Rapido 20W", category: "Accesorios", cost: 18, price: 35, minStock: 8 },
    { sku: "CASE-SIL", name: "Case Silicona", category: "Accesorios", cost: 4, price: 12, minStock: 15 },
    { sku: "CASE-PRO", name: "Case Pro", category: "Accesorios", cost: 10, price: 22, minStock: 12 },
    { sku: "GLASS-9H", name: "Vidrio Templado 9H", category: "Accesorios", cost: 3, price: 10, minStock: 20 },
    { sku: "POWER-10K", name: "Powerbank 10000mAh", category: "Accesorios", cost: 38, price: 70, minStock: 6 },
    { sku: "POWER-20K", name: "Powerbank 20000mAh", category: "Accesorios", cost: 60, price: 110, minStock: 4 },
    { sku: "SPEAKER-BT", name: "Parlante Bluetooth", category: "Accesorios", cost: 40, price: 75, minStock: 5 },
    { sku: "CABLE-USB", name: "Cable USB", category: "Accesorios", cost: 3, price: 8, minStock: 20 },
    { sku: "CABLE-USBC", name: "Cable USB-C", category: "Accesorios", cost: 4, price: 10, minStock: 20 }
  ];

  for (const loc of locals) {
    for (const item of demoItems) {
      await prisma.inventoryItem.upsert({
        where: { localId_sku: { localId: loc.id, sku: item.sku } },
        update: {},
        create: {
          localId: loc.id,
          sku: item.sku,
          name: item.name,
          category: item.category,
          quantity: Math.floor(Math.random() * 15) + item.minStock,
          minStock: item.minStock,
          cost: item.cost,
          price: item.price
        }
      });
    }
  }

  // Seed a small activity trail for demo (cash + sales + client account).
  const existingSales = await prisma.sale.count();
  if (existingSales === 0) {
    const local = locals.find((l) => l.code === "LALDA67") ?? locals[0];
    const vendor = await prisma.user.findFirst({
      where: { role: Role.VENDEDOR, localId: local?.id ?? undefined }
    });
    const client = await prisma.client.findFirst({});
    if (local && vendor) {
      const cash = await prisma.cashSession.create({
        data: {
          localId: local.id,
          userId: vendor.id,
          openingAmount: 139
        }
      });

      await prisma.activityLog.create({
        data: {
          action: "cash.open",
          entity: "CashSession",
          entityId: cash.id,
          userId: vendor.id,
          localId: local.id
        }
      });

      await prisma.activityLog.create({
        data: {
          action: "cash.tx.create",
          entity: "CashSession",
          entityId: cash.id,
          userId: vendor.id,
          localId: local.id,
          meta: { type: "EXPENSE", amount: 10, signedAmount: -10, reason: "Gastos varios" }
        }
      });

      const itemRec = await prisma.inventoryItem.findUnique({
        where: { localId_sku: { localId: local.id, sku: "REC-10" } }
      });
      const itemAcc = await prisma.inventoryItem.findUnique({
        where: { localId_sku: { localId: local.id, sku: "CARG-FAST" } }
      });
      if (itemRec && itemAcc) {
        const receiptType = "BOLETA_FISICA";
        const sequence = await prisma.receiptSequence.upsert({
          where: { localId_receiptType: { localId: local.id, receiptType: receiptType as any } },
          update: { currentNumber: { increment: 1 } },
          create: { localId: local.id, receiptType: receiptType as any, currentNumber: 1 }
        });
        const receiptNumber = `F001-${String(sequence.currentNumber).padStart(6, "0")}`;

        const sale = await prisma.sale.create({
          data: {
            localId: local.id,
            userId: vendor.id,
            cashSessionId: cash.id,
            clientId: client?.id,
            type: "PRODUCT" as any,
            method: "CASH" as any,
            subTotal: 55,
            discountTotal: 0,
            total: 55,
            receiptType: receiptType as any,
            receiptNumber,
            items: {
              create: [
                {
                  itemId: itemRec.id,
                  description: itemRec.name,
                  quantity: 1,
                  unitPrice: 10,
                  discountAmount: 0
                },
                {
                  itemId: itemAcc.id,
                  description: itemAcc.name,
                  quantity: 1,
                  unitPrice: 45,
                  discountAmount: 0
                }
              ]
            }
          }
        });

        await prisma.inventoryItem.update({
          where: { id: itemRec.id },
          data: { quantity: { decrement: 1 } }
        });
        await prisma.inventoryItem.update({
          where: { id: itemAcc.id },
          data: { quantity: { decrement: 1 } }
        });

        await prisma.activityLog.create({
          data: {
            action: "sale.create",
            entity: "Sale",
            entityId: sale.id,
            userId: vendor.id,
            localId: local.id,
            meta: { total: 55 }
          }
        });

        await prisma.cashSession.update({
          where: { id: cash.id },
          data: {
            status: "CLOSED",
            closedAt: new Date(),
            closingAmount: 188,
            expectedAmount: 184,
            difference: 4,
            approvedById: vendor.id
          }
        });

        await prisma.activityLog.create({
          data: {
            action: "cash.close",
            entity: "CashSession",
            entityId: cash.id,
            userId: vendor.id,
            localId: local.id,
            meta: { expectedAmount: 184, difference: 4, transactionsTotal: -10 }
          }
        });
      }
    }

    if (client) {
      await prisma.activityLog.create({
        data: {
          action: "client.account.debt",
          entity: "Client",
          entityId: client.id,
          meta: { amount: 20, signedAmount: 20, note: "Saldo pendiente demo" }
        }
      });
      await prisma.activityLog.create({
        data: {
          action: "client.account.payment",
          entity: "Client",
          entityId: client.id,
          meta: { amount: 10, signedAmount: -10, note: "Pago parcial demo" }
        }
      });
    }
  }
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
