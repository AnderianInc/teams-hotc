import type { NameTagOptions } from "./brotherPrinter";

/** Reprinting has no save callback: it must not alter attendance or issue a new code. */
export async function reprintKidsLabels(
  base: Omit<NameTagOptions, "copy">,
  verify: () => Promise<unknown>,
  print: (base: Omit<NameTagOptions, "copy">) => Promise<void>,
): Promise<void> {
  if (!base.securityCode.trim()) throw new Error("This check-in has no saved pickup code. Labels cannot be safely reprinted.");
  await verify();
  await print(base);
}

/** No transport can confirm that labels physically emerged; the operator must confirm. */
export async function runKidsPrintFlow(
  confirmed: boolean,
  print: () => Promise<void>,
  save: () => Promise<void>,
): Promise<"awaiting-confirmation" | "saved"> {
  if (!confirmed) {
    await print();
    return "awaiting-confirmation";
  }
  await save();
  return "saved";
}