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