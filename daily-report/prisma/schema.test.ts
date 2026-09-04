import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "../src/generated/prisma/client";
import { seedDatabase } from "./seedData";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || "file:./prisma/test.db",
});
const prisma = new PrismaClient({ adapter });

beforeEach(async () => {
  await prisma.comment.deleteMany();
  await prisma.visitRecord.deleteMany();
  await prisma.dailyReport.deleteMany();
  await prisma.customer.deleteMany();
  // manager_id self-FK는 RESTRICT이므로, 참조가 남아있으면 삭제 순서에 따라 deleteMany가 실패할 수 있다.
  await prisma.employee.updateMany({ data: { managerId: null } });
  await prisma.employee.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("daily-report DB schema", () => {
  it("seeds employees with the manager self-relation", async () => {
    await seedDatabase(prisma);

    const rep = await prisma.employee.findUniqueOrThrow({
      where: { employeeId: "E1001" },
      include: { manager: true },
    });

    expect(rep.manager?.employeeId).toBe("E1000");
    expect(rep.manager?.name).toBe("김부장");
  });

  it("seeds a customer linked to its sales rep", async () => {
    await seedDatabase(prisma);

    const customer = await prisma.customer.findUniqueOrThrow({
      where: { customerId: "C2001" },
      include: { salesRep: true },
    });

    expect(customer.salesRep.employeeId).toBe("E1001");
  });

  it("rejects a second daily report for the same employee and date", async () => {
    await seedDatabase(prisma);

    await prisma.dailyReport.create({
      data: {
        reportId: "R30001",
        employeeId: "E1001",
        reportDate: new Date("2026-09-02"),
        problem: "A사 견적 승인 지연",
        plan: "B사 재방문",
      },
    });

    await expect(
      prisma.dailyReport.create({
        data: {
          reportId: "R30002",
          employeeId: "E1001",
          reportDate: new Date("2026-09-02"),
          problem: "다른 문제",
          plan: "다른 계획",
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("cascades visit records and comments when a daily report is deleted", async () => {
    await seedDatabase(prisma);

    await prisma.dailyReport.create({
      data: {
        reportId: "R30003",
        employeeId: "E1001",
        reportDate: new Date("2026-09-03"),
        visitRecords: {
          create: [{ visitId: "V40001", customerId: "C2001", visitContent: "신규 계약 협의", sequence: 1 }],
        },
        comments: {
          create: [{ commentId: "M50001", authorId: "E1000", content: "확인했습니다" }],
        },
      },
    });

    await prisma.dailyReport.delete({ where: { reportId: "R30003" } });

    expect(await prisma.visitRecord.findUnique({ where: { visitId: "V40001" } })).toBeNull();
    expect(await prisma.comment.findUnique({ where: { commentId: "M50001" } })).toBeNull();
  });

  it("blocks deleting an employee who has an existing daily report (TC-EMP-007)", async () => {
    await seedDatabase(prisma);

    await prisma.dailyReport.create({
      data: { reportId: "R30004", employeeId: "E1001", reportDate: new Date("2026-09-04") },
    });

    await expect(prisma.employee.delete({ where: { employeeId: "E1001" } })).rejects.toMatchObject({
      code: "P2003",
    });
  });

  it("blocks deleting an employee who has subordinates (TC-EMP-008)", async () => {
    await seedDatabase(prisma);

    await expect(prisma.employee.delete({ where: { employeeId: "E1000" } })).rejects.toMatchObject({
      code: "P2003",
    });
  });

  it("blocks deleting a customer who has an existing visit record (TC-CUST-006)", async () => {
    await seedDatabase(prisma);

    await prisma.dailyReport.create({
      data: {
        reportId: "R30005",
        employeeId: "E1001",
        reportDate: new Date("2026-09-05"),
        visitRecords: {
          create: [{ visitId: "V40002", customerId: "C2001", visitContent: "재계약 협의", sequence: 1 }],
        },
      },
    });

    await expect(prisma.customer.delete({ where: { customerId: "C2001" } })).rejects.toMatchObject({
      code: "P2003",
    });
  });
});
