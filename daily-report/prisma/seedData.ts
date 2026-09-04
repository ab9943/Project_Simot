import type { PrismaClient } from "../src/generated/prisma/client";

/**
 * test-spec.md의 "테스트 데이터 전제"와 동일한 데이터를 생성한다.
 * E1000(김부장, 상급자) > E1001(홍길동), E1002(박영희) / C2001은 E1001 담당.
 */
export async function seedDatabase(prisma: PrismaClient) {
  const manager = await prisma.employee.upsert({
    where: { employeeId: "E1000" },
    update: {},
    create: {
      employeeId: "E1000",
      name: "김부장",
      department: "영업1팀",
      position: "부장",
      hireDate: new Date("2015-03-01"),
    },
  });

  const rep1 = await prisma.employee.upsert({
    where: { employeeId: "E1001" },
    update: {},
    create: {
      employeeId: "E1001",
      name: "홍길동",
      department: "영업1팀",
      position: "대리",
      managerId: manager.employeeId,
      hireDate: new Date("2022-03-02"),
    },
  });

  const rep2 = await prisma.employee.upsert({
    where: { employeeId: "E1002" },
    update: {},
    create: {
      employeeId: "E1002",
      name: "박영희",
      department: "영업1팀",
      position: "사원",
      managerId: manager.employeeId,
      hireDate: new Date("2023-07-10"),
    },
  });

  const customer = await prisma.customer.upsert({
    where: { customerId: "C2001" },
    update: {},
    create: {
      customerId: "C2001",
      companyName: "㈜테스트상사",
      contactName: "이철수",
      phone: "02-1234-5678",
      address: "서울시 강남구 테헤란로 1",
      salesRepId: rep1.employeeId,
    },
  });

  return { manager, rep1, rep2, customer };
}
