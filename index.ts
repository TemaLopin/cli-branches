#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import prompts from "prompts";
import simpleGit from "simple-git";

const git = simpleGit();
const program = new Command();

program
  .name("branch-cli")
  .description("CLI для создания git-веток и переноса коммитов на uat")
  .option("-f, --from <branch>", "Базовая ветка (dev|uat)")
  .option("-t, --type <type>", "Тип ветки (feature|bugfix|hotfix)")
  .option("-n, --number <taskNumber>", "Номер задачи")
  .option("-d, --desc <description>", "Название ветки")
  .option("--uat", "Создать ветку от uat и перенести коммиты текущей ветки")
  .option("-p, --push", "Сразу пушить ветку")
  .parse(process.argv);

const options = program.opts();

async function askIfMissing() {
  if (options.uat) {
    const currentBranch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
    if (currentBranch.endsWith("-uat") || currentBranch === "uat") {
      options.branchName = currentBranch;
    } else {
      options.branchName = `${currentBranch}-uat`;
    }
    return;
  }

  const questions: prompts.PromptObject[] = [];

  if (!options.from) {
    questions.push({
      type: "select",
      name: "from",
      message: chalk.bold("🌿 От какой ветки создаём новую ветку?"),
      choices: [
        {
          title: `${chalk.green("🚀 dev")}  ${chalk.gray("— основная ветка для разработки")}`,
          value: "dev",
        },
        {
          title: `${chalk.magenta("🧪 uat")}  ${chalk.gray("— тестовая среда (user acceptance testing)")}`,
          value: "uat",
        },
      ],
    });
  }

  if (!options.type) {
    questions.push({
      type: "select",
      name: "type",
      message: chalk.bold("📦 Выберите тип ветки:"),
      choices: [
        { title: chalk.cyan("✨ feature"), value: "feature" },
        { title: chalk.yellow("🐞 bugfix"), value: "bugfix" },
        { title: chalk.red("🔥 hotfix"), value: "hotfix" },
      ],
    });
  }

  if (!options.number) {
    questions.push({
      type: "text",
      name: "number",
      message: chalk.bold("🔢 Введите номер задачи:"),
    });
  }

  if (!options.desc) {
    questions.push({
      type: "text",
      name: "desc",
      message: chalk.bold("📝 Введите название ветки:"),
    });
  }

  const answers = await prompts(questions);
  Object.assign(options, answers);

  if (!options.branchName) {
    options.branchName = `${options.type}/${options.number}/${options.desc}`;
  }
}

async function createBranch() {
  await askIfMissing();

  const branchName = options.branchName!;
  const push = !!options.push;

  try {
    await git.fetch();
    const currentBranch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();

    // 🧪 Обработка флага --uat
    if (options.uat) {
      // Проверка: уже находимся на UAT-ветке
      if (currentBranch.endsWith("-uat") || currentBranch === "uat") {
        console.log(chalk.yellow(`⚠️ Вы уже на UAT-ветке (${currentBranch}). Создание новой не требуется.`));
        process.exit(0);
      }

      const targetBranch = `${currentBranch}-uat`;
      const sourceBranch = currentBranch;
      const parentBranch = "dev";

      console.log(chalk.blue(`🔹 Текущая ветка: ${sourceBranch}`));
      console.log(chalk.blue(`🔹 Создаём ветку от origin/uat: ${targetBranch}`));

      // Проверяем наличие удалённой ветки origin/uat
      const remoteBranches = await git.branch(["-r"]);
      const hasRemoteUat = remoteBranches.all.some(b => b.trim().endsWith("origin/uat"));

      if (!hasRemoteUat) {
        console.error(chalk.red("❌ Удалённая ветка 'origin/uat' не найдена. Операция отменена."));
        process.exit(1);
      }

      // Пересоздаём локальную uat из origin/uat
      const localBranches = await git.branchLocal();
      if (localBranches.all.includes("uat")) {
        console.log(chalk.yellow("⚠️ Пересоздаём локальную ветку 'uat' из origin/uat..."));
        await git.branch(["-D", "uat"]);
      }

      console.log(chalk.gray("🔁 Создаём локальную ветку 'uat' от origin/uat..."));
      await git.checkout(["-b", "uat", "origin/uat"]);

      // Проверяем, существует ли целевая ветка
      const refreshedBranches = await git.branchLocal();
      if (refreshedBranches.all.includes(targetBranch)) {
        console.log(chalk.yellow(`⚠️ Ветка ${targetBranch} уже существует. Остаёмся на ${currentBranch}`));
        process.exit(0);
      }

      // Создаём новую ветку от uat
      await git.checkoutBranch(targetBranch, "uat");
      console.log(chalk.green(`✅ Ветка ${targetBranch} создана от origin/uat`));

      // Получаем только новые коммиты относительно dev
      const commits = await git.log({ from: parentBranch, to: sourceBranch });
      if (commits.all.length === 0) {
        console.log(chalk.green("✅ Нет новых коммитов для переноса."));
      } else {
        for (const commit of commits.all.reverse()) {
          console.log(chalk.yellow(`🔹 Перенос коммита ${commit.hash} в ${targetBranch}...`));
          await git.raw(["cherry-pick", commit.hash]);
        }
        console.log(chalk.green(`🎉 Все новые коммиты успешно перенесены в ${targetBranch}`));
      }

      if (push) {
        await git.push(["-u", "origin", targetBranch]);
        console.log(chalk.green(`🚀 Ветка запушена: ${targetBranch}`));
      }

      return;
    }

    // 🌿 Обычное создание ветки от dev/uat
    const fromBranch = options.from || "dev";
    await git.checkoutBranch(branchName, fromBranch);
    console.log(chalk.green(`✅ Ветка ${branchName} создана от ${fromBranch}`));

    if (push) {
      await git.push(["-u", "origin", branchName]);
      console.log(chalk.green(`🚀 Ветка запушена: ${branchName}`));
    }
  } catch (err: any) {
    console.error(chalk.red(`❌ Ошибка: ${err.message}`));
    process.exit(1);
  }
}

createBranch();
