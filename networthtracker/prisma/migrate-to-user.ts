import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🚀 开始建立初始用户...");

  const existingUser = await prisma.user.findFirst();
  if (existingUser) {
    console.log("✅ 已有用户存在，跳过。");
    return;
  }

  const hashedPassword = await bcrypt.hash("TempPassword123!", 10);

  const user = await prisma.user.create({
    data: {
      email: "admin@networth.local",
      passwordHash: hashedPassword,
      emailVerified: true,
    },
  });

  console.log(`✅ 创建初始用户: ${user.email} (ID: ${user.id})`);
  console.log("\n========================================");
  console.log("🎉 完成！");
  console.log("========================================");
  console.log(`\n初始用户信息：`);
  console.log(`  邮箱：${user.email}`);
  console.log(`  密码：TempPassword123!`);
  console.log(`\n⚠️  请登入后修改密码！\n`);
}

main()
  .catch((e) => {
    console.error("❌ 失败:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });