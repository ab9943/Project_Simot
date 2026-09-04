-- CreateTable
CREATE TABLE "employees" (
    "employee_id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "manager_id" TEXT,
    "hire_date" DATETIME NOT NULL,
    CONSTRAINT "employees_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employees" ("employee_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "customers" (
    "customer_id" TEXT NOT NULL PRIMARY KEY,
    "company_name" TEXT NOT NULL,
    "contact_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "sales_rep_id" TEXT NOT NULL,
    CONSTRAINT "customers_sales_rep_id_fkey" FOREIGN KEY ("sales_rep_id") REFERENCES "employees" ("employee_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "daily_reports" (
    "report_id" TEXT NOT NULL PRIMARY KEY,
    "employee_id" TEXT NOT NULL,
    "report_date" DATETIME NOT NULL,
    "problem" TEXT,
    "plan" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "daily_reports_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees" ("employee_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "visit_records" (
    "visit_id" TEXT NOT NULL PRIMARY KEY,
    "report_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "visit_content" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    CONSTRAINT "visit_records_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "daily_reports" ("report_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "visit_records_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers" ("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "comments" (
    "comment_id" TEXT NOT NULL PRIMARY KEY,
    "report_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "comments_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "daily_reports" ("report_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "employees" ("employee_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_reports_employee_id_report_date_key" ON "daily_reports"("employee_id", "report_date");
