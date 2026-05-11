import { getRepository } from "@/lib/db/repository";

async function main() {
  await getRepository().resetAndSeed();
  console.log("Seeded runtime repository.");
}

void main();
